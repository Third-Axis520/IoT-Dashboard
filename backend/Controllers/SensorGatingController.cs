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
    DataIngestionService ingestionService,
    ILatestReadingCache latestCache) : ControllerBase
{
    [HttpGet("candidates")]
    public async Task<IActionResult> GetCandidates()
    {
        await using var db = await dbFactory.CreateDbContextAsync();

        var lineEquipments = await db.LineEquipments
            .Where(le => le.AssetCode != null)
            .Include(le => le.EquipmentType)
                .ThenInclude(et => et.Sensors)
                    .ThenInclude(s => s.PropertyType)
            .AsNoTracking()
            .ToListAsync();

        // Map EquipmentTypeId → smallest enabled PollIntervalMs (one EquipmentType
        // may be referenced by multiple DeviceConnections; the smallest is the strictest gate).
        var pollByEquipmentType = await db.DeviceConnections
            .Where(dc => dc.IsEnabled && dc.EquipmentTypeId != null && dc.PollIntervalMs.HasValue)
            .GroupBy(dc => dc.EquipmentTypeId!.Value)
            .Select(g => new { EquipmentTypeId = g.Key, PollIntervalMs = g.Min(dc => dc.PollIntervalMs!.Value) })
            .AsNoTracking()
            .ToDictionaryAsync(x => x.EquipmentTypeId, x => x.PollIntervalMs);

        var candidates = new List<GatingCandidateDto>();
        foreach (var le in lineEquipments)
        {
            if (le.EquipmentType?.Sensors == null) continue;
            int? pollMs = pollByEquipmentType.TryGetValue(le.EquipmentTypeId, out var p) ? p : null;
            foreach (var s in le.EquipmentType.Sensors)
            {
                if (s.PropertyType?.Behavior == "asset_code") continue;
                if (s.PropertyType?.Behavior == "counter") continue;

                var latest = latestCache.Get(le.AssetCode!, s.SensorId);

                candidates.Add(new GatingCandidateDto(
                    AssetCode: le.AssetCode!,
                    AssetName: le.DisplayName ?? le.AssetCode!,
                    SensorId: s.SensorId,
                    SensorLabel: s.Label,
                    CurrentValue: latest?.Value,
                    LastUpdate: latest?.Timestamp,
                    PollIntervalMs: pollMs
                ));
            }
        }

        return Ok(candidates.OrderBy(c => c.AssetCode).ThenBy(c => c.SensorId));
    }


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

        // MaxAgeMs vs source DI poll interval: if maxAgeMs < pollIntervalMs the gated
        // sensor is filtered as Stale most of the time (production incident 2026-04-30).
        var sourceAssets = request.Rules.Select(r => r.GatingAssetCode).Distinct().ToList();
        var sourcePollIntervals = await (
            from le in db.LineEquipments
            where le.AssetCode != null && sourceAssets.Contains(le.AssetCode)
            join dc in db.DeviceConnections on le.EquipmentTypeId equals dc.EquipmentTypeId into dcs
            from dc in dcs.DefaultIfEmpty()
            select new { le.AssetCode, dc!.PollIntervalMs, dc.IsEnabled })
            .ToListAsync();

        var pollByAsset = sourcePollIntervals
            .Where(x => x.PollIntervalMs.HasValue && x.IsEnabled)
            .GroupBy(x => x.AssetCode!)
            .ToDictionary(g => g.Key, g => g.Min(x => x.PollIntervalMs!.Value));

        foreach (var item in request.Rules)
        {
            if (pollByAsset.TryGetValue(item.GatingAssetCode, out var poll) && item.MaxAgeMs < poll)
                return BadRequest(new { error = $"MaxAgeMs ({item.MaxAgeMs}ms) 必須 ≥ gating 來源 {item.GatingAssetCode} 的 PollIntervalMs ({poll}ms)，否則 cache 大部分時間會被視為過期，sensor 會被擋掉" });
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
