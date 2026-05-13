namespace IoT.CentralApi.Services.Alerting;

/// <summary>
/// 告警通道介面。通道實作 (WeChat / SSE / Email / Webhook) 都註冊為
/// IEnumerable&lt;IAlertChannel&gt;，AlertDispatcher 一視同仁 fan-out。
/// </summary>
public interface IAlertChannel
{
    /// <summary>通道顯示名稱（log 用）</summary>
    string Name { get; }

    /// <summary>是否啟用（讓 channel 自己讀 config 決定）</summary>
    bool IsEnabled { get; }

    Task SendAsync(ConnectionAlertEvent evt, CancellationToken ct);
}
