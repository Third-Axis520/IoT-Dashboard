using IoT.CentralApi.Data;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;

namespace IoT.CentralApi.Controllers;

[ApiController]
[Route("api/diagnostics")]
public class DiagnosticsController(
    IDbContextFactory<IoTDbContext> dbFactory,
    ConnectionStateRegistry registry,
    IEnumerable<IHostedService> hostedServices) : ControllerBase
{
    [HttpGet("polling")]
    public async Task<IActionResult> GetPollingStatus()
    {
        var pollingService = hostedServices
            .OfType<PollingBackgroundService>()
            .FirstOrDefault();

        await using var db = await dbFactory.CreateDbContextAsync();
        var connections = await db.DeviceConnections
            .Where(dc => dc.Protocol != "push_ingest")
            .OrderByDescending(dc => dc.CreatedAt)
            .ToListAsync();

        var connectionDtos = connections.Select(dc =>
        {
            var hasState = registry.TryGet(dc.Id, out var state);
            var status = !dc.IsEnabled ? "disabled"
                : (dc.ConsecutiveErrors > 0 ? "error" : "healthy");

            return new ConnectionHealthDto(
                Id: dc.Id,
                Name: dc.Name,
                Protocol: dc.Protocol,
                Status: status,
                ConsecutiveErrors: dc.ConsecutiveErrors,
                LastPollAt: dc.LastPollAt,
                LastErrorMessage: dc.LastPollError);
        }).ToList();

        var activeCount = connections.Count(dc => dc.IsEnabled);

        const int StaleSecondsThreshold = 60;
        var isAlive = pollingService != null
            && pollingService.IsRunning
            && (!pollingService.LastTickAt.HasValue
                || (DateTime.UtcNow - pollingService.LastTickAt.Value).TotalSeconds < StaleSecondsThreshold);

        return Ok(new PollingDiagnosticsDto(
            Polling: new PollingStatusDto(
                IsRunning: isAlive,
                ActiveConnections: activeCount,
                LastTickAt: pollingService?.LastTickAt),
            Connections: connectionDtos));
    }

}
