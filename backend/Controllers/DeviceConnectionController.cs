using IoT.CentralApi.Adapters.Contracts;
using IoT.CentralApi.Data;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/device-connections")]
public class DeviceConnectionController(
    IDbContextFactory<IoTDbContext> dbFactory,
    IEnumerable<IProtocolAdapter> adapters) : ControllerBase
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
        Id: dc.Id,
        Name: dc.Name,
        Protocol: dc.Protocol,
        ConfigJson: dc.ConfigJson,
        PollIntervalMs: dc.PollIntervalMs,
        IsEnabled: dc.IsEnabled,
        LastPollAt: dc.LastPollAt,
        LastPollError: dc.LastPollError,
        ConsecutiveErrors: dc.ConsecutiveErrors,
        EquipmentTypeId: dc.EquipmentTypeId,
        EquipmentTypeName: dc.EquipmentType?.Name,
        CreatedAt: dc.CreatedAt,
        AlertOnConsecutiveErrors: dc.AlertOnConsecutiveErrors,
        AlertCooldownSec: dc.AlertCooldownSec,
        IsAlertEnabled: dc.IsAlertEnabled);

    private static DeviceConnectionDetailDto MapToDetailDto(DeviceConnection dc, string? assetCode = null) => new(
        Id: dc.Id,
        Name: dc.Name,
        Protocol: dc.Protocol,
        ConfigJson: dc.ConfigJson,
        PollIntervalMs: dc.PollIntervalMs,
        IsEnabled: dc.IsEnabled,
        LastPollAt: dc.LastPollAt,
        LastPollError: dc.LastPollError,
        ConsecutiveErrors: dc.ConsecutiveErrors,
        EquipmentTypeId: dc.EquipmentTypeId,
        EquipmentType: dc.EquipmentType != null ? EquipmentTypeController.MapToDtoPublic(dc.EquipmentType) : null,
        CreatedAt: dc.CreatedAt,
        AssetCode: assetCode,
        AlertOnConsecutiveErrors: dc.AlertOnConsecutiveErrors,
        AlertCooldownSec: dc.AlertCooldownSec,
        IsAlertEnabled: dc.IsAlertEnabled);
}
