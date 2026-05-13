namespace IoT.CentralApi.Services.Alerting;

/// <summary>
/// Connection-level health alert event. Kind tells channels how to format.
/// </summary>
public record ConnectionAlertEvent(
    ConnectionAlertKind Kind,
    int ConnectionId,
    string ConnectionName,
    string Protocol,
    int ConsecutiveErrors,
    string? ErrorMessage,
    DateTime OccurredAt);

public enum ConnectionAlertKind
{
    /// <summary>連線從健康變成異常（首次達到 AlertOnConsecutiveErrors 門檻）</summary>
    Unhealthy,
    /// <summary>連線從異常恢復健康</summary>
    Recovered,
    /// <summary>整個 polling tick 停擺（watchdog 觸發）</summary>
    PollingStalled,
}
