using System.Collections.Concurrent;

namespace IoT.CentralApi.Services;

public interface ILatestReadingCache
{
    void Update(string assetCode, int sensorId, double value, DateTime timestamp);
    LatestReading? Get(string assetCode, int sensorId);
}

public record LatestReading(double Value, DateTime Timestamp);

public class LatestReadingCache : ILatestReadingCache
{
    private readonly ConcurrentDictionary<(string, int), LatestReading> _cache = new();

    public void Update(string assetCode, int sensorId, double value, DateTime ts)
        => _cache[(assetCode, sensorId)] = new LatestReading(value, ts);

    public LatestReading? Get(string assetCode, int sensorId)
        => _cache.TryGetValue((assetCode, sensorId), out var r) ? r : null;
}
