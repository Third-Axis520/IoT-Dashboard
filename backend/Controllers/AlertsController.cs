using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/alerts")]
public class AlertsController(IDbContextFactory<IoTDbContext> dbFactory) : ControllerBase
{
    /// <summary>查詢告警記錄（分頁，預設最近 24 小時）。</summary>
    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery] string? assetCode,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        pageSize = Math.Clamp(pageSize, 1, 200);
        var utcFrom = from?.ToUniversalTime() ?? DateTime.UtcNow.AddHours(-1);
        var utcTo = to?.ToUniversalTime() ?? DateTime.UtcNow;

        await using var db = await dbFactory.CreateDbContextAsync();

        var query = db.SensorAlerts
            .Where(a => a.Timestamp >= utcFrom && a.Timestamp <= utcTo);

        if (!string.IsNullOrWhiteSpace(assetCode))
            query = query.Where(a => a.AssetCode == assetCode);

        var total = await query.CountAsync();

        var alerts = await query
            .OrderByDescending(a => a.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new AlertDto
            {
                Id = a.Id,
                AssetCode = a.AssetCode,
                SensorId = a.SensorId,
                SensorName = a.SensorName,
                Value = a.Value,
                LimitValue = a.LimitValue,
                AlertType = a.AlertType,
                Severity = a.Severity,
                Timestamp = new DateTimeOffset(a.Timestamp, TimeSpan.Zero).ToUnixTimeMilliseconds(),
                IsAcknowledged = a.IsAcknowledged
            })
            .ToListAsync();

        return Ok(new { total, page, pageSize, items = alerts });
    }

    /// <summary>確認告警（Acknowledge）。</summary>
    [HttpPost("{id}/acknowledge")]
    public async Task<IActionResult> Acknowledge(long id)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var alert = await db.SensorAlerts.FindAsync(id);
        if (alert == null) return NotFound();

        alert.IsAcknowledged = true;
        await db.SaveChangesAsync();
        return Ok();
    }
}
