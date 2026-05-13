using IoT.CentralApi.Services.Alerting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace IoT.CentralApi.Services;

/// <summary>
/// 監看 PollingBackgroundService 是否還活著。
/// LastTickAt 距今超過 StaleThreshold → 推 PollingStalled 告警。
/// 同一場停擺只通知一次（episode-based），恢復後重新 arm。
/// </summary>
public class PollingWatchdogService : BackgroundService
{
    private readonly AlertDispatcher _dispatcher;
    private readonly ILogger<PollingWatchdogService> _logger;
    private readonly TimeSpan _staleThreshold;
    private readonly IServiceProvider? _serviceProvider;
    private bool _alertedForCurrentStall;

    public PollingWatchdogService(
        AlertDispatcher dispatcher,
        ILogger<PollingWatchdogService> logger,
        TimeSpan staleThreshold,
        IServiceProvider? serviceProvider = null)
    {
        _dispatcher = dispatcher;
        _logger = logger;
        _staleThreshold = staleThreshold;
        _serviceProvider = serviceProvider;
    }

    /// <summary>DI-friendly constructor with default 30s threshold.</summary>
    public PollingWatchdogService(
        AlertDispatcher dispatcher,
        ILogger<PollingWatchdogService> logger,
        IServiceProvider serviceProvider)
        : this(dispatcher, logger, TimeSpan.FromSeconds(30), serviceProvider) { }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Wait one cycle so PollingBackgroundService has a chance to start ticking
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var polling = _serviceProvider?.GetServices<IHostedService>()
                    .OfType<PollingBackgroundService>()
                    .FirstOrDefault();

                if (polling != null && polling.LastTickAt.HasValue)
                {
                    await CheckOnceAsync(polling.LastTickAt.Value, stoppingToken);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "PollingWatchdog tick failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
        }
    }

    /// <summary>Testable single-check. Returns true if alert was dispatched.</summary>
    public async Task<bool> CheckOnceAsync(DateTime lastTickAt, CancellationToken ct)
    {
        var age = DateTime.UtcNow - lastTickAt;
        var stalled = age > _staleThreshold;

        if (stalled && !_alertedForCurrentStall)
        {
            _alertedForCurrentStall = true;
            _logger.LogCritical("Polling stalled: LastTickAt={LastTickAt}, age={Age}", lastTickAt, age);

            var evt = new ConnectionAlertEvent(
                Kind: ConnectionAlertKind.PollingStalled,
                ConnectionId: 0,
                ConnectionName: "PollingBackgroundService",
                Protocol: "internal",
                ConsecutiveErrors: 0,
                ErrorMessage: $"No poll tick for {age.TotalSeconds:F0}s (threshold {_staleThreshold.TotalSeconds:F0}s)",
                OccurredAt: DateTime.UtcNow);
            await _dispatcher.DispatchAsync(evt, ct);
            return true;
        }

        if (!stalled && _alertedForCurrentStall)
        {
            _alertedForCurrentStall = false; // re-arm for next episode
        }

        return false;
    }
}
