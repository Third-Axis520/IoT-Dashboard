using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/register-map")]
public class RegisterMapController(IDbContextFactory<IoTDbContext> dbFactory) : ControllerBase
{
    /// <summary>取得指定產線的暫存器對應設定（含所有 Entry）。</summary>
    [HttpGet("{lineId}")]
    public async Task<IActionResult> Get(string lineId)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var profile = await db.RegisterMapProfiles
            .Include(p => p.Entries)
            .Include(p => p.PlcTemplate).ThenInclude(t => t!.Zones)
            .Include(p => p.PlcTemplate).ThenInclude(t => t!.Registers)
            .FirstOrDefaultAsync(p => p.LineId == lineId);

        if (profile == null)
            return Ok(new RegisterMapProfileDto { LineId = lineId, Entries = [] });

        return Ok(MapToDto(profile));
    }

    /// <summary>整批儲存（upsert）指定產線的暫存器對應設定。</summary>
    [HttpPost("{lineId}")]
    public async Task<IActionResult> Save(string lineId, [FromBody] SaveRegisterMapRequest req)
    {
        if (req.Entries.Count > 200)
            return BadRequest("Entries 數量上限為 200");

        await using var db = await dbFactory.CreateDbContextAsync();
        await using var tx = await db.Database.BeginTransactionAsync();
        var now = DateTime.UtcNow;

        try
        {
            var profile = await db.RegisterMapProfiles
                .Include(p => p.Entries)
                .Include(p => p.PlcTemplate).ThenInclude(t => t!.Zones)
                .Include(p => p.PlcTemplate).ThenInclude(t => t!.Registers)
                .FirstOrDefaultAsync(p => p.LineId == lineId);

            if (profile == null)
            {
                profile = new RegisterMapProfile { LineId = lineId };
                db.RegisterMapProfiles.Add(profile);
            }

            profile.ProfileName = req.ProfileName;
            profile.PlcTemplateId = req.PlcTemplateId;
            profile.UpdatedAt = now;

            db.RegisterMapEntries.RemoveRange(profile.Entries);
            profile.Entries = req.Entries.Select(e => new RegisterMapEntry
            {
                ZoneIndex = e.ZoneIndex,
                RegisterAddress = e.RegisterAddress,
                EquipmentId = e.EquipmentId,
                PointId = e.PointId,
                Label = e.Label,
                Unit = e.Unit,
            }).ToList();

            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Ok(MapToDto(profile));
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    /// <summary>刪除指定產線的暫存器對應設定。</summary>
    [HttpDelete("{lineId}")]
    public async Task<IActionResult> Delete(string lineId)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var profile = await db.RegisterMapProfiles
            .Include(p => p.Entries)
            .FirstOrDefaultAsync(p => p.LineId == lineId);

        if (profile == null) return NoContent();

        db.RegisterMapProfiles.Remove(profile);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static RegisterMapProfileDto MapToDto(RegisterMapProfile p) => new()
    {
        Id = p.Id,
        LineId = p.LineId,
        ProfileName = p.ProfileName,
        UpdatedAt = p.UpdatedAt,
        PlcTemplateId = p.PlcTemplateId,
        PlcTemplate = p.PlcTemplate == null ? null : PlcTemplateDetailDto.From(p.PlcTemplate),
        Entries = p.Entries.Select(e => new RegisterMapEntryDto
        {
            Id = e.Id,
            ZoneIndex = e.ZoneIndex,
            RegisterAddress = e.RegisterAddress,
            EquipmentId = e.EquipmentId,
            PointId = e.PointId,
            Label = e.Label,
            Unit = e.Unit,
        }).OrderBy(e => e.ZoneIndex).ThenBy(e => e.RegisterAddress).ToList(),
    };
}
