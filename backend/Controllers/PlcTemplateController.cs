using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/plc-templates")]
public class PlcTemplateController(IDbContextFactory<IoTDbContext> dbFactory) : ControllerBase
{
    /// <summary>列出所有 PLC 型號範本（摘要，不含 Zone/Register 明細）。</summary>
    [HttpGet]
    public async Task<IActionResult> List()
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var list = await db.PlcTemplates
            .OrderBy(t => t.CreatedAt)
            .Select(t => new PlcTemplateSummaryDto
            {
                Id = t.Id,
                ModelName = t.ModelName,
                Description = t.Description,
                CreatedAt = t.CreatedAt,
                ZoneCount = t.Zones.Count,
                RegisterCount = t.Registers.Count,
            })
            .ToListAsync();

        return Ok(list);
    }

    /// <summary>取得單一 PLC 型號範本（含完整 Zone 與 Register 定義）。</summary>
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var template = await db.PlcTemplates
            .Include(t => t.Zones.OrderBy(z => z.ZoneIndex))
            .Include(t => t.Registers.OrderBy(r => r.RegisterAddress))
            .FirstOrDefaultAsync(t => t.Id == id);

        if (template == null) return NotFound();
        return Ok(PlcTemplateDetailDto.From(template));
    }

    /// <summary>建立新的 PLC 型號範本。</summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SavePlcTemplateRequest req)
    {
        await using var db = await dbFactory.CreateDbContextAsync();

        var template = new PlcTemplate
        {
            ModelName = req.ModelName,
            Description = req.Description,
            CreatedAt = DateTime.UtcNow,
            Zones = req.Zones.Select(z => new PlcZoneDefinition
            {
                ZoneIndex = z.ZoneIndex,
                ZoneName = z.ZoneName,
                AssetCodeRegStart = z.AssetCodeRegStart,
                AssetCodeRegCount = z.AssetCodeRegCount,
            }).ToList(),
            Registers = req.Registers.Select(r => new PlcRegisterDefinition
            {
                RegisterAddress = r.RegisterAddress,
                DefaultLabel = r.DefaultLabel,
                DefaultUnit = r.DefaultUnit,
                DefaultZoneIndex = r.DefaultZoneIndex,
            }).ToList(),
        };

        db.PlcTemplates.Add(template);
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(Get), new { id = template.Id }, PlcTemplateDetailDto.From(template));
    }

    /// <summary>更新 PLC 型號範本（全量替換 Zone 與 Register 定義）。</summary>
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] SavePlcTemplateRequest req)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var template = await db.PlcTemplates
            .Include(t => t.Zones)
            .Include(t => t.Registers)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (template == null) return NotFound();

        template.ModelName = req.ModelName;
        template.Description = req.Description;

        // 全量替換 Zones
        db.PlcZoneDefinitions.RemoveRange(template.Zones);
        template.Zones = req.Zones.Select(z => new PlcZoneDefinition
        {
            TemplateId = id,
            ZoneIndex = z.ZoneIndex,
            ZoneName = z.ZoneName,
            AssetCodeRegStart = z.AssetCodeRegStart,
            AssetCodeRegCount = z.AssetCodeRegCount,
        }).ToList();

        // 全量替換 Registers
        db.PlcRegisterDefinitions.RemoveRange(template.Registers);
        template.Registers = req.Registers.Select(r => new PlcRegisterDefinition
        {
            TemplateId = id,
            RegisterAddress = r.RegisterAddress,
            DefaultLabel = r.DefaultLabel,
            DefaultUnit = r.DefaultUnit,
            DefaultZoneIndex = r.DefaultZoneIndex,
        }).ToList();

        await db.SaveChangesAsync();
        return Ok(PlcTemplateDetailDto.From(template));
    }

    /// <summary>刪除 PLC 型號範本。若有產線引用此型號，回傳 409 Conflict。</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        await using var db = await dbFactory.CreateDbContextAsync();

        var usedByCount = await db.RegisterMapProfiles.CountAsync(p => p.PlcTemplateId == id);
        if (usedByCount > 0)
        {
            return Conflict(new
            {
                error = "此型號已被產線設定引用，無法刪除。請先至各產線的暫存器設定取消引用後再刪除。",
                usedByCount,
            });
        }

        var template = await db.PlcTemplates
            .Include(t => t.Zones)
            .Include(t => t.Registers)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (template == null) return NoContent();

        db.PlcTemplates.Remove(template);
        await db.SaveChangesAsync();
        return NoContent();
    }

}
