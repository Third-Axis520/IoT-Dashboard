using IoT.CentralApi.Data;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Models;
using IoT.CentralApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/sensor-gating")]
public class SensorGatingController(
    IDbContextFactory<IoTDbContext> dbFactory,
    DataIngestionService ingestionService) : ControllerBase
{
    [HttpGet("{assetCode}")]
    public async Task<IActionResult> Get(string assetCode)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var rules = await db.SensorGatingRules
            .Where(r => r.GatedAssetCode == assetCode)
            .OrderBy(r => r.GatedSensorId)
            .ToListAsync();

        var dtos = rules.Select(r => new SensorGatingRuleDto(
            r.Id, r.GatedAssetCode, r.GatedSensorId,
            r.GatingAssetCode, r.GatingSensorId,
            null,
            r.DelayMs, r.MaxAgeMs
        )).ToList();

        return Ok(dtos);
    }

    [HttpPut("{assetCode}")]
    public async Task<IActionResult> Update(string assetCode, [FromBody] UpdateGatingRulesRequest request)
    {
        // Validation
        foreach (var item in request.Rules)
        {
            if (item.GatingAssetCode == assetCode && item.GatingSensorId == item.GatedSensorId)
                return BadRequest(new { error = $"Sensor {item.GatedSensorId} 不能 gate 自己" });

            if (item.DelayMs < 0 || item.DelayMs > 10000)
                return BadRequest(new { error = $"DelayMs 必須介於 0~10000，目前: {item.DelayMs}" });

            if (item.MaxAgeMs < 100 || item.MaxAgeMs > 60000)
                return BadRequest(new { error = $"MaxAgeMs 必須介於 100~60000，目前: {item.MaxAgeMs}" });
        }

        await using var db = await dbFactory.CreateDbContextAsync();

        // Chained gating: if request asks (GatingAssetCode, GatingSensorId) that itself is currently gated → reject
        var requestedSources = request.Rules
            .Select(r => (r.GatingAssetCode, r.GatingSensorId))
            .Distinct().ToList();
        foreach (var (asset, sid) in requestedSources)
        {
            var sourceIsGated = await db.SensorGatingRules
                .AnyAsync(r => r.GatedAssetCode == asset && r.GatedSensorId == sid);
            if (sourceIsGated)
                return BadRequest(new { error = $"鏈式 gating 不允許：{asset}/{sid} 本身已被 gating" });
        }

        // Upsert + delete missing
        var existing = await db.SensorGatingRules
            .Where(r => r.GatedAssetCode == assetCode)
            .ToDictionaryAsync(r => r.GatedSensorId);

        var requestedIds = request.Rules.Select(r => r.GatedSensorId).ToHashSet();

        foreach (var (sid, rule) in existing)
        {
            if (!requestedIds.Contains(sid))
                db.SensorGatingRules.Remove(rule);
        }

        var now = DateTime.UtcNow;
        foreach (var item in request.Rules)
        {
            if (existing.TryGetValue(item.GatedSensorId, out var rule))
            {
                rule.GatingAssetCode = item.GatingAssetCode;
                rule.GatingSensorId = item.GatingSensorId;
                rule.DelayMs = item.DelayMs;
                rule.MaxAgeMs = item.MaxAgeMs;
                rule.UpdatedAt = now;
            }
            else
            {
                db.SensorGatingRules.Add(new SensorGatingRule
                {
                    GatedAssetCode = assetCode,
                    GatedSensorId = item.GatedSensorId,
                    GatingAssetCode = item.GatingAssetCode,
                    GatingSensorId = item.GatingSensorId,
                    DelayMs = item.DelayMs,
                    MaxAgeMs = item.MaxAgeMs,
                    CreatedAt = now
                });
            }
        }

        await db.SaveChangesAsync();
        ingestionService.InvalidateGatingRulesCache(assetCode);

        return Ok(new { updated = request.Rules.Count });
    }
}
