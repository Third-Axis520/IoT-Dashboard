using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/limits")]
public class LimitsController(IDbContextFactory<IoTDbContext> dbFactory) : ControllerBase
{
    /// <summary>取得指定 AssetCode 的所有感測器限值。</summary>
    [HttpGet("{assetCode}")]
    public async Task<IActionResult> Get(string assetCode)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var limits = await db.SensorLimits
            .Where(l => l.AssetCode == assetCode)
            .OrderBy(l => l.SensorId)
            .Select(l => new SensorLimitDto
            {
                SensorId = l.SensorId,
                SensorName = l.SensorName,
                UCL = l.UCL,
                LCL = l.LCL,
                Unit = l.Unit
            })
            .ToListAsync();

        return Ok(limits);
    }

    /// <summary>批次更新指定 AssetCode 的感測器限值（Upsert）。</summary>
    [HttpPut("{assetCode}")]
    public async Task<IActionResult> Update(string assetCode, [FromBody] UpdateLimitsRequest request)
    {
        await using var db = await dbFactory.CreateDbContextAsync();

        var existing = await db.SensorLimits
            .Where(l => l.AssetCode == assetCode)
            .ToDictionaryAsync(l => l.SensorId);

        foreach (var dto in request.Limits)
        {
            if (existing.TryGetValue(dto.SensorId, out var limit))
            {
                limit.UCL = dto.UCL;
                limit.LCL = dto.LCL;
                if (dto.SensorName != null) limit.SensorName = dto.SensorName;
                limit.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                db.SensorLimits.Add(new SensorLimit
                {
                    AssetCode = assetCode,
                    SensorId = dto.SensorId,
                    SensorName = dto.SensorName,
                    UCL = dto.UCL,
                    LCL = dto.LCL,
                    Unit = dto.Unit,
                    UpdatedAt = DateTime.UtcNow
                });
            }
        }

        await db.SaveChangesAsync();
        return Ok(new { updated = request.Limits.Count });
    }
}
