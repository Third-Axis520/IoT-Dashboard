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
    public async Task Process_MaterialDetectFalse_StillWritesReadingWithHasMaterialFalse()
    {
        // B1: when material_detect sensor signals no material, reading is still written
        // but with HasMaterial=false. No gating rule is configured here.
        await SeedDeviceAsync();

        // Seed the full FK chain required by GetMaterialDetectSensorIdAsync:
        // PropertyType → EquipmentType → EquipmentTypeSensor
        // LineConfig → LineEquipment (bound to AssetCode)
        await using (var db = await CreateDbContextAsync())
        {
            var pt = new PropertyType
            {
                Key = "material_detect_b1test",
                Name = "Material Detect",
                Icon = "circle",
                DefaultUnit = "",
                Behavior = "material_detect",
                CreatedAt = DateTime.UtcNow
            };
            db.PropertyTypes.Add(pt);
            await db.SaveChangesAsync();

            var et = new EquipmentType
            {
                Name = "B1 Test Equipment",
                VisType = "single_kpi",
                CreatedAt = DateTime.UtcNow
            };
            db.EquipmentTypes.Add(et);
            await db.SaveChangesAsync();

            var ets = new EquipmentTypeSensor
            {
                EquipmentTypeId = et.Id,
                SensorId = 8888,
                PointId = "mat_detect",
                Label = "Material Detect",
                Unit = "",
                PropertyTypeId = pt.Id
            };
            db.EquipmentTypeSensors.Add(ets);
            await db.SaveChangesAsync();

            // LineEquipment requires a valid LineConfig FK
            var lineConfig = new LineConfig
            {
                LineId = "line_b1test",
                Name = "B1 Test Line",
                UpdatedAt = DateTime.UtcNow
            };
            db.LineConfigs.Add(lineConfig);
            await db.SaveChangesAsync();

            var lineEquip = new LineEquipment
            {
                AssetCode = AssetCode,
                EquipmentTypeId = et.Id,
                LineConfigId = lineConfig.Id
            };
            db.LineEquipments.Add(lineEquip);
            await db.SaveChangesAsync();
        }

        var sut = GetSut();

        // Send payload: mat sensor = 0 (no material), plus a temperature sensor
        var payload = new IngestPayload
        {
            SerialNumber = SerialNumber,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            IsConnected = true,
            Sensors = new List<SensorReading_Dto>
            {
                new() { Id = 8888, Value = 0 },        // material_detect = no material
                new() { Id = UngatedSensorId, Value = 99.9 }  // temperature sensor
            }
        };

        await sut.ProcessAsync(payload);

        await using var db2 = await CreateDbContextAsync();

        // The temperature sensor reading MUST exist
        var reading = await db2.SensorReadings.FirstOrDefaultAsync(r =>
            r.AssetCode == AssetCode && r.SensorId == UngatedSensorId);
        reading.Should().NotBeNull("B1: reading must be written even when no material");
        reading!.HasMaterial.Should().BeFalse("B1: HasMaterial flag must be false");

        // The material_detect sensor itself must NOT be written (state bit)
        var matReading = await db2.SensorReadings.FirstOrDefaultAsync(r =>
            r.AssetCode == AssetCode && r.SensorId == 8888);
        matReading.Should().BeNull("material_detect sensor is a state bit, not written to readings");
    }

    [Fact]
    public async Task Process_BothGatingsActive_AndLogic()
    {
        // Combined AND logic:
        // Case A: A1 gating = Block + hasMaterial = true  → NO reading written
        // Case B: A1 gating = Pass  + hasMaterial = false → reading written with HasMaterial=false
        await SeedDeviceAsync();

        // Seed a gating rule for GatedSensorId
        await SeedGatingRuleAsync();
        var cache = GetCache();

        var sut = GetSut();
        sut.InvalidateGatingRulesCache(AssetCode);

        // ── Case A: DI = false (gated) + hasMaterial = true (no mat-detect sensor) ──
        cache.Update(DiAsset, DiSensorId, 0.0, DateTime.UtcNow);

        await sut.ProcessAsync(MakePayload((GatedSensorId, 300.0)));

        await using (var db = await CreateDbContextAsync())
        {
            var countA = await db.SensorReadings.CountAsync(r =>
                r.AssetCode == AssetCode && r.SensorId == GatedSensorId);
            countA.Should().Be(0, "A: gating blocked → no reading");
        }

        // ── Case B: DI = true (pass) — no mat-detect sensor so hasMaterial=true by default ──
        cache.Update(DiAsset, DiSensorId, 1.0, DateTime.UtcNow);

        await sut.ProcessAsync(MakePayload((GatedSensorId, 300.0)));

        await using (var db = await CreateDbContextAsync())
        {
            var countB = await db.SensorReadings.CountAsync(r =>
                r.AssetCode == AssetCode && r.SensorId == GatedSensorId);
            countB.Should().Be(1, "B: gating passes + hasMaterial default true → reading written");

            var reading = await db.SensorReadings.FirstAsync(r =>
                r.AssetCode == AssetCode && r.SensorId == GatedSensorId);
            reading.HasMaterial.Should().BeTrue();
        }
    }
}
