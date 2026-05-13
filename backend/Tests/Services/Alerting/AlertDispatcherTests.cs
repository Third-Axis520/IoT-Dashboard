using IoT.CentralApi.Services.Alerting;
using Microsoft.Extensions.Logging.Abstractions;

namespace IoT.CentralApi.Tests.Services.Alerting;

public class AlertDispatcherTests
{
    private class StubChannel : IAlertChannel
    {
        public string Name => "stub";
        public bool IsEnabled { get; set; } = true;
        public List<ConnectionAlertEvent> Sent { get; } = new();
        public Task SendAsync(ConnectionAlertEvent evt, CancellationToken ct)
        {
            Sent.Add(evt);
            return Task.CompletedTask;
        }
    }

    [Fact]
    public async Task DispatchAsync_FansOutToAllEnabledChannels()
    {
        var ch1 = new StubChannel();
        var ch2 = new StubChannel();
        var ch3 = new StubChannel { IsEnabled = false };
        var dispatcher = new AlertDispatcher(new IAlertChannel[] { ch1, ch2, ch3 }, NullLogger<AlertDispatcher>.Instance);

        var evt = new ConnectionAlertEvent(ConnectionAlertKind.Unhealthy, 1, "conn", "modbus_tcp", 5, "boom", DateTime.UtcNow);
        await dispatcher.DispatchAsync(evt, CancellationToken.None);

        ch1.Sent.Should().ContainSingle();
        ch2.Sent.Should().ContainSingle();
        ch3.Sent.Should().BeEmpty();
    }

    [Fact]
    public async Task DispatchAsync_OneChannelThrowing_DoesNotBlockOthers()
    {
        var throwing = new ThrowingChannel();
        var good = new StubChannel();
        var dispatcher = new AlertDispatcher(new IAlertChannel[] { throwing, good }, NullLogger<AlertDispatcher>.Instance);

        var evt = new ConnectionAlertEvent(ConnectionAlertKind.Unhealthy, 1, "c", "p", 5, "e", DateTime.UtcNow);
        await dispatcher.DispatchAsync(evt, CancellationToken.None);

        good.Sent.Should().ContainSingle();
    }

    private class ThrowingChannel : IAlertChannel
    {
        public string Name => "throwing";
        public bool IsEnabled => true;
        public Task SendAsync(ConnectionAlertEvent evt, CancellationToken ct)
            => throw new InvalidOperationException("channel broke");
    }
}
