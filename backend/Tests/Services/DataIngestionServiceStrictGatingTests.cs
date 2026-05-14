using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using IoT.CentralApi.Services;
using IoT.CentralApi.Tests._Shared;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace IoT.CentralApi.Tests.Services;

/// <summary>
/// Covers DataIngestionService behaviour when Gating:StrictMode=true.
/// The default-OFF case is covered by DataIngestionServiceTests; this class
/// flips the flag through WebApplicationFactory's config and asserts the
/// only behaviour delta: material_detect=false now drops readings entirely.
/// </summary>
public class DataIngestionServiceStrictGatingTests : IntegrationTestBase
{
    private const string AssetCode = "STRICT_ASSET";
    private const string SerialNumber = "SN_STRICT_001";
    private const int MaterialSensorId = 40013;
    private const int TempSensorId = 5101;

    public override async Task InitializeAsync()
    {
        DbPath = Path.Combine(Path.GetTempPath(), $"iottest_strict_{Guid.NewGuid():N}.db");

        Factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    services.AddDbContextFactory<IoTDbContext>(opts =>
                        opts.UseSqlite($"Data Source={DbPath}"));
                });

                builder.ConfigureAppConfiguration(c =>
                {
                    c.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["WeChat:Enabled"] = "false",
                        ["FasApi:BaseUrl"] = "http://localhost:1",
                        ["FasApi:ApiKey"] = "test-key",
                        ["ConnectionStrings:DefaultConnection"] = $"Data Source={DbPath}",
                        ["Authentication:ApiKey"] = "test-api-key-123",
                        ["Gating:StrictMode"] = "true",
                    });
                });

                builder.UseEnvironment("Test");
            });

        Client = Factory.CreateClient();
        Client.DefaultRequestHeaders.Add("X-Api-Key", "test-api-key-123");

        using var scope = Factory.Services.CreateScope();
        var dbFactory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<IoTDbContext>>();
        await using var ctx = await dbFactory.CreateDbContextAsync();
        await ctx.Database.EnsureCreatedAsync();

        await SeedFixtureAsync();
    }

    private async Task SeedFixtureAsync()
    {
        await using var db = await CreateDbContextAsync();

        // Need a material_detect PropertyType so the service's
        // GetMaterialDetectSensorIdAsync lookup actually picks our sensor.
        var matPt = await db.PropertyTypes.FirstOrDefaultAsync(p => p.Behavior == "material_detect");
        if (matPt == null)
        {
            matPt = new PropertyType
            {
                Key = "test_material_detect",
                Name = "Test Material",
                Icon = "🦶",
                DefaultUnit = "",
                Behavior = "material_detect",
                IsBuiltIn = false,
                CreatedAt = DateTime.UtcNow,
            };
            db.PropertyTypes.Add(matPt);
            await db.SaveChangesAsync();
        }
        var tempPt = await db.PropertyTypes.FirstOrDefaultAsync(p => p.Behavior == "normal");
        if (tempPt == null)
        {
            tempPt = new PropertyType
            {
                Key = "test_temperature",
                Name = "Test Temperature",
                Icon = "🌡",
                DefaultUnit = "°C",
                Behavior = "normal",
                IsBuiltIn = false,
                CreatedAt = DateTime.UtcNow,
            };
            db.PropertyTypes.Add(tempPt);
            await db.SaveChangesAsync();
        }

        var lineConfig = new LineConfig
        {
            LineId = "test_line",
            Name = "Strict Test Line",
            UpdatedAt = DateTime.UtcNow,
        };
        db.LineConfigs.Add(lineConfig);
        await db.SaveChangesAsync();

        var et = new EquipmentType
        {
            Name = "Strict Test ET",
            VisType = "single_kpi",
            Description = "",
            CreatedAt = DateTime.UtcNow,
            Sensors = new List<EquipmentTypeSensor>
            {
                new() { SensorId = MaterialSensorId, PointId = "pt_mat", Label = "在位", Unit = "", PropertyTypeId = matPt.Id, SortOrder = 0 },
                new() { SensorId = TempSensorId,     PointId = "pt_temp", Label = "溫度", Unit = "°C", PropertyTypeId = tempPt.Id, SortOrder = 1 },
            },
        };
        db.EquipmentTypes.Add(et);
        await db.SaveChangesAsync();

        db.LineEquipments.Add(new LineEquipment
        {
            LineConfigId = lineConfig.Id,
            AssetCode = AssetCode,
            EquipmentTypeId = et.Id,
            DisplayName = "Strict Test",
            SortOrder = 0,
        });
        db.Devices.Add(new Device
        {
            SerialNumber = SerialNumber,
            AssetCode = AssetCode,
            FirstSeen = DateTime.UtcNow,
            LastSeen = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    private DataIngestionService GetSut()
        => Factory.Services.GetRequiredService<DataIngestionService>();

    private static IngestPayload Payload(params (int id, double value)[] sensors) => new()
    {
        SerialNumber = SerialNumber,
        Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        IsConnected = true,
        Sensors = sensors.Select(s => new SensorReading_Dto { Id = s.id, Value = s.value }).ToList(),
    };

    [Fact]
    public async Task ProcessAsync_StrictModeOn_MaterialDetectFalse_DropsAllReadings()
    {
        var svc = GetSut();

        await svc.ProcessAsync(Payload(
            (MaterialSensorId, 0.0),   // no material
            (TempSensorId, 88.5)));    // temperature reading the strict path must drop

        await using var db = await CreateDbContextAsync();
        var rows = await db.SensorReadings.Where(r => r.AssetCode == AssetCode).ToListAsync();
        Assert.Empty(rows);
    }

    [Fact]
    public async Task ProcessAsync_StrictModeOn_MaterialDetectTrue_StillWritesTemperature()
    {
        var svc = GetSut();

        await svc.ProcessAsync(Payload(
            (MaterialSensorId, 1.0),   // material present
            (TempSensorId, 72.1)));

        await using var db = await CreateDbContextAsync();
        var rows = await db.SensorReadings.Where(r => r.AssetCode == AssetCode).ToListAsync();
        // Material sensor row is always filtered (it's a state bit). Only the
        // temperature row survives, and HasMaterial reflects the true state.
        Assert.Single(rows);
        Assert.Equal(TempSensorId, rows[0].SensorId);
        Assert.True(rows[0].HasMaterial);
        Assert.Equal(72.1, rows[0].Value);
    }

    [Fact]
    public async Task ProcessAsync_StrictModeOn_NoMaterialSensorOnAsset_AlwaysWrites()
    {
        // Equipment types without a material_detect sensor default hasMaterial=true,
        // so strict mode never kicks in for them. Make sure that's still true.
        await using (var db = await CreateDbContextAsync())
        {
            // Add a second asset whose EquipmentType has no material_detect sensor.
            var tempPt = await db.PropertyTypes.FirstAsync(p => p.Behavior == "normal");
            var et = new EquipmentType
            {
                Name = "Strict NoMat ET",
                VisType = "single_kpi",
                Description = "",
                CreatedAt = DateTime.UtcNow,
                Sensors = new List<EquipmentTypeSensor>
                {
                    new() { SensorId = 6101, PointId = "pt_only", Label = "Temp", Unit = "°C", PropertyTypeId = tempPt.Id, SortOrder = 0 },
                },
            };
            db.EquipmentTypes.Add(et);
            await db.SaveChangesAsync();
            var line = await db.LineConfigs.FirstAsync(l => l.LineId == "test_line");
            db.LineEquipments.Add(new LineEquipment
            {
                LineConfigId = line.Id,
                AssetCode = "STRICT_NOMAT",
                EquipmentTypeId = et.Id,
                DisplayName = "NoMat",
                SortOrder = 1,
            });
            db.Devices.Add(new Device
            {
                SerialNumber = "SN_NOMAT_001",
                AssetCode = "STRICT_NOMAT",
                FirstSeen = DateTime.UtcNow,
                LastSeen = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        var svc = GetSut();
        await svc.ProcessAsync(new IngestPayload
        {
            SerialNumber = "SN_NOMAT_001",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            IsConnected = true,
            Sensors = new List<SensorReading_Dto> { new() { Id = 6101, Value = 55.5 } },
        });

        await using var dbAssert = await CreateDbContextAsync();
        var rows = await dbAssert.SensorReadings.Where(r => r.AssetCode == "STRICT_NOMAT").ToListAsync();
        Assert.Single(rows);
        Assert.True(rows[0].HasMaterial);   // null → defaulted true → stays written
    }
}
