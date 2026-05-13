using IoT.CentralApi.Services;
using IoT.CentralApi.Services.Alerting;
using Microsoft.Extensions.Logging.Abstractions;

namespace IoT.CentralApi.Tests.Services;

public class PollingWatchdogServiceTests
{
    private class CapturingChannel : IAlertChannel
    {
        public string Name => "capture";
        public bool IsEnabled => true;
        public List<ConnectionAlertEvent> Sent { get; } = new();
        public Task SendAsync(ConnectionAlertEvent evt, CancellationToken ct)
        {
            Sent.Add(evt);
            return Task.CompletedTask;
        }
    }

    [Fact]
    public async Task CheckOnce_TickStale_DispatchesStalledAlert()
    {
        var capture = new CapturingChannel();
        var dispatcher = new AlertDispatcher(new IAlertChannel[] { capture }, NullLogger<AlertDispatcher>.Instance);

        var watchdog = new PollingWatchdogService(
            dispatcher,
            NullLogger<PollingWatchdogService>.Instance,
            staleThreshold: TimeSpan.FromSeconds(30));

        var staleTickAt = DateTime.UtcNow.AddSeconds(-60);
        await watchdog.CheckOnceAsync(staleTickAt, CancellationToken.None);

        capture.Sent.Should().ContainSingle()
            .Which.Kind.Should().Be(ConnectionAlertKind.PollingStalled);
    }

    [Fact]
    public async Task CheckOnce_TickFresh_DoesNotDispatch()
    {
        var capture = new CapturingChannel();
        var dispatcher = new AlertDispatcher(new IAlertChannel[] { capture }, NullLogger<AlertDispatcher>.Instance);
        var watchdog = new PollingWatchdogService(
            dispatcher,
            NullLogger<PollingWatchdogService>.Instance,
            staleThreshold: TimeSpan.FromSeconds(30));

        var freshTickAt = DateTime.UtcNow.AddSeconds(-5);
        await watchdog.CheckOnceAsync(freshTickAt, CancellationToken.None);

        capture.Sent.Should().BeEmpty();
    }

    [Fact]
    public async Task CheckOnce_StallThenRecover_DispatchesOnlyOncePerEpisode()
    {
        var capture = new CapturingChannel();
        var dispatcher = new AlertDispatcher(new IAlertChannel[] { capture }, NullLogger<AlertDispatcher>.Instance);
        var watchdog = new PollingWatchdogService(
            dispatcher,
            NullLogger<PollingWatchdogService>.Instance,
            staleThreshold: TimeSpan.FromSeconds(30));

        var stale = DateTime.UtcNow.AddSeconds(-60);
        await watchdog.CheckOnceAsync(stale, CancellationToken.None);
        await watchdog.CheckOnceAsync(stale, CancellationToken.None); // still stale, same episode

        capture.Sent.Should().ContainSingle();
    }
}
