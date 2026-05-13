using IoT.CentralApi.Adapters.Contracts;

namespace IoT.CentralApi.Services;

public enum AlertTransition
{
    None,
    BecameUnhealthy,
    Recovered,
}

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

    private bool _wasUnhealthy;       // tracks whether we previously crossed into unhealthy
    private DateTime? _lastAlertAt;   // for cooldown re-arm

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

    /// <summary>
    /// Evaluates whether a state transition occurred since the previous call.
    /// Returns BecameUnhealthy on first crossing past threshold (cooldown re-arm allowed),
    /// Recovered when a success follows a previously-unhealthy state, None otherwise.
    /// </summary>
    public AlertTransition EvaluateAlertTransition(int alertThreshold, int cooldownSec)
    {
        lock (_lock)
        {
            var nowUnhealthy = _consecutiveErrors >= alertThreshold;
            var now = DateTime.UtcNow;

            if (nowUnhealthy && !_wasUnhealthy)
            {
                var cooledDown = _lastAlertAt == null
                    || (now - _lastAlertAt.Value).TotalSeconds >= cooldownSec;
                if (!cooledDown) return AlertTransition.None;

                _wasUnhealthy = true;
                _lastAlertAt = now;
                return AlertTransition.BecameUnhealthy;
            }

            if (!nowUnhealthy && _wasUnhealthy && _lastSuccessAt != null)
            {
                _wasUnhealthy = false;
                _lastAlertAt = now;
                return AlertTransition.Recovered;
            }

            return AlertTransition.None;
        }
    }
}
