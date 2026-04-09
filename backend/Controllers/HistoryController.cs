using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using IoT.CentralApi.Utilities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/history")]
public class HistoryController(IDbContextFactory<IoTDbContext> dbFactory) : ControllerBase
{
    /// <summary>
    /// 查詢指定 AssetCode 的歷史趨勢資料。
    /// 預設最近 1 小時，最多回傳 500 筆（自動降採樣）。
    /// </summary>
    [HttpGet("{assetCode}")]
    public async Task<IActionResult> Get(
        string assetCode,
        [FromQuery] int? sensorId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int maxPoints = 300)
    {
        maxPoints = Math.Clamp(maxPoints, 10, 1000);
        var utcFrom = from?.ToUniversalTime() ?? DateTime.UtcNow.AddHours(-1);
        var utcTo = to?.ToUniversalTime() ?? DateTime.UtcNow;

        await using var db = await dbFactory.CreateDbContextAsync();

        var query = db.SensorReadings
            .Where(r => r.AssetCode == assetCode && r.Timestamp >= utcFrom && r.Timestamp <= utcTo);

        if (sensorId.HasValue)
            query = query.Where(r => r.SensorId == sensorId.Value);

        var rawData = await query
            .OrderBy(r => r.Timestamp)
            .Select(r => new { r.SensorId, r.Value, r.Timestamp })
            .ToListAsync();

        // 依 SensorId 分組，各自用 LTTB 降採樣（保留波峰/波谷）
        var result = rawData
            .GroupBy(r => r.SensorId)
            .ToDictionary(
                g => g.Key,
                g =>
                {
                    var items = g
                        .Select(r => (
                            Time: new DateTimeOffset(r.Timestamp, TimeSpan.Zero).ToUnixTimeMilliseconds(),
                            r.Value))
                        .ToList();

                    var sampled = LttbSampler.Sample(items, maxPoints);

                    return sampled.Select(p => new HistoryPoint
                    {
                        Time  = p.Time,
                        Value = p.Value
                    }).ToList();
                });

        return Ok(result);
    }
}
