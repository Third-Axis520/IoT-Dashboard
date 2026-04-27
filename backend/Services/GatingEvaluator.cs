using System.Collections.Concurrent;
using IoT.CentralApi.Models;

namespace IoT.CentralApi.Services;

public class GatingEvaluator(ILatestReadingCache cache)
{
    private readonly ConcurrentDictionary<(string, int), DateTime> _settlingStartedAt = new();

    public GatingDecision Evaluate(SensorGatingRule? rule, DateTime now)
    {
        if (rule is null)
            return GatingDecision.Pass;

        var di = cache.Get(rule.GatingAssetCode, rule.GatingSensorId);
        if (di is null)
            return GatingDecision.NoData;

        var ageMs = (now - di.Timestamp).TotalMilliseconds;
        if (ageMs > rule.MaxAgeMs)
            return GatingDecision.Stale;

        var key = (rule.GatingAssetCode, rule.GatingSensorId);
        if (di.Value < 0.5)
        {
            _settlingStartedAt.TryRemove(key, out _);
            return GatingDecision.NotPresent;
        }

        if (rule.DelayMs > 0)
        {
            var startedAt = _settlingStartedAt.GetOrAdd(key, _ => now);
            var settledMs = (now - startedAt).TotalMilliseconds;
            if (settledMs < rule.DelayMs)
                return GatingDecision.Settling;
        }

        return GatingDecision.Pass;
    }
}

public enum GatingDecision { Pass, NoData, Stale, NotPresent, Settling }
