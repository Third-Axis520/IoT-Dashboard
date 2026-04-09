using System.Collections.Concurrent;
using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Services;

/// <summary>
/// 處理 OvenDataReceive 推送的資料：
/// 1. 查 / 建 Devices 表，更新 LastSeen
/// 2. 若尚未綁定 AssetCode → 僅心跳，不寫 SensorReadings
/// 3. 寫入 SensorReadings
/// 4. 比對 UCL/LCL，產生 SensorAlerts
/// 5. 企業微信通知（Mock）
/// 6. 廣播 SSE 給 Dashboard
/// </summary>
public class DataIngestionService(
    IDbContextFactory<IoTDbContext> dbFactory,
    FasApiService fasService,
    WeChatService weChatService,
    SseHub sseHub,
    ILogger<DataIngestionService> logger)
{
    // 記錄每個 (AssetCode, SensorId) 的上一次 status，避免重複產生告警
    private readonly ConcurrentDictionary<(string, int), string> _lastStatus = new();
    private readonly SemaphoreSlim _lock = new(1, 1);

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

            // 3. 查詢此 AssetCode 的限值設定
            var limits = await db.SensorLimits
                .Where(l => l.AssetCode == assetCode)
                .ToDictionaryAsync(l => l.SensorId);

            // 3b. 判斷鞋子在位（40013）；無此感測器時預設有料
            var shoeSensor = payload.Sensors.FirstOrDefault(s => s.Id == 40013);
            bool? hasMaterialNullable = shoeSensor != null ? shoeSensor.Value == 1 : null;
            bool hasMaterial = hasMaterialNullable ?? true;

            // 4. 寫入時序讀值（40013 為狀態位元，不寫入溫度表）
            var readings = payload.Sensors
                .Where(s => s.Id != 40013)
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

            // 5. 告警判斷（無料時跳過，避免空機假警報）
            var newAlerts = new List<SensorAlert>();
            foreach (var sensor in payload.Sensors)
            {
                if (sensor.Id == 40013) continue;          // 狀態位元，不判限值
                if (!hasMaterial) continue;                 // 無料：跳過所有告警
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
                    Sensors = payload.Sensors.Select(s =>
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
}
