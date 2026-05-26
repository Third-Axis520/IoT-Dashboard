using System.Collections.Concurrent;
using System.Text.Json;
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
    IoT.CentralApi.Services.Alerting.AlertDispatcher alertDispatcher,
    ILogger<PollingBackgroundService> logger) : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(1);
    private DateTime? _lastTickAt;

    // Serialise polls per (host:port) so connections sharing a gateway never
    // overlap TCP connects — fixes the 2026-05-13 LeanA gateway concurrency
    // failure where 5 connections to 192.168.62.74:502 ran in parallel and got
    // IOException "remote host forcibly closed an existing connection".
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _hostLocks = new();

    public DateTime? LastTickAt => _lastTickAt;
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

        // Resolve AssetCode for each connection via LineEquipment (Device table removed).
        // Build a map: EquipmentTypeId → first non-null AssetCode from LineEquipments.
        var equipmentTypeIds = connections
            .Where(dc => dc.EquipmentTypeId.HasValue)
            .Select(dc => dc.EquipmentTypeId!.Value)
            .Distinct()
            .ToList();

        var assetCodeMap = await db.LineEquipments
            .Where(le => equipmentTypeIds.Contains(le.EquipmentTypeId) && le.AssetCode != null)
            .GroupBy(le => le.EquipmentTypeId)
            .Select(g => new { EquipmentTypeId = g.Key, AssetCode = g.First().AssetCode })
            .ToDictionaryAsync(x => x.EquipmentTypeId, x => x.AssetCode!, ct);

        var tasks = connections.Select(dc =>
        {
            string? assetCode = null;
            if (dc.EquipmentTypeId.HasValue)
                assetCodeMap.TryGetValue(dc.EquipmentTypeId.Value, out assetCode);
            return PollOneAsync(dc, assetCode, dbFactory, ct);
        });
        await Task.WhenAll(tasks);
    }

    private async Task PollOneAsync(
        DeviceConnection dc,
        string? assetCode,
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

        var hostLock = _hostLocks.GetOrAdd(GetHostKey(dc), _ => new SemaphoreSlim(1, 1));
        Result<PollResult> result;
        // Wait for the host lock using the parent token only. The per-poll
        // 10s deadline must start AFTER we hold the lock, otherwise the 5th
        // connection on a shared gateway sees its deadline elapse while
        // queued, producing spurious cancellations.
        await hostLock.WaitAsync(ct);
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(10));
            result = await adapter.PollAsync(dc.ConfigJson, cts.Token);
        }
        finally
        {
            hostLock.Release();
        }

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
            await EvaluateAndDispatchAsync(dc, state, ct);
            return;
        }

        state.RecordSuccess();
        state.ScheduleNext(dc.PollIntervalMs ?? 5000);
        await EvaluateAndDispatchAsync(dc, state, ct);

        // Convert PollResult → IngestPayload
        if (dc.EquipmentType?.Sensors is { Count: > 0 } sensors && assetCode != null)
        {
            var payload = ConvertToPayload(assetCode, result.Value!, sensors);
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
        string assetCode,
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

        return new IngestPayload
        {
            AssetCode = assetCode,
            Timestamp = new DateTimeOffset(poll.Timestamp).ToUnixTimeMilliseconds(),
            IsConnected = true,
            Sensors = sensorReadings,
        };
    }

    private async Task EvaluateAndDispatchAsync(DeviceConnection dc, ConnectionState state, CancellationToken ct)
    {
        if (!dc.IsAlertEnabled) return;

        var transition = state.EvaluateAlertTransition(
            alertThreshold: dc.AlertOnConsecutiveErrors,
            cooldownSec: dc.AlertCooldownSec);

        if (transition == IoT.CentralApi.Services.AlertTransition.None) return;

        var kind = transition == IoT.CentralApi.Services.AlertTransition.BecameUnhealthy
            ? IoT.CentralApi.Services.Alerting.ConnectionAlertKind.Unhealthy
            : IoT.CentralApi.Services.Alerting.ConnectionAlertKind.Recovered;

        var evt = new IoT.CentralApi.Services.Alerting.ConnectionAlertEvent(
            Kind: kind,
            ConnectionId: dc.Id,
            ConnectionName: dc.Name,
            Protocol: dc.Protocol,
            ConsecutiveErrors: state.ConsecutiveErrors,
            ErrorMessage: state.LastErrorMessage,
            OccurredAt: DateTime.UtcNow);

        await alertDispatcher.DispatchAsync(evt, ct);
    }

    // Extract a stable group key from ConfigJson. Connections that share host:port
    // share a semaphore and therefore poll serially. Protocols without host/port
    // (or invalid JSON) fall back to a per-connection key so they don't block others.
    internal static string GetHostKey(DeviceConnection dc)
    {
        try
        {
            using var doc = JsonDocument.Parse(dc.ConfigJson);
            var root = doc.RootElement;
            if (!root.TryGetProperty("host", out var hostEl) || hostEl.ValueKind == JsonValueKind.Null)
                return $"conn-{dc.Id}";
            var host = hostEl.GetString();
            if (string.IsNullOrWhiteSpace(host))
                return $"conn-{dc.Id}";
            var port = root.TryGetProperty("port", out var portEl) ? portEl.ToString() : "default";
            return $"{host}:{port}";
        }
        catch (JsonException)
        {
            return $"conn-{dc.Id}";
        }
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
