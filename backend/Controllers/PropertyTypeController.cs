using IoT.CentralApi.Data;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/property-types")]
public class PropertyTypeController(
    IDbContextFactory<IoTDbContext> dbFactory) : ControllerBase
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

    private static PropertyTypeDto MapToDto(PropertyType e) => new(
        e.Id, e.Key, e.Name, e.Icon, e.DefaultUnit,
        e.DefaultUcl, e.DefaultLcl, e.Behavior, e.IsBuiltIn,
        e.SortOrder, e.CreatedAt);
}
