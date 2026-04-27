using System.Collections.Concurrent;
using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Services;

/// <summary>
/// 處理 OvenDataReceive 推送的資料：
/// 1. 查 / 建 Devices 表，更新 LastSeen
/// 2. 若尚未綁定 AssetCode → 僅心跳，不寫 SensorReadings
/// 3. 寫入 SensorReadings（受 A1 gating 過濾）
/// 4. 比對 UCL/LCL，產生 SensorAlerts
/// 5. 企業微信通知（Mock）
/// 6. 廣播 SSE 給 Dashboard
/// </summary>
public class DataIngestionService(
    IDbContextFactory<IoTDbContext> dbFactory,
    FasApiService fasService,
    WeChatService weChatService,
    SseHub sseHub,
    ILatestReadingCache latestCache,
    GatingEvaluator gatingEvaluator,
    ILogger<DataIngestionService> logger)
{
    // 記錄每個 (AssetCode, SensorId) 的上一次 status，避免重複產生告警
    private readonly ConcurrentDictionary<(string, int), string> _lastStatus = new();
    private readonly SemaphoreSlim _lock = new(1, 1);
    // Cache: assetCode → material-detect SensorId（null = 無此感測器）
    private readonly ConcurrentDictionary<string, int?> _materialDetectCache = new();
    // Cache: assetCode → gating rules dict keyed by GatedSensorId
    private readonly ConcurrentDictionary<string, Dictionary<int, SensorGatingRule>> _gatingRulesCache = new();

    /// <summary>清除指定 asset 的 gating rules cache（規則變更時呼叫）</summary>
    public void InvalidateGatingRulesCache(string assetCode)
        => _gatingRulesCache.TryRemove(assetCode, out _);

    public async Task ProcessAsync(IngestPayload payload)
    {
        await _lock.WaitAsync();
        try
        {
            await using var db = await dbFactory.CreateDbContextAsync();
            var now = DateTime.UtcNow;

            // 1. 查 / 建 Device 記錄，更新 LastSeen
            var device = await db.Devices
                .FirstOrDefaultAsync(d => d.SerialNumber == payload.SerialNumber);

            if (device == null)
            {
                device = new Device
                {
                    SerialNumber = payload.SerialNumber,
                    FirstSeen = now,
                    LastSeen = now
                };
                db.Devices.Add(device);
                await db.SaveChangesAsync();
                logger.LogInformation("New device registered: {SerialNumber}", payload.SerialNumber);
            }
            else
            {
                device.LastSeen = now;
                await db.SaveChangesAsync();
            }

            // 2. 尚未綁定 → 只更新心跳，不做後續處理
            if (device.AssetCode == null)
            {
                logger.LogDebug("Device {SerialNumber} not bound to AssetCode, skipping data write", payload.SerialNumber);
                return;
            }

            var assetCode = device.AssetCode;

            // A1: 更新 LatestReadingCache（所有感測器，供其他 asset 的 gating 使用）
            foreach (var s in payload.Sensors)
                latestCache.Update(assetCode, s.Id, s.Value, now);

            // 3. 查詢此 AssetCode 的限值設定
            var limits = await db.SensorLimits
                .Where(l => l.AssetCode == assetCode)
                .ToDictionaryAsync(l => l.SensorId);

            // 3b. 動態找 material_detect 感測器；無時預設有料
            var matSensorId = await GetMaterialDetectSensorIdAsync(assetCode, db);
            var shoeSensor = matSensorId.HasValue
                ? payload.Sensors.FirstOrDefault(s => s.Id == matSensorId.Value)
                : null;
            bool? hasMaterialNullable = shoeSensor != null ? shoeSensor.Value == 1 : null;
            bool hasMaterial = hasMaterialNullable ?? true;

            // A1: 載入此 asset 的 gating rules
            var gatingRules = await GetGatingRulesAsync(assetCode, db);

            bool IsBlockedByNewGating(int sensorId)
            {
                if (!gatingRules.TryGetValue(sensorId, out var rule)) return false;
                var decision = gatingEvaluator.Evaluate(rule, now);
                if (decision != GatingDecision.Pass)
                {
                    logger.LogTrace("Asset {Asset} Sensor {Id} gated: {Decision}", assetCode, sensorId, decision);
                    return true;
                }
                return false;
            }

            // 4. 寫入時序讀值（material_detect 感測器為狀態位元，不寫入溫度表；A1 gating 封鎖的也跳過）
            var readings = payload.Sensors
                .Where(s => !matSensorId.HasValue || s.Id != matSensorId.Value)
                .Where(s => !IsBlockedByNewGating(s.Id))
                .Select(s => new SensorReading
                {
                    AssetCode = assetCode,
                    SensorId = s.Id,
                    Value = s.Value,
                    HasError = s.Error != null,
                    HasMaterial = hasMaterial,
                    Timestamp = now
                }).ToList();

            db.SensorReadings.AddRange(readings);

            // 5. 告警判斷（無料時跳過；A1 gating 封鎖的也跳過；避免空機假警報）
            var newAlerts = new List<SensorAlert>();
            foreach (var sensor in payload.Sensors)
            {
                if (matSensorId.HasValue && sensor.Id == matSensorId.Value) continue; // 狀態位元，不判限值
                if (!hasMaterial) continue;                 // 無料：跳過所有告警
                if (IsBlockedByNewGating(sensor.Id)) continue; // A1 gating 封鎖：跳過告警
                if (!limits.TryGetValue(sensor.Id, out var limit)) continue;
                if (sensor.Error != null) continue;

                var key = (assetCode, sensor.Id);
                _lastStatus.TryGetValue(key, out var lastStatus);

                string? alertType = null;
                string? severity = null;
                double limitValue = 0;

                if (sensor.Value > limit.UCL)
                {
                    alertType = "UCL"; limitValue = limit.UCL;
                    severity = "danger";
                }
                else if (sensor.Value < limit.LCL)
                {
                    alertType = "LCL"; limitValue = limit.LCL;
                    severity = "danger";
                }
                else if (sensor.Value > limit.UCL * 0.95)
                {
                    alertType = "UCL"; limitValue = limit.UCL;
                    severity = "warning";
                }
                else if (sensor.Value < limit.LCL * 1.05 && limit.LCL > 0)
                {
                    alertType = "LCL"; limitValue = limit.LCL;
                    severity = "warning";
                }

                var currentStatus = alertType != null ? severity! : "normal";

                // 僅在 normal→warning、normal→danger 時產生告警
                if (alertType != null && lastStatus == "normal")
                {
                    var alert = new SensorAlert
                    {
                        AssetCode = assetCode,
                        SensorId = sensor.Id,
                        SensorName = limit.SensorName,
                        Value = sensor.Value,
                        LimitValue = limitValue,
                        AlertType = alertType,
                        Severity = severity!,
                        Timestamp = now
                    };
                    newAlerts.Add(alert);
                    db.SensorAlerts.Add(alert);
                }

                _lastStatus[key] = currentStatus;
            }

            await db.SaveChangesAsync();

            // 6. 企業微信通知（Mock）
            if (newAlerts.Any())
            {
                var assetInfo = await fasService.GetAssetInfoAsync(assetCode);
                var assetName = assetInfo?.AssetName ?? assetInfo?.NickName ?? assetCode;

                foreach (var alert in newAlerts)
                    await weChatService.SendAlertAsync(alert, assetName);
            }

            // 7. 廣播 SSE
            if (sseHub.ConnectionCount > 0)
            {
                var assetInfo = await fasService.GetAssetInfoAsync(assetCode);

                var ssePayload = new SseDataUpdate
                {
                    AssetCode = assetCode,
                    AssetName = assetInfo?.AssetName ?? assetInfo?.NickName,
                    Timestamp = payload.Timestamp,
                    IsConnected = payload.IsConnected,
                    HasMaterial = hasMaterialNullable,
                    Sensors = payload.Sensors
                        .Where(s => !IsBlockedByNewGating(s.Id))
                        .Select(s =>
                        {
                            limits.TryGetValue(s.Id, out var lim);
                            return new SseSensorItem
                            {
                                Id = s.Id,
                                Value = s.Value,
                                Ucl = lim?.UCL ?? 0,
                                Lcl = lim?.LCL ?? 0,
                                Error = s.Error
                            };
                        }).ToList()
                };

                await sseHub.BroadcastAsync(ssePayload);
            }

            if (newAlerts.Any())
                logger.LogWarning("Asset {AssetCode}: {Count} new alert(s) generated", assetCode, newAlerts.Count);
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task<Dictionary<int, SensorGatingRule>> GetGatingRulesAsync(
        string assetCode, IoTDbContext db)
    {
        if (_gatingRulesCache.TryGetValue(assetCode, out var cached))
            return cached;

        var rules = await db.SensorGatingRules
            .Where(r => r.GatedAssetCode == assetCode)
            .ToDictionaryAsync(r => r.GatedSensorId);

        _gatingRulesCache[assetCode] = rules;
        return rules;
    }

    private async Task<int?> GetMaterialDetectSensorIdAsync(string assetCode, IoT.CentralApi.Data.IoTDbContext db)
    {
        if (_materialDetectCache.TryGetValue(assetCode, out var cached))
            return cached;

        var sensorId = await db.LineEquipments
            .Where(le => le.AssetCode == assetCode)
            .SelectMany(le => le.EquipmentType.Sensors)
            .Where(s => s.PropertyType.Behavior == "material_detect")
            .Select(s => (int?)s.SensorId)
            .FirstOrDefaultAsync();

        _materialDetectCache[assetCode] = sensorId;
        return sensorId;
    }
}
