using IoT.CentralApi.Adapters.Contracts;

namespace IoT.CentralApi.Services;

/// <summary>
/// Per-connection in-memory state for polling health tracking.
/// Circuit breaker: >=3 consecutive errors → 30s slow retry.
/// </summary>
public class ConnectionState
{
    private const int CircuitBreakerThreshold = 3;
    private static readonly TimeSpan SlowRetryInterval = TimeSpan.FromSeconds(30);

    private int _consecutiveErrors;
    public int ConsecutiveErrors => _consecutiveErrors;
    public DateTime? NextPollAt { get; private set; }
    public ErrorKind LastErrorKind { get; private set; }
    public string? LastErrorMessage { get; private set; }
    public DateTime? LastSuccessAt { get; private set; }

    public void RecordSuccess()
    {
        Interlocked.Exchange(ref _consecutiveErrors, 0);
        LastErrorKind = ErrorKind.None;
        LastErrorMessage = null;
        LastSuccessAt = DateTime.UtcNow;
    }

    public void RecordFailure(ErrorKind kind, string message)
    {
        Interlocked.Increment(ref _consecutiveErrors);
        LastErrorKind = kind;
        LastErrorMessage = message;
    }

    public void ScheduleNext(int baseIntervalMs)
    {
        if (ConsecutiveErrors >= CircuitBreakerThreshold)
        {
            NextPollAt = DateTime.UtcNow + SlowRetryInterval;
        }
        else
        {
            NextPollAt = DateTime.UtcNow + TimeSpan.FromMilliseconds(baseIntervalMs);
        }
    }

    public bool ShouldPoll() =>
        NextPollAt == null || DateTime.UtcNow >= NextPollAt;

    public bool IsCircuitOpen => ConsecutiveErrors >= CircuitBreakerThreshold;
}
