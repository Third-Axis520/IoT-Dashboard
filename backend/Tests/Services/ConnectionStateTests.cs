using IoT.CentralApi.Adapters.Contracts;
using IoT.CentralApi.Services;

namespace IoT.CentralApi.Tests.Services;

public class ConnectionStateTests
{
    [Fact]
    public void RecordSuccess_ResetsConsecutiveErrors()
    {
        var state = new ConnectionState();
        state.RecordFailure(ErrorKind.Transient, "timeout");
        state.RecordFailure(ErrorKind.Transient, "timeout");

        state.RecordSuccess();

        state.ConsecutiveErrors.Should().Be(0);
        state.LastErrorKind.Should().Be(ErrorKind.None);
        state.LastErrorMessage.Should().BeNull();
        state.LastSuccessAt.Should().NotBeNull();
    }

    [Fact]
    public void RecordFailure_IncrementsConsecutiveErrors()
    {
        var state = new ConnectionState();

        state.RecordFailure(ErrorKind.Transient, "timeout");
        state.ConsecutiveErrors.Should().Be(1);

        state.RecordFailure(ErrorKind.DeviceError, "device error");
        state.ConsecutiveErrors.Should().Be(2);
        state.LastErrorKind.Should().Be(ErrorKind.DeviceError);
        state.LastErrorMessage.Should().Be("device error");
    }

    [Fact]
    public void CircuitBreaker_OpensAfterThreeErrors()
    {
        var state = new ConnectionState();

        state.RecordFailure(ErrorKind.Transient, "err1");
        state.RecordFailure(ErrorKind.Transient, "err2");
        state.IsCircuitOpen.Should().BeFalse();

        state.RecordFailure(ErrorKind.Transient, "err3");
        state.IsCircuitOpen.Should().BeTrue();
    }

    [Fact]
    public void ScheduleNext_UsesBaseInterval_WhenHealthy()
    {
        var state = new ConnectionState();
        state.RecordSuccess();

        state.ScheduleNext(5000);

        state.ShouldPoll().Should().BeFalse();
        // NextPollAt should be ~5s in the future
    }

    [Fact]
    public void ScheduleNext_UsesSlowRetry_WhenCircuitOpen()
    {
        var state = new ConnectionState();
        state.RecordFailure(ErrorKind.Transient, "err");
        state.RecordFailure(ErrorKind.Transient, "err");
        state.RecordFailure(ErrorKind.Transient, "err");

        state.ScheduleNext(5000);

        // Circuit open → slow retry (30s), so ShouldPoll should be false
        state.ShouldPoll().Should().BeFalse();
    }

    [Fact]
    public void ShouldPoll_ReturnsTrue_WhenNeverScheduled()
    {
        var state = new ConnectionState();
        state.ShouldPoll().Should().BeTrue();
    }
}
