namespace IoT.CentralApi.Services.Alerting.Channels;

/// <summary>
/// 永遠啟用的內建通道：把連線告警 SSE 廣播給 Dashboard。
/// 沒有外部依賴，保證使用者「在看板就看得到」最低保障。
/// </summary>
public class SseAlertChannel(SseHub sseHub) : IAlertChannel
{
    public string Name => "sse";
    public bool IsEnabled => true;

    public Task SendAsync(ConnectionAlertEvent evt, CancellationToken ct) =>
        sseHub.BroadcastConnectionAlertAsync(new
        {
            kind = evt.Kind.ToString(),
            connectionId = evt.ConnectionId,
            connectionName = evt.ConnectionName,
            protocol = evt.Protocol,
            consecutiveErrors = evt.ConsecutiveErrors,
            errorMessage = evt.ErrorMessage,
            occurredAt = evt.OccurredAt,
        }, ct);
}
