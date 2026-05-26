using System.ComponentModel.DataAnnotations;
using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
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
    IDbContextFactory<IoTDbContext> dbFactory) : ControllerBase
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

    internal static EquipmentTypeDto MapToDtoPublic(EquipmentType et) => new(
        et.Id, et.Name, et.VisType, et.Description, et.CreatedAt,
        et.Sensors.Select(s => new EquipmentTypeSensorDto(
            s.Id, s.SensorId, s.PointId, s.Label, s.Unit,
            s.PropertyTypeId, s.PropertyType.Behavior, s.RawAddress, s.SortOrder
        )).ToList());
}
