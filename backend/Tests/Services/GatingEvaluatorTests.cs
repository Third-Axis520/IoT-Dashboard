using FluentAssertions;
using IoT.CentralApi.Models;
using IoT.CentralApi.Services;
using Microsoft.Extensions.Logging;
using Xunit;

namespace IoT.CentralApi.Tests.Services;

internal sealed class RecordingLogger<T> : ILogger<T>
{
    public List<(LogLevel Level, string Message)> Records { get; } = new();
    IDisposable? ILogger.BeginScope<TState>(TState state) => null;
    public bool IsEnabled(LogLevel logLevel) => true;
    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        => Records.Add((logLevel, formatter(state, exception)));
}

public class GatingEvaluatorTests
{
    private static SensorGatingRule Rule(int delayMs = 0, int maxAgeMs = 1000) => new()
    {
        Id = 1,
        GatedAssetCode = "ASSET-A", GatedSensorId = 5,
        GatingAssetCode = "ASSET-B", GatingSensorId = 3,
        DelayMs = delayMs, MaxAgeMs = maxAgeMs
    };

    [Fact]
    public void NoRule_ReturnsPass()
    {
        var cache = new LatestReadingCache();
        var sut = new GatingEvaluator(cache);
        sut.Evaluate(null, DateTime.UtcNow).Should().Be(GatingDecision.Pass);
    }

    [Fact]
    public void NoDi_ReturnsNoData()
    {
        var cache = new LatestReadingCache();
        var sut = new GatingEvaluator(cache);
        sut.Evaluate(Rule(), DateTime.UtcNow).Should().Be(GatingDecision.NoData);
    }

    [Fact]
    public void StaleDi_ReturnsStale()
    {
        var cache = new LatestReadingCache();
        var now = DateTime.UtcNow;
        cache.Update("ASSET-B", 3, 1.0, now.AddSeconds(-2));
        var sut = new GatingEvaluator(cache);
        sut.Evaluate(Rule(maxAgeMs: 1000), now).Should().Be(GatingDecision.Stale);
    }

    [Fact]
    public void DiFalse_ReturnsNotPresent()
    {
        var cache = new LatestReadingCache();
        var now = DateTime.UtcNow;
        cache.Update("ASSET-B", 3, 0.0, now);
        var sut = new GatingEvaluator(cache);
        sut.Evaluate(Rule(), now).Should().Be(GatingDecision.NotPresent);
    }

    [Fact]
    public void DiTrue_NoDelay_ReturnsPass()
    {
        var cache = new LatestReadingCache();
        var now = DateTime.UtcNow;
        cache.Update("ASSET-B", 3, 1.0, now);
        var sut = new GatingEvaluator(cache);
        sut.Evaluate(Rule(delayMs: 0), now).Should().Be(GatingDecision.Pass);
    }

    [Fact]
    public void DiTrue_WithinDelay_ReturnsSettling()
    {
        var cache = new LatestReadingCache();
        var t0 = DateTime.UtcNow;
        cache.Update("ASSET-B", 3, 1.0, t0);
        var sut = new GatingEvaluator(cache);
        sut.Evaluate(Rule(delayMs: 200), t0).Should().Be(GatingDecision.Settling);
        sut.Evaluate(Rule(delayMs: 200), t0.AddMilliseconds(100)).Should().Be(GatingDecision.Settling);
    }

    [Fact]
    public void DiTrue_AfterDelay_ReturnsPass()
    {
        var cache = new LatestReadingCache();
        var t0 = DateTime.UtcNow;
        cache.Update("ASSET-B", 3, 1.0, t0);
        var sut = new GatingEvaluator(cache);
        sut.Evaluate(Rule(delayMs: 200), t0).Should().Be(GatingDecision.Settling);
        sut.Evaluate(Rule(delayMs: 200), t0.AddMilliseconds(250)).Should().Be(GatingDecision.Pass);
    }

    [Fact]
    public void DiFalse_ResetsSettlingTimer()
    {
        var cache = new LatestReadingCache();
        var t0 = DateTime.UtcNow;
        var rule = Rule(delayMs: 200);
        var sut = new GatingEvaluator(cache);

        cache.Update("ASSET-B", 3, 1.0, t0);
        sut.Evaluate(rule, t0).Should().Be(GatingDecision.Settling);

        cache.Update("ASSET-B", 3, 0.0, t0.AddMilliseconds(100));
        sut.Evaluate(rule, t0.AddMilliseconds(100)).Should().Be(GatingDecision.NotPresent);

        cache.Update("ASSET-B", 3, 1.0, t0.AddMilliseconds(200));
        sut.Evaluate(rule, t0.AddMilliseconds(200)).Should().Be(GatingDecision.Settling);
        sut.Evaluate(rule, t0.AddMilliseconds(250)).Should().Be(GatingDecision.Settling);
        sut.Evaluate(rule, t0.AddMilliseconds(410)).Should().Be(GatingDecision.Pass);
    }

    [Fact]
    public void Boundary_DiValueExactlyHalf_TreatedAsTrue()
    {
        var cache = new LatestReadingCache();
        var now = DateTime.UtcNow;
        cache.Update("ASSET-B", 3, 0.5, now);
        var sut = new GatingEvaluator(cache);
        sut.Evaluate(Rule(), now).Should().Be(GatingDecision.Pass);
    }

    [Fact]
    public void Boundary_AgeExactlyMaxAge_NotStale()
    {
        var cache = new LatestReadingCache();
        var now = DateTime.UtcNow;
        cache.Update("ASSET-B", 3, 1.0, now.AddMilliseconds(-1000));
        var sut = new GatingEvaluator(cache);
        sut.Evaluate(Rule(maxAgeMs: 1000), now).Should().Be(GatingDecision.Pass);
    }

    [Fact]
    public void StaleDi_LogsWarningOnce_ThenThrottled()
    {
        var cache = new LatestReadingCache();
        var log = new RecordingLogger<GatingEvaluator>();
        var sut = new GatingEvaluator(cache, log);
        var now = DateTime.UtcNow;
        cache.Update("ASSET-B", 3, 1.0, now.AddSeconds(-2));

        // First Stale → logs warning
        sut.Evaluate(Rule(maxAgeMs: 1000), now).Should().Be(GatingDecision.Stale);
        // Second Stale 500ms later → throttled (no new warning)
        sut.Evaluate(Rule(maxAgeMs: 1000), now.AddMilliseconds(500)).Should().Be(GatingDecision.Stale);
        // 61s later → window elapsed, logs again
        sut.Evaluate(Rule(maxAgeMs: 1000), now.AddSeconds(61)).Should().Be(GatingDecision.Stale);

        var warns = log.Records.Where(r => r.Level == LogLevel.Warning).ToList();
        warns.Should().HaveCount(2);
        warns[0].Message.Should().Contain("Gating Stale").And.Contain("ASSET-B").And.Contain("ASSET-A");
    }
}
