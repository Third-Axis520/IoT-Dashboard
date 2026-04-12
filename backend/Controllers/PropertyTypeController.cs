using IoT.CentralApi.Data;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/property-types")]
public class PropertyTypeController(IDbContextFactory<IoTDbContext> dbFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var items = await db.PropertyTypes
            .OrderBy(p => p.SortOrder)
            .ThenBy(p => p.Id)
            .ToListAsync();
        return Ok(items.Select(MapToDto));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetOne(int id)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var item = await db.PropertyTypes.FindAsync(id);
        return item == null ? NotFound() : Ok(MapToDto(item));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SavePropertyTypeRequest req)
    {
        await using var db = await dbFactory.CreateDbContextAsync();

        if (await db.PropertyTypes.AnyAsync(p => p.Key == req.Key))
            return Conflict(new { error = $"Key '{req.Key}' 已存在" });

        var entity = new PropertyType
        {
            Key = req.Key,
            Name = req.Name,
            Icon = req.Icon,
            DefaultUnit = req.DefaultUnit,
            DefaultUcl = req.DefaultUcl,
            DefaultLcl = req.DefaultLcl,
            Behavior = req.Behavior,
            IsBuiltIn = false,
            SortOrder = req.SortOrder,
            CreatedAt = DateTime.UtcNow,
        };

        db.PropertyTypes.Add(entity);
        await db.SaveChangesAsync();
        return Ok(MapToDto(entity));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdatePropertyTypeRequest req)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var entity = await db.PropertyTypes.FindAsync(id);
        if (entity == null) return NotFound();

        entity.Name = req.Name;
        entity.Icon = req.Icon;
        entity.DefaultUnit = req.DefaultUnit;
        entity.DefaultUcl = req.DefaultUcl;
        entity.DefaultLcl = req.DefaultLcl;
        entity.SortOrder = req.SortOrder;

        await db.SaveChangesAsync();
        return Ok(MapToDto(entity));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var entity = await db.PropertyTypes.FindAsync(id);
        if (entity == null) return NotFound();

        if (entity.IsBuiltIn)
            return Conflict(new { error = "內建屬性不可刪除" });

        db.PropertyTypes.Remove(entity);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static PropertyTypeDto MapToDto(PropertyType e) => new(
        e.Id, e.Key, e.Name, e.Icon, e.DefaultUnit,
        e.DefaultUcl, e.DefaultLcl, e.Behavior, e.IsBuiltIn,
        e.SortOrder, e.CreatedAt);
}
