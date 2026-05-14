using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using IoT.CentralApi.Services;
using IoT.CentralApi.Tests._Shared;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IoT.CentralApi.Tests.Services;

/// <summary>
/// Integration tests for DataIngestionService A1 gating + B1 material_detect coexistence.
///
/// Uses real SQLite DB (via IntegrationTestBase), real LatestReadingCache, real GatingEvaluator.
/// FasApiService / WeChatService / SseHub are real instances but harmless in test env
/// (FAS uses negative cache / no connections; WeChat is disabled; SseHub has 0 connections).
/// </summary>
public class DataIngestionServiceTests : IntegrationTestBase
{
    // ── helpers ──────────────────────────────────────────────────────────────

    private DataIngestionService GetSut()
        => Factory.Services.GetRequiredService<DataIngestionService>();

    private LatestReadingCache GetCache()
        => (LatestReadingCache)Factory.Services.GetRequiredService<ILatestReadingCache>();

    private const string AssetCode = "TEST_ASSET";
    private const string SerialNumber = "SN_TEST_001";

    // DI (gating) asset + sensor
    private const string DiAsset = "DI_ASSET";
    private const int DiSensorId = 9001;

    // Gated sensor
    private const int GatedSensorId = 5001;
    // Ungated sensor
    private const int UngatedSensorId = 5002;

    /// <summary>Seed a bound Device into the DB.</summary>
    private async Task SeedDeviceAsync()
    {
        await using var db = await CreateDbContextAsync();
        if (!await db.Devices.AnyAsync(d => d.SerialNumber == SerialNumber))
        {
            db.Devices.Add(new Device
            {
                SerialNumber = SerialNumber,
                AssetCode = AssetCode,
                FirstSeen = DateTime.UtcNow,
                LastSeen = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }
    }

    /// <summary>Seed a SensorGatingRule for GatedSensorId pointing at DiAsset/DiSensorId.</summary>
    private async Task SeedGatingRuleAsync(int delayMs = 0, int maxAgeMs = 5000)
    {
        await using var db = await CreateDbContextAsync();
        db.SensorGatingRules.Add(new SensorGatingRule
        {
            GatedAssetCode = AssetCode,
            GatedSensorId = GatedSensorId,
            GatingAssetCode = DiAsset,
            GatingSensorId = DiSensorId,
            DelayMs = delayMs,
            MaxAgeMs = maxAgeMs,
            CreatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
    }

    private IngestPayload MakePayload(params (int id, double value)[] sensors) => new()
    {
        SerialNumber = SerialNumber,
        Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        IsConnected = true,
        Sensors = sensors.Select(s => new SensorReading_Dto { Id = s.id, Value = s.value }).ToList()
    };

    // ── tests ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Process_NoGatingRule_WritesReading()
    {
        await SeedDeviceAsync();
        var sut = GetSut();

        await sut.ProcessAsync(MakePayload((GatedSensorId, 100.0)));

        await using var db = await CreateDbContextAsync();
        var count = await db.SensorReadings.CountAsync(r =>
            r.AssetCode == AssetCode && r.SensorId == GatedSensorId);
        count.Should().Be(1);
    }

    [Fact]
    public async Task Process_GatingRule_DiTrue_WritesReading()
    {
        await SeedDeviceAsync();
        await SeedGatingRuleAsync();

        // Pre-populate DI cache with value = 1 (present)
        var cache = GetCache();
        cache.Update(DiAsset, DiSensorId, 1.0, DateTime.UtcNow);

        // Invalidate gating rules cache so new rule is loaded
        GetSut().InvalidateGatingRulesCache(AssetCode);

        await GetSut().ProcessAsync(MakePayload((GatedSensorId, 200.0)));

        await using var db = await CreateDbContextAsync();
        var count = await db.SensorReadings.CountAsync(r =>
            r.AssetCode == AssetCode && r.SensorId == GatedSensorId);
        count.Should().Be(1);
    }

    [Fact]
    public async Task Process_GatingRule_DiFalse_DoesNotWriteReading()
    {
        await SeedDeviceAsync();
        await SeedGatingRuleAsync();

        // DI value = 0 (not present)
        var cache = GetCache();
        cache.Update(DiAsset, DiSensorId, 0.0, DateTime.UtcNow);

        GetSut().InvalidateGatingRulesCache(AssetCode);

        await GetSut().ProcessAsync(MakePayload((GatedSensorId, 200.0)));

        await using var db = await CreateDbContextAsync();
        var count = await db.SensorReadings.CountAsync(r =>
            r.AssetCode == AssetCode && r.SensorId == GatedSensorId);
        count.Should().Be(0);
    }

    [Fact]
    public async Task Process_GatingRule_DiNoData_DoesNotWriteReading()
    {
        await SeedDeviceAsync();
        await SeedGatingRuleAsync();
        // Cache is empty — no DI data at all
        GetSut().InvalidateGatingRulesCache(AssetCode);

        await GetSut().ProcessAsync(MakePayload((GatedSensorId, 200.0)));

        await using var db = await CreateDbContextAsync();
        var count = await db.SensorReadings.CountAsync(r =>
            r.AssetCode == AssetCode && r.SensorId == GatedSensorId);
        count.Should().Be(0);
    }

    [Fact]
    public async Task Process_GatingRule_StaleDi_DoesNotWriteReading()
    {
        await SeedDeviceAsync();
        // MaxAgeMs = 500 — anything older than 500ms is stale
        await SeedGatingRuleAsync(maxAgeMs: 500);

        var cache = GetCache();
        // Timestamp is 2 seconds in the past → stale
        cache.Update(DiAsset, DiSensorId, 1.0, DateTime.UtcNow.AddSeconds(-2));

        GetSut().InvalidateGatingRulesCache(AssetCode);

        await GetSut().ProcessAsync(MakePayload((GatedSensorId, 200.0)));

        await using var db = await CreateDbContextAsync();
        var count = await db.SensorReadings.CountAsync(r =>
            r.AssetCode == AssetCode && r.SensorId == GatedSensorId);
        count.Should().Be(0);
    }

    [Fact]
    public async Task Process_GatingRulePass_WritesReading()
    {
        // Post #7 Phase C: material_detect special path is gone and the
        // HasMaterial column has been dropped from the schema. SensorGatingRule
        // alone decides whether readings get written. When the rule allows
        // (pass), the reading writes.
        await SeedDeviceAsync();
        await SeedGatingRuleAsync();
        var cache = GetCache();

        var sut = GetSut();
        sut.InvalidateGatingRulesCache(AssetCode);

        cache.Update(DiAsset, DiSensorId, 1.0, DateTime.UtcNow);
        await sut.ProcessAsync(MakePayload((GatedSensorId, 300.0)));

        await using var db = await CreateDbContextAsync();
        var reading = await db.SensorReadings.FirstOrDefaultAsync(r =>
            r.AssetCode == AssetCode && r.SensorId == GatedSensorId);
        reading.Should().NotBeNull();
        reading!.Value.Should().Be(300.0);
    }
}
