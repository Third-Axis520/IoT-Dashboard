using System.Collections.Concurrent;

namespace IoT.CentralApi.Services;

/// <summary>
/// Thread-safe registry of per-connection polling state.
/// Registered as Singleton in DI.
/// </summary>
public class ConnectionStateRegistry
{
    private readonly ConcurrentDictionary<int, ConnectionState> _states = new();

    public ConnectionState GetOrCreate(int connectionId) =>
        _states.GetOrAdd(connectionId, _ => new ConnectionState());

    public bool TryGet(int connectionId, out ConnectionState? state) =>
        _states.TryGetValue(connectionId, out state);

    public IReadOnlyDictionary<int, ConnectionState> GetAll() => _states;

    public void Remove(int connectionId) =>
        _states.TryRemove(connectionId, out _);
}
