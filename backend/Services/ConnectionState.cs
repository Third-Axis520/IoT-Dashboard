using IoT.CentralApi.Adapters.Contracts;

namespace IoT.CentralApi.Services;

/// <summary>
/// Per-connection in-memory state for polling health tracking.
/// Circuit breaker: >=3 consecutive errors → 30s slow retry.
///
/// Thread safety: _consecutiveErrors uses Interlocked; all other fields use a
/// lock so RecordSuccess/RecordFailure/ScheduleNext are atomic even when
/// Task.WhenAll polls multiple connections in parallel.
/// </summary>
public class ConnectionState
{
    private const int CircuitBreakerThreshold = 3;
    private static readonly TimeSpan SlowRetryInterval = TimeSpan.FromSeconds(30);

    private readonly object _lock = new();

    private int _consecutiveErrors;
    public int ConsecutiveErrors => _consecutiveErrors;

    private DateTime? _nextPollAt;
    public DateTime? NextPollAt { get { lock (_lock) return _nextPollAt; } }

    private ErrorKind _lastErrorKind;
    public ErrorKind LastErrorKind { get { lock (_lock) return _lastErrorKind; } }

    private string? _lastErrorMessage;
    public string? LastErrorMessage { get { lock (_lock) return _lastErrorMessage; } }

    private DateTime? _lastSuccessAt;
    public DateTime? LastSuccessAt { get { lock (_lock) return _lastSuccessAt; } }

    public void RecordSuccess()
    {
        Interlocked.Exchange(ref _consecutiveErrors, 0);
        lock (_lock)
        {
            _lastErrorKind = ErrorKind.None;
            _lastErrorMessage = null;
            _lastSuccessAt = DateTime.UtcNow;
        }
    }

    public void RecordFailure(ErrorKind kind, string message)
    {
        Interlocked.Increment(ref _consecutiveErrors);
        lock (_lock)
        {
            _lastErrorKind = kind;
            _lastErrorMessage = message;
        }
    }

    public void ScheduleNext(int baseIntervalMs)
    {
        lock (_lock)
        {
            _nextPollAt = ConsecutiveErrors >= CircuitBreakerThreshold
                ? DateTime.UtcNow + SlowRetryInterval
                : DateTime.UtcNow + TimeSpan.FromMilliseconds(baseIntervalMs);
        }
    }

    public bool ShouldPoll()
    {
        lock (_lock)
            return _nextPollAt == null || DateTime.UtcNow >= _nextPollAt;
    }

    public bool IsCircuitOpen => ConsecutiveErrors >= CircuitBreakerThreshold;
}
