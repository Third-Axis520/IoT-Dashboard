using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
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

        // 依 SensorId 分組，各自降採樣
        var result = rawData
            .GroupBy(r => r.SensorId)
            .ToDictionary(
                g => g.Key,
                g =>
                {
                    var items = g.ToList();
                    if (items.Count <= maxPoints)
                        return items.Select(r => new HistoryPoint
                        {
                            Time = new DateTimeOffset(r.Timestamp, TimeSpan.Zero).ToUnixTimeMilliseconds(),
                            Value = r.Value
                        }).ToList();

                    // 等間距降採樣
                    var step = items.Count / maxPoints;
                    return items
                        .Where((_, i) => i % step == 0)
                        .Select(r => new HistoryPoint
                        {
                            Time = new DateTimeOffset(r.Timestamp, TimeSpan.Zero).ToUnixTimeMilliseconds(),
                            Value = r.Value
                        }).ToList();
                });

        return Ok(result);
    }
}
