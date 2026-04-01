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

        var deadConnections = new List<string>();

        foreach (var (id, response) in _connections)
        {
            try
            {
                await response.WriteAsync(message, ct);
                await response.Body.FlushAsync(ct);
            }
            catch
            {
                deadConnections.Add(id);
            }
        }

        foreach (var id in deadConnections)
            _connections.TryRemove(id, out _);
    }

    /// <summary>傳送 heartbeat 給所有已連線的 Dashboard。</summary>
    public async Task SendHeartbeatAsync(CancellationToken ct = default)
    {
        if (_connections.IsEmpty) return;

        const string message = "event: heartbeat\ndata: {}\n\n";
        var deadConnections = new List<string>();

        foreach (var (id, response) in _connections)
        {
            try
            {
                await response.WriteAsync(message, ct);
                await response.Body.FlushAsync(ct);
            }
            catch
            {
                deadConnections.Add(id);
            }
        }

        foreach (var id in deadConnections)
            _connections.TryRemove(id, out _);
    }
}
