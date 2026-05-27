using IoT.CentralApi.Models;
using IoT.CentralApi.Services;
using IoT.CentralApi.Tests._Shared;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IoT.CentralApi.Tests.Services;

/// <summary>
/// Integration tests for DataIngestionService.
///
/// Uses real SQLite DB (via IntegrationTestBase), real LatestReadingCache.
/// FasApiService / WeChatService / SseHub are real instances but harmless in test env
/// (FAS uses negative cache / no connections; WeChat is disabled; SseHub has 0 connections).
/// </summary>
public class DataIngestionServiceTests : IntegrationTestBase
{
    // ── helpers ──────────────────────────────────────────────────────────────

    private DataIngestionService GetSut()
        => Factory.Services.GetRequiredService<DataIngestionService>();

    private const string AssetCode = "TEST_ASSET";

    private const int SensorId1 = 5001;
    private const int SensorId2 = 5002;

    private IngestPayload MakePayload(string assetCode, params (int id, double value)[] sensors) => new()
    {
        AssetCode = assetCode,
        Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        IsConnected = true,
        Sensors = sensors.Select(s => new SensorReading_Dto { Id = s.id, Value = s.value }).ToList()
    };

    // ── tests ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Process_WritesAllReadingsUnconditionally()
    {
        var sut = GetSut();

        await sut.ProcessAsync(MakePayload(AssetCode, (SensorId1, 100.0), (SensorId2, 200.0)));

        await using var db = await CreateDbContextAsync();
        var count = await db.SensorReadings.CountAsync(r => r.AssetCode == AssetCode);
        count.Should().Be(2);
    }

    [Fact]
    public async Task Process_EmptyAssetCode_DoesNotWriteReadings()
    {
        var sut = GetSut();
        var payload = new IngestPayload
        {
            AssetCode = "",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            IsConnected = true,
            Sensors = new List<SensorReading_Dto> { new() { Id = SensorId1, Value = 99.0 } }
        };
        await sut.ProcessAsync(payload);

        await using var db = await CreateDbContextAsync();
        var count = await db.SensorReadings.CountAsync();
        count.Should().Be(0);
    }

    [Theory]
    [InlineData(-3000.0)]    // observed prod sentinel (0x8AD0 raw × 0.1)
    [InlineData(-32768.0)]   // raw int16 min, no scale
    [InlineData(-101.0)]     // just past the lower threshold
    [InlineData(2_000_000.0)] // unphysical upper sentinel
    public async Task Process_SentinelValue_StoredWithHasError_NoAlert(double sentinel)
    {
        await using var setup = await CreateDbContextAsync();
        // Configure UCL/LCL so a real alert would fire if the sentinel
        // weren't filtered (UCL=50 LCL=10).
        setup.SensorLimits.Add(new SensorLimit
        {
            AssetCode = AssetCode, SensorId = SensorId1, UCL = 50, LCL = 10
        });
        await setup.SaveChangesAsync();

        var sut = GetSut();
        await sut.ProcessAsync(MakePayload(AssetCode, (SensorId1, sentinel)));

        await using var db = await CreateDbContextAsync();
        // Reading is still persisted (preserves diagnostic data for postmortem)
        // but HasError = true so the dashboard/alert path skips it.
        var reading = await db.SensorReadings
            .Where(r => r.AssetCode == AssetCode && r.SensorId == SensorId1)
            .SingleAsync();
        reading.HasError.Should().BeTrue($"sentinel {sentinel} must be flagged as error");
        reading.Value.Should().Be(sentinel);

        var alertCount = await db.SensorAlerts.CountAsync(a => a.AssetCode == AssetCode);
        alertCount.Should().Be(0, "sentinel value must not trip UCL/LCL alert path");
    }

    [Theory]
    [InlineData(-50.0)]      // legit slight negative reading
    [InlineData(-100.0)]     // exactly at the lower threshold — still legit
    [InlineData(0.0)]
    [InlineData(86_400.0)]   // 24h in seconds — legit counter value
    [InlineData(999_999.0)]  // just under the upper threshold
    public async Task Process_LegitimateValue_NotFlaggedAsSentinel(double value)
    {
        var sut = GetSut();
        await sut.ProcessAsync(MakePayload(AssetCode, (SensorId1, value)));

        await using var db = await CreateDbContextAsync();
        var reading = await db.SensorReadings
            .Where(r => r.AssetCode == AssetCode && r.SensorId == SensorId1)
            .SingleAsync();
        reading.HasError.Should().BeFalse($"{value} is within the legitimate sensor range");
    }
}
