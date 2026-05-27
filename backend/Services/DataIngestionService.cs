using System.Collections.Concurrent;
using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Services;

/// <summary>
/// 處理推送資料：
/// 1. 若 AssetCode 為空 → 忽略（不寫 SensorReadings）
/// 2. 寫入 SensorReadings（所有感測器，無 gating 過濾）
/// 3. 比對 UCL/LCL，產生 SensorAlerts
/// 4. 企業微信通知
/// 5. 廣播 SSE 給 Dashboard
/// </summary>
public class DataIngestionService(
    IDbContextFactory<IoTDbContext> dbFactory,
    FasApiService fasService,
    WeChatService weChatService,
    SseHub sseHub,
    ILatestReadingCache latestCache,
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
            // 1. AssetCode 為空 → 忽略
            if (string.IsNullOrWhiteSpace(payload.AssetCode))
            {
                logger.LogDebug("IngestPayload missing AssetCode, skipping data write");
                return;
            }

            await using var db = await dbFactory.CreateDbContextAsync();
            var now = DateTime.UtcNow;
            var assetCode = payload.AssetCode;

            // Sanity-check sentinel values from PLCs that return literal
            // 0x8AD0 (-30000 raw, ×0.1 = -3000) or 0x8000 (-32768) on
            // unconfigured registers.
            //
            // Threshold is asymmetric:
            //   • lower: value < -100 — no shoe-factory sensor reads below
            //     this (deep-freeze chillers bottom out around -40°C). The
            //     observed bogus value -3000 trips this cleanly.
            //   • upper: value > 1,000,000 — legitimate counters
            //     (RunTimeSeconds, press counts) can easily exceed 86,400 in
            //     a 24h shift, but anything beyond a million is unphysical.
            //
            // Bogus readings get HasError = true: the row is still persisted
            // for diagnostics, but skipped by the alert / SSE-broadcast paths
            // so the dashboard doesn't show a sentinel as a real value.
            const double LowerSentinel = -100;
            const double UpperSentinel = 1_000_000;
            foreach (var s in payload.Sensors)
            {
                if (s.Error == null && (s.Value < LowerSentinel || s.Value > UpperSentinel))
                {
                    logger.LogWarning(
                        "Sentinel value rejected: asset={Asset} sensor={SensorId} value={Value} — likely unconfigured Modbus register",
                        assetCode, s.Id, s.Value);
                    s.Error = $"sentinel_value:{s.Value}";
                }
            }

            // 更新 LatestReadingCache（只更新沒被視為 sentinel 的）
            foreach (var s in payload.Sensors.Where(s => s.Error == null))
                latestCache.Update(assetCode, s.Id, s.Value, now);

            // 3. 查詢此 AssetCode 的限值設定
            var limits = await db.SensorLimits
                .Where(l => l.AssetCode == assetCode)
                .ToDictionaryAsync(l => l.SensorId);

            // 4. 寫入時序讀值（所有感測器，無 gating 過濾）
            var readings = payload.Sensors
                .Select(s => new SensorReading
                {
                    AssetCode = assetCode,
                    SensorId = s.Id,
                    Value = s.Value,
                    HasError = s.Error != null,
                    Timestamp = now
                }).ToList();

            db.SensorReadings.AddRange(readings);

            // 5. 告警判斷
            var newAlerts = new List<SensorAlert>();
            foreach (var sensor in payload.Sensors)
            {
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
                    Sensors = BuildSseSensors(payload.Sensors, limits),
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

    /// <summary>
    /// Builds the Sensors list for an SSE data-update payload.
    /// Internal+static so it can be unit-tested without SseHub.
    /// </summary>
    internal static List<SseSensorItem> BuildSseSensors(
        IList<SensorReading_Dto> payloadSensors,
        Dictionary<int, SensorLimit> limits)
    {
        return payloadSensors
            .Select(s =>
            {
                limits.TryGetValue(s.Id, out var lim);
                return new SseSensorItem
                {
                    Id = s.Id,
                    Value = s.Value,
                    Ucl = lim?.UCL ?? 0,
                    Lcl = lim?.LCL ?? 0,
                    Error = s.Error,
                };
            }).ToList();
    }

}
