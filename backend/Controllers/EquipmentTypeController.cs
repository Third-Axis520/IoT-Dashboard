using System.ComponentModel.DataAnnotations;
using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using IoT.CentralApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Controllers;

// ── DTOs ──────────────────────────────────────────────────────────────────────

public record EquipmentTypeSensorDto(
    int Id, int SensorId, string PointId,
    string Label, string Unit, int PropertyTypeId,
    string PropertyTypeBehavior, string? RawAddress, int SortOrder);

public record EquipmentTypeDto(
    int Id, string Name, string VisType, string? Description,
    DateTime CreatedAt, List<EquipmentTypeSensorDto> Sensors);

public record SaveSensorRequest(
    [Range(1, int.MaxValue)] int SensorId,
    [Required, MaxLength(100)] string PointId,
    [Required, MaxLength(100)] string Label,
    string Unit,
    int PropertyTypeId,
    string? RawAddress = null,
    int SortOrder = 0);

public record SaveEquipmentTypeRequest(
    [Required, MaxLength(100)] string Name,
    [Required, MaxLength(50)] string VisType,
    [MaxLength(300)] string? Description,
    List<SaveSensorRequest> Sensors);

// ── Controller ────────────────────────────────────────────────────────────────

[ApiController]
[Route("api/equipment-types")]
public class EquipmentTypeController(
    IDbContextFactory<IoTDbContext> dbFactory,
    SseHub sseHub) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var types = await db.EquipmentTypes
            .Include(et => et.Sensors.OrderBy(s => s.SortOrder))
                .ThenInclude(s => s.PropertyType)
            .OrderBy(et => et.CreatedAt)
            .ToListAsync();
        return Ok(types.Select(MapToDtoPublic));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetOne(int id)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var et = await db.EquipmentTypes
            .Include(et => et.Sensors.OrderBy(s => s.SortOrder))
                .ThenInclude(s => s.PropertyType)
            .FirstOrDefaultAsync(et => et.Id == id);
        if (et == null) return NotFound();
        return Ok(MapToDtoPublic(et));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SaveEquipmentTypeRequest req)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var et = new EquipmentType
        {
            Name = req.Name,
            VisType = req.VisType,
            Description = req.Description,
            CreatedAt = DateTime.UtcNow,
            Sensors = req.Sensors.Select((s, i) => new EquipmentTypeSensor
            {
                SensorId = s.SensorId,
                PointId = s.PointId,
                Label = s.Label,
                Unit = s.Unit,
                PropertyTypeId = s.PropertyTypeId,
                RawAddress = s.RawAddress,
                SortOrder = s.SortOrder == 0 ? i : s.SortOrder,
            }).ToList(),
        };
        db.EquipmentTypes.Add(et);
        await db.SaveChangesAsync();

        var created = await db.EquipmentTypes
            .Include(x => x.Sensors.OrderBy(s => s.SortOrder))
                .ThenInclude(s => s.PropertyType)
            .FirstAsync(x => x.Id == et.Id);
        _ = sseHub.BroadcastConfigAsync("equipment_type", created.Id, "created");
        return Ok(MapToDtoPublic(created));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] SaveEquipmentTypeRequest req)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var et = await db.EquipmentTypes
            .Include(x => x.Sensors)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (et == null) return NotFound();

        et.Name = req.Name;
        et.VisType = req.VisType;
        et.Description = req.Description;

        db.EquipmentTypeSensors.RemoveRange(et.Sensors);
        et.Sensors = req.Sensors.Select((s, i) => new EquipmentTypeSensor
        {
            EquipmentTypeId = id,
            SensorId = s.SensorId,
            PointId = s.PointId,
            Label = s.Label,
            Unit = s.Unit,
            PropertyTypeId = s.PropertyTypeId,
            RawAddress = s.RawAddress,
            SortOrder = s.SortOrder == 0 ? i : s.SortOrder,
        }).ToList();

        await db.SaveChangesAsync();

        var updated = await db.EquipmentTypes
            .Include(x => x.Sensors.OrderBy(s => s.SortOrder))
                .ThenInclude(s => s.PropertyType)
            .FirstAsync(x => x.Id == id);
        _ = sseHub.BroadcastConfigAsync("equipment_type", updated.Id, "updated");
        return Ok(MapToDtoPublic(updated));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var et = await db.EquipmentTypes
            .Include(x => x.LineEquipments)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (et == null) return NotFound();

        if (et.LineEquipments.Count > 0)
            return Conflict(new
            {
                error = "此設備類型已被產線配置使用，請先從產線中移除",
                usedByCount = et.LineEquipments.Count,
            });

        db.EquipmentTypes.Remove(et);
        await db.SaveChangesAsync();
        _ = sseHub.BroadcastConfigAsync("equipment_type", id, "deleted");
        return NoContent();
    }

    internal static EquipmentTypeDto MapToDtoPublic(EquipmentType et) => new(
        et.Id, et.Name, et.VisType, et.Description, et.CreatedAt,
        et.Sensors.Select(s => new EquipmentTypeSensorDto(
            s.Id, s.SensorId, s.PointId, s.Label, s.Unit,
            s.PropertyTypeId, s.PropertyType.Behavior, s.RawAddress, s.SortOrder
        )).ToList());
}
