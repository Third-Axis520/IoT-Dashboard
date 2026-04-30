using System.Collections.Concurrent;
using IoT.CentralApi.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace IoT.CentralApi.Services;

public class GatingEvaluator(ILatestReadingCache cache, ILogger<GatingEvaluator>? logger = null)
{
    private readonly ConcurrentDictionary<(string, int), DateTime> _settlingStartedAt = new();
    // Throttle stale warnings: at most one log per (gating asset, sensor) per 60s.
    // Stale means maxAgeMs < cache age — repeats every poll tick, so unthrottled would flood.
    private readonly ConcurrentDictionary<(string, int), DateTime> _lastStaleWarnedAt = new();
    private readonly ILogger<GatingEvaluator> _log = logger ?? NullLogger<GatingEvaluator>.Instance;

    private static readonly TimeSpan StaleWarnInterval = TimeSpan.FromSeconds(60);

    public GatingDecision Evaluate(SensorGatingRule? rule, DateTime now)
    {
        if (rule is null)
            return GatingDecision.Pass;

        var di = cache.Get(rule.GatingAssetCode, rule.GatingSensorId);
        if (di is null)
            return GatingDecision.NoData;

        var ageMs = (now - di.Timestamp).TotalMilliseconds;
        if (ageMs > rule.MaxAgeMs)
        {
            var staleKey = (rule.GatingAssetCode, rule.GatingSensorId);
            var lastWarned = _lastStaleWarnedAt.GetValueOrDefault(staleKey);
            if (now - lastWarned >= StaleWarnInterval)
            {
                _lastStaleWarnedAt[staleKey] = now;
                _log.LogWarning(
                    "Gating Stale: {GatedAsset}/{GatedSensor} blocked because source {GatingAsset}/{GatingSensor} cache is {AgeMs}ms old (maxAgeMs={MaxAgeMs}). Likely cause: maxAgeMs < source DI pollIntervalMs.",
                    rule.GatedAssetCode, rule.GatedSensorId,
                    rule.GatingAssetCode, rule.GatingSensorId,
                    (int)ageMs, rule.MaxAgeMs);
            }
            return GatingDecision.Stale;
        }

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
