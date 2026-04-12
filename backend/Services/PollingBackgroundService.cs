using IoT.CentralApi.Adapters.Contracts;
using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Services;

/// <summary>
/// Background service that polls enabled DeviceConnections on their configured interval.
/// Poll results are converted to IngestPayload and fed into DataIngestionService,
/// reusing all existing alert/SSE/WeChat logic.
/// </summary>
public class PollingBackgroundService(
    IServiceScopeFactory scopeFactory,
    IEnumerable<IProtocolAdapter> adapters,
    ConnectionStateRegistry registry,
    ILogger<PollingBackgroundService> logger) : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(1);
    private DateTime _lastTickAt = DateTime.MinValue;

    public DateTime LastTickAt => _lastTickAt;
    public bool IsRunning { get; private set; }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        IsRunning = true;
        logger.LogInformation("PollingBackgroundService started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                _lastTickAt = DateTime.UtcNow;
                await PollAllAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "PollingBackgroundService tick failed");
            }

            await Task.Delay(TickInterval, stoppingToken);
        }

        IsRunning = false;
    }

    private async Task PollAllAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var dbFactory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<IoTDbContext>>();

        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var connections = await db.DeviceConnections
            .Where(dc => dc.IsEnabled && dc.Protocol != "push_ingest")
            .Include(dc => dc.EquipmentType!)
                .ThenInclude(et => et.Sensors)
            .AsNoTracking()
            .ToListAsync(ct);

        var tasks = connections.Select(dc => PollOneAsync(dc, dbFactory, ct));
        await Task.WhenAll(tasks);
    }

    private async Task PollOneAsync(
        DeviceConnection dc,
        IDbContextFactory<IoTDbContext> dbFactory,
        CancellationToken ct)
    {
        var state = registry.GetOrCreate(dc.Id);

        if (!state.ShouldPoll())
            return;

        var adapter = adapters.FirstOrDefault(a => a.ProtocolId == dc.Protocol);
        if (adapter == null)
        {
            state.RecordFailure(ErrorKind.UnknownProtocol, $"Adapter '{dc.Protocol}' not found");
            state.ScheduleNext(dc.PollIntervalMs ?? 5000);
            return;
        }

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(10));

        var result = await adapter.PollAsync(dc.ConfigJson, cts.Token);

        if (!result.IsSuccess)
        {
            state.RecordFailure(result.ErrorKind, result.ErrorMessage ?? "Unknown error");
            state.ScheduleNext(dc.PollIntervalMs ?? 5000);
            await UpdateDbStateAsync(dbFactory, dc.Id, state, ct);

            if (state.ConsecutiveErrors <= 3 || state.ConsecutiveErrors % 10 == 0)
            {
                logger.LogWarning(
                    "Poll failed for connection {Id} ({Name}): {Error} (consecutive: {Count})",
                    dc.Id, dc.Name, result.ErrorMessage, state.ConsecutiveErrors);
            }
            return;
        }

        state.RecordSuccess();
        state.ScheduleNext(dc.PollIntervalMs ?? 5000);

        // Convert PollResult → IngestPayload
        if (dc.EquipmentType?.Sensors is { Count: > 0 } sensors)
        {
            var payload = ConvertToPayload(dc, result.Value!, sensors);
            if (payload != null)
            {
                using var ingestionScope = scopeFactory.CreateScope();
                var ingestionService = ingestionScope.ServiceProvider
                    .GetRequiredService<DataIngestionService>();
                await ingestionService.ProcessAsync(payload);
            }
        }

        await UpdateDbStateAsync(dbFactory, dc.Id, state, ct);
    }

    private static IngestPayload? ConvertToPayload(
        DeviceConnection dc,
        PollResult poll,
        ICollection<EquipmentTypeSensor> sensors)
    {
        // Build RawAddress → SensorId lookup
        var addressMap = sensors
            .Where(s => s.RawAddress != null)
            .ToDictionary(s => s.RawAddress!, s => s.SensorId);

        var sensorReadings = new List<SensorReading_Dto>();

        foreach (var (rawAddress, value) in poll.Values)
        {
            if (addressMap.TryGetValue(rawAddress, out var sensorId))
            {
                sensorReadings.Add(new SensorReading_Dto
                {
                    Id = sensorId,
                    Value = value,
                });
            }
        }

        if (sensorReadings.Count == 0)
            return null;

        // Use synthetic SerialNumber: "poll_{connectionId}"
        return new IngestPayload
        {
            SerialNumber = $"poll_{dc.Id}",
            Timestamp = new DateTimeOffset(poll.Timestamp).ToUnixTimeMilliseconds(),
            IsConnected = true,
            Sensors = sensorReadings,
        };
    }

    private static async Task UpdateDbStateAsync(
        IDbContextFactory<IoTDbContext> dbFactory,
        int connectionId,
        ConnectionState state,
        CancellationToken ct)
    {
        try
        {
            await using var db = await dbFactory.CreateDbContextAsync(ct);
            var dc = await db.DeviceConnections.FindAsync([connectionId], ct);
            if (dc == null) return;

            dc.LastPollAt = DateTime.UtcNow;
            dc.LastPollError = state.LastErrorMessage;
            dc.ConsecutiveErrors = state.ConsecutiveErrors;
            await db.SaveChangesAsync(ct);
        }
        catch (Exception)
        {
            // DB update is best-effort; don't crash the poll loop
        }
    }
}
