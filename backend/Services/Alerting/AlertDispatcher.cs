using Microsoft.Extensions.Logging;

namespace IoT.CentralApi.Services.Alerting;

/// <summary>
/// Fan-out connection alerts to all registered IAlertChannel implementations.
/// Each channel failure is logged + isolated so one bad channel can't break others.
/// </summary>
public class AlertDispatcher(IEnumerable<IAlertChannel> channels, ILogger<AlertDispatcher> logger)
{
    public async Task DispatchAsync(ConnectionAlertEvent evt, CancellationToken ct)
    {
        var enabled = channels.Where(c => c.IsEnabled).ToList();
        if (enabled.Count == 0) return;

        var tasks = enabled.Select(async c =>
        {
            try
            {
                await c.SendAsync(evt, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Alert channel '{Channel}' threw for connection {Id} ({Kind})",
                    c.Name, evt.ConnectionId, evt.Kind);
            }
        });

        await Task.WhenAll(tasks);
    }
}
