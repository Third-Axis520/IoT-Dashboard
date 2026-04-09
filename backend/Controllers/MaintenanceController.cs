using IoT.CentralApi.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/maintenance")]
public class MaintenanceController(IDbContextFactory<IoTDbContext> dbFactory) : ControllerBase
{
    /// <summary>
    /// 清除指定天數前的 SensorReadings 資料。
    /// 預設保留最近 30 天，最少保留 7 天。
    /// </summary>
    [HttpDelete("sensor-readings")]
    public async Task<IActionResult> PurgeSensorReadings([FromQuery] int keepDays = 30)
    {
        keepDays = Math.Max(keepDays, 7);
        var cutoff = DateTime.UtcNow.AddDays(-keepDays);

        await using var db = await dbFactory.CreateDbContextAsync();

        var deleted = await db.SensorReadings
            .Where(r => r.Timestamp < cutoff)
            .ExecuteDeleteAsync();

        return Ok(new
        {
            deleted,
            cutoff = cutoff.ToString("yyyy-MM-dd HH:mm:ss UTC"),
            keepDays
        });
    }

    /// <summary>
    /// 清除指定天數前已確認的 SensorAlerts。
    /// 預設保留最近 90 天，最少保留 30 天。
    /// </summary>
    [HttpDelete("alerts")]
    public async Task<IActionResult> PurgeAlerts([FromQuery] int keepDays = 90)
    {
        keepDays = Math.Max(keepDays, 30);
        var cutoff = DateTime.UtcNow.AddDays(-keepDays);

        await using var db = await dbFactory.CreateDbContextAsync();

        var deleted = await db.SensorAlerts
            .Where(a => a.Timestamp < cutoff && a.IsAcknowledged)
            .ExecuteDeleteAsync();

        return Ok(new
        {
            deleted,
            cutoff = cutoff.ToString("yyyy-MM-dd HH:mm:ss UTC"),
            keepDays,
            note = "僅刪除已確認（IsAcknowledged=true）的告警"
        });
    }

    /// <summary>查詢各資料表的大概筆數。</summary>
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        await using var db = await dbFactory.CreateDbContextAsync();

        var readingsCount = await db.SensorReadings.CountAsync();
        var alertsCount   = await db.SensorAlerts.CountAsync();
        var unackAlerts   = await db.SensorAlerts.CountAsync(a => !a.IsAcknowledged);

        return Ok(new
        {
            sensorReadings = readingsCount,
            sensorAlerts   = alertsCount,
            unacknowledgedAlerts = unackAlerts
        });
    }
}
