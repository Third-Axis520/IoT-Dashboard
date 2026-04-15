using IoT.CentralApi.Adapters.Contracts;
using IoT.CentralApi.Data;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Models;
using IoT.CentralApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/device-connections")]
public class DeviceConnectionController(
    IDbContextFactory<IoTDbContext> dbFactory,
    IEnumerable<IProtocolAdapter> adapters,
    SseHub sseHub) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var connections = await db.DeviceConnections
            .Include(dc => dc.EquipmentType)
            .OrderByDescending(dc => dc.CreatedAt)
            .ToListAsync();

        return Ok(connections.Select(MapToDto));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetOne(int id)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var dc = await db.DeviceConnections
            .Include(dc => dc.EquipmentType!)
                .ThenInclude(et => et.Sensors.OrderBy(s => s.SortOrder))
                    .ThenInclude(s => s.PropertyType)
            .FirstOrDefaultAsync(dc => dc.Id == id);

        if (dc == null) return NotFound();
        return Ok(MapToDetailDto(dc));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SaveDeviceConnectionRequest req)
    {
        var adapter = adapters.FirstOrDefault(a => a.ProtocolId == req.Protocol);
        if (adapter == null)
            return NotFound(new ErrorResponse("unknown_protocol", $"協議 '{req.Protocol}' 不存在"));

        var validation = adapter.ValidateConfig(req.Config);
        if (!validation.IsValid)
            return BadRequest(new ErrorResponse("invalid_config", validation.Error!));

        await using var db = await dbFactory.CreateDbContextAsync();

        var dc = new DeviceConnection
        {
            Name = req.Name,
            Protocol = req.Protocol,
            ConfigJson = req.Config,
            PollIntervalMs = req.PollIntervalMs,
            IsEnabled = req.IsEnabled,
            CreatedAt = DateTime.UtcNow,
        };

        // Atomic provision: create EquipmentType + Sensors in the same transaction
        if (req.EquipmentType != null)
        {
            var et = new EquipmentType
            {
                Name = req.EquipmentType.Name,
                VisType = req.EquipmentType.VisType,
                Description = req.EquipmentType.Description,
                CreatedAt = DateTime.UtcNow,
                Sensors = req.EquipmentType.Sensors.Select((s, i) => new EquipmentTypeSensor
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
            dc.EquipmentType = et;
        }

        db.DeviceConnections.Add(dc);
        await db.SaveChangesAsync();

        // Reload with includes
        var created = await db.DeviceConnections
            .Include(x => x.EquipmentType!)
                .ThenInclude(et => et.Sensors.OrderBy(s => s.SortOrder))
                    .ThenInclude(s => s.PropertyType)
            .FirstAsync(x => x.Id == dc.Id);

        _ = sseHub.BroadcastConfigAsync("device_connection", created.Id, "created");
        return Ok(MapToDetailDto(created));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateDeviceConnectionRequest req)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var dc = await db.DeviceConnections.FindAsync(id);
        if (dc == null) return NotFound();

        var adapter = adapters.FirstOrDefault(a => a.ProtocolId == dc.Protocol);
        if (adapter == null)
            return NotFound(new ErrorResponse("unknown_protocol", $"No adapter for protocol '{dc.Protocol}'"));

        var validation = adapter.ValidateConfig(req.Config);
        if (!validation.IsValid)
            return BadRequest(new ErrorResponse("invalid_config", validation.Error!));

        dc.Name = req.Name;
        dc.ConfigJson = req.Config;
        dc.PollIntervalMs = req.PollIntervalMs;
        dc.IsEnabled = req.IsEnabled;
        await db.SaveChangesAsync();

        _ = sseHub.BroadcastConfigAsync("device_connection", dc.Id, "updated");
        return Ok(MapToDto(dc));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, [FromQuery] bool cascade = false)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var dc = await db.DeviceConnections
            .Include(x => x.EquipmentType)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (dc == null) return NotFound();

        if (cascade && dc.EquipmentType != null)
        {
            // Remove LineEquipment rows that reference this EquipmentType first (FK Restrict)
            var lineEquipments = await db.LineEquipments
                .Where(le => le.EquipmentTypeId == dc.EquipmentType.Id)
                .ToListAsync();
            db.LineEquipments.RemoveRange(lineEquipments);

            db.EquipmentTypes.Remove(dc.EquipmentType);
        }

        db.DeviceConnections.Remove(dc);
        await db.SaveChangesAsync();
        _ = sseHub.BroadcastConfigAsync("device_connection", id, "deleted");
        return NoContent();
    }

    [HttpPost("{id:int}/test")]
    public async Task<IActionResult> TestConnection(int id)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var dc = await db.DeviceConnections.FindAsync(id);
        if (dc == null) return NotFound();

        var adapter = adapters.FirstOrDefault(a => a.ProtocolId == dc.Protocol);
        if (adapter == null)
            return NotFound(new ErrorResponse("unknown_protocol", $"協議 '{dc.Protocol}' 不存在"));

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var result = await adapter.DiscoverAsync(dc.ConfigJson, cts.Token);

        if (!result.IsSuccess)
            return Ok(new ScanResponse(false, null, result.ErrorMessage));

        var points = result.Value!.Points.Select(p => new DiscoveredPointDto(
            p.RawAddress, p.CurrentValue, p.DataType, p.SuggestedLabel
        )).ToList();

        return Ok(new ScanResponse(true, points, null));
    }

    private static DeviceConnectionDto MapToDto(DeviceConnection dc) => new(
        dc.Id, dc.Name, dc.Protocol, dc.ConfigJson,
        dc.PollIntervalMs, dc.IsEnabled,
        dc.LastPollAt, dc.LastPollError, dc.ConsecutiveErrors,
        dc.EquipmentTypeId, dc.EquipmentType?.Name,
        dc.CreatedAt);

    private static DeviceConnectionDetailDto MapToDetailDto(DeviceConnection dc) => new(
        dc.Id, dc.Name, dc.Protocol, dc.ConfigJson,
        dc.PollIntervalMs, dc.IsEnabled,
        dc.LastPollAt, dc.LastPollError, dc.ConsecutiveErrors,
        dc.EquipmentTypeId,
        dc.EquipmentType != null ? EquipmentTypeController.MapToDtoPublic(dc.EquipmentType) : null,
        dc.CreatedAt);
}
