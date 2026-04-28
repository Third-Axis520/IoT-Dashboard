using System.ComponentModel.DataAnnotations;
using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using IoT.CentralApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Controllers;

// ── DTOs ──────────────────────────────────────────────────────────────────────

public record LineEquipmentDto(
    int Id, int EquipmentTypeId, EquipmentTypeDto EquipmentType,
    string? AssetCode, string? DisplayName, int SortOrder, bool IsHidden);

public record LineConfigDto(
    int Id, string LineId, string Name,
    DateTime UpdatedAt, List<LineEquipmentDto> Equipments);

public record SaveLineEquipmentRequest(
    [Range(1, int.MaxValue)] int EquipmentTypeId,
    [MaxLength(50)] string? AssetCode,
    [MaxLength(200)] string? DisplayName,
    int SortOrder = 0,
    bool IsHidden = false);

public record SaveLineConfigRequest(
    [Required, MaxLength(200)] string Name,
    List<SaveLineEquipmentRequest> Equipments);

// ── Controller ────────────────────────────────────────────────────────────────

[ApiController]
[Route("api/line-configs")]
public class LineConfigController(
    IDbContextFactory<IoTDbContext> dbFactory,
    SseHub sseHub) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var lines = await db.LineConfigs
            .Include(lc => lc.Equipments.OrderBy(le => le.SortOrder))
                .ThenInclude(le => le.EquipmentType)
                    .ThenInclude(et => et.Sensors.OrderBy(s => s.SortOrder))
                        .ThenInclude(s => s.PropertyType)
            .OrderBy(lc => lc.Id)
            .ToListAsync();
        return Ok(lines.Select(MapToDto));
    }

    [HttpGet("{lineId}")]
    public async Task<IActionResult> GetOne(string lineId)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var lc = await db.LineConfigs
            .Include(lc => lc.Equipments.OrderBy(le => le.SortOrder))
                .ThenInclude(le => le.EquipmentType)
                    .ThenInclude(et => et.Sensors.OrderBy(s => s.SortOrder))
                        .ThenInclude(s => s.PropertyType)
            .FirstOrDefaultAsync(lc => lc.LineId == lineId);
        if (lc == null) return NotFound();
        return Ok(MapToDto(lc));
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] SaveLineConfigRequest req,
        [FromQuery] string lineId = "")
    {
        if (string.IsNullOrWhiteSpace(lineId))
            lineId = $"line_{Guid.NewGuid():N}";

        await using var db = await dbFactory.CreateDbContextAsync();
        if (await db.LineConfigs.AnyAsync(lc => lc.LineId == lineId))
            return Conflict(new { error = $"LineId '{lineId}' 已存在" });

        var lc = new LineConfig
        {
            LineId = lineId,
            Name = req.Name,
            UpdatedAt = DateTime.UtcNow,
            Equipments = req.Equipments.Select((e, i) => new LineEquipment
            {
                EquipmentTypeId = e.EquipmentTypeId,
                AssetCode = e.AssetCode,
                DisplayName = e.DisplayName,
                SortOrder = e.SortOrder == 0 ? i : e.SortOrder,
                IsHidden = e.IsHidden,
            }).ToList(),
        };
        db.LineConfigs.Add(lc);
        await db.SaveChangesAsync();
        _ = sseHub.BroadcastConfigAsync("line_config", lc.Id, "created");
        return Ok(await LoadFullAsync(db, lc.Id));
    }

    [HttpPut("{lineId}")]
    public async Task<IActionResult> Save(string lineId, [FromBody] SaveLineConfigRequest req)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var lc = await db.LineConfigs
            .Include(x => x.Equipments)
            .FirstOrDefaultAsync(x => x.LineId == lineId);

        if (lc == null)
        {
            lc = new LineConfig { LineId = lineId };
            db.LineConfigs.Add(lc);
        }
        else
        {
            db.LineEquipments.RemoveRange(lc.Equipments);
        }

        lc.Name = req.Name;
        lc.UpdatedAt = DateTime.UtcNow;
        lc.Equipments = req.Equipments.Select((e, i) => new LineEquipment
        {
            EquipmentTypeId = e.EquipmentTypeId,
            AssetCode = e.AssetCode,
            DisplayName = e.DisplayName,
            SortOrder = e.SortOrder == 0 ? i : e.SortOrder,
            IsHidden = e.IsHidden,
        }).ToList();

        await db.SaveChangesAsync();
        _ = sseHub.BroadcastConfigAsync("line_config", lc.Id, "updated");
        return Ok(await LoadFullAsync(db, lc.Id));
    }

    [HttpDelete("{lineId}")]
    public async Task<IActionResult> Delete(string lineId)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var lc = await db.LineConfigs.FirstOrDefaultAsync(x => x.LineId == lineId);
        if (lc == null) return NotFound();
        db.LineConfigs.Remove(lc);
        await db.SaveChangesAsync();
        _ = sseHub.BroadcastConfigAsync("line_config", lc.Id, "deleted");
        return NoContent();
    }

    private static async Task<LineConfigDto> LoadFullAsync(IoTDbContext db, int id)
    {
        var lc = await db.LineConfigs
            .Include(x => x.Equipments.OrderBy(le => le.SortOrder))
                .ThenInclude(le => le.EquipmentType)
                    .ThenInclude(et => et.Sensors.OrderBy(s => s.SortOrder))
                        .ThenInclude(s => s.PropertyType)
            .FirstAsync(x => x.Id == id);
        return MapToDto(lc);
    }

    private static LineConfigDto MapToDto(LineConfig lc) => new(
        lc.Id, lc.LineId, lc.Name, lc.UpdatedAt,
        lc.Equipments.Select(le => new LineEquipmentDto(
            le.Id, le.EquipmentTypeId,
            EquipmentTypeController.MapToDtoPublic(le.EquipmentType),
            le.AssetCode, le.DisplayName, le.SortOrder, le.IsHidden
        )).ToList());
}
