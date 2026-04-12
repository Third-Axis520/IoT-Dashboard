using System.Collections.Concurrent;
using System.Text.Json;

namespace IoT.CentralApi.Services;

/// <summary>
/// 管理所有 Dashboard SSE 連線，廣播即時資料更新。
/// </summary>
public class SseHub
{
    private readonly ConcurrentDictionary<string, HttpResponse> _connections = new();
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public void AddConnection(string connectionId, HttpResponse response)
    {
        _connections[connectionId] = response;
    }

    public void RemoveConnection(string connectionId)
    {
        _connections.TryRemove(connectionId, out _);
    }

    public int ConnectionCount => _connections.Count;

    /// <summary>廣播 data-update 事件給所有已連線的 Dashboard。</summary>
    public async Task BroadcastAsync(object payload, CancellationToken ct = default)
    {
        if (_connections.IsEmpty) return;

        var json = JsonSerializer.Serialize(payload, _jsonOptions);
        var message = $"event: data-update\ndata: {json}\n\n";

        var tasks = _connections.Select(kv =>
            WriteToConnectionAsync(kv.Key, kv.Value, message, ct));

        var results = await Task.WhenAll(tasks);

        foreach (var deadId in results.Where(id => id != null))
            _connections.TryRemove(deadId!, out _);
    }

    /// <summary>廣播 config-updated 事件 (entity 新增/修改/刪除時呼叫)。</summary>
    public async Task BroadcastConfigAsync(string entity, int id, string action, CancellationToken ct = default)
    {
        if (_connections.IsEmpty) return;

        var payload = new { entity, id, action };
        var json = JsonSerializer.Serialize(payload, _jsonOptions);
        var message = $"event: config-updated\ndata: {json}\n\n";

        var tasks = _connections.Select(kv =>
            WriteToConnectionAsync(kv.Key, kv.Value, message, ct));

        var results = await Task.WhenAll(tasks);

        foreach (var deadId in results.Where(id => id != null))
            _connections.TryRemove(deadId!, out _);
    }

    /// <summary>傳送 heartbeat 給所有已連線的 Dashboard。</summary>
    public async Task SendHeartbeatAsync(CancellationToken ct = default)
    {
        if (_connections.IsEmpty) return;

        const string message = "event: heartbeat\ndata: {}\n\n";

        var tasks = _connections.Select(kv =>
            WriteToConnectionAsync(kv.Key, kv.Value, message, ct));

        var results = await Task.WhenAll(tasks);

        foreach (var deadId in results.Where(id => id != null))
            _connections.TryRemove(deadId!, out _);
    }

    /// <summary>向單一連線寫入訊息，5 秒 timeout，失敗時回傳 connectionId 供移除。</summary>
    private static async Task<string?> WriteToConnectionAsync(
        string id, HttpResponse response, string message, CancellationToken ct)
    {
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(5));

            await response.WriteAsync(message, cts.Token);
            await response.Body.FlushAsync(cts.Token);
            return null;
        }
        catch
        {
            return id;
        }
    }
}
