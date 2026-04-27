using FluentAssertions;
using IoT.CentralApi.Services;
using Xunit;

namespace IoT.CentralApi.Tests.Services;

public class LatestReadingCacheTests
{
    [Fact]
    public void Get_NonExistent_ReturnsNull()
    {
        var cache = new LatestReadingCache();
        cache.Get("ASSET-A", 1).Should().BeNull();
    }

    [Fact]
    public void Update_Then_Get_ReturnsLatest()
    {
        var cache = new LatestReadingCache();
        var ts = new DateTime(2026, 4, 27, 10, 0, 0, DateTimeKind.Utc);
        cache.Update("ASSET-A", 1, 48.5, ts);

        var result = cache.Get("ASSET-A", 1);
        result.Should().NotBeNull();
        result!.Value.Should().Be(48.5);
        result.Timestamp.Should().Be(ts);
    }

    [Fact]
    public void Update_Twice_KeepsLatest()
    {
        var cache = new LatestReadingCache();
        var ts1 = DateTime.UtcNow.AddSeconds(-1);
        var ts2 = DateTime.UtcNow;
        cache.Update("ASSET-A", 1, 10.0, ts1);
        cache.Update("ASSET-A", 1, 20.0, ts2);

        cache.Get("ASSET-A", 1)!.Value.Should().Be(20.0);
    }

    [Fact]
    public void DifferentAssetCodes_AreSeparate()
    {
        var cache = new LatestReadingCache();
        cache.Update("ASSET-A", 1, 10.0, DateTime.UtcNow);
        cache.Update("ASSET-B", 1, 20.0, DateTime.UtcNow);

        cache.Get("ASSET-A", 1)!.Value.Should().Be(10.0);
        cache.Get("ASSET-B", 1)!.Value.Should().Be(20.0);
    }

    [Fact]
    public async Task ConcurrentUpdates_NoRace()
    {
        var cache = new LatestReadingCache();
        var tasks = Enumerable.Range(0, 100)
            .Select(i => Task.Run(() => cache.Update("ASSET-A", i % 10, i, DateTime.UtcNow)));
        await Task.WhenAll(tasks);

        for (int i = 0; i < 10; i++)
            cache.Get("ASSET-A", i).Should().NotBeNull();
    }
}
