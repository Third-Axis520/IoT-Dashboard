using IoT.CentralApi.Data;
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
    private const string SerialNumber = "SN_TEST_001";

    private const int SensorId1 = 5001;
    private const int SensorId2 = 5002;

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

    private IngestPayload MakePayload(params (int id, double value)[] sensors) => new()
    {
        SerialNumber = SerialNumber,
        Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        IsConnected = true,
        Sensors = sensors.Select(s => new SensorReading_Dto { Id = s.id, Value = s.value }).ToList()
    };

    // ── tests ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Process_WritesAllReadingsUnconditionally()
    {
        await SeedDeviceAsync();
        var sut = GetSut();

        await sut.ProcessAsync(MakePayload((SensorId1, 100.0), (SensorId2, 200.0)));

        await using var db = await CreateDbContextAsync();
        var count = await db.SensorReadings.CountAsync(r => r.AssetCode == AssetCode);
        count.Should().Be(2);
    }

    [Fact]
    public async Task Process_UnboundDevice_DoesNotWriteReadings()
    {
        await using var db = await CreateDbContextAsync();
        db.Devices.Add(new Device
        {
            SerialNumber = "SN_UNBOUND",
            AssetCode = null,
            FirstSeen = DateTime.UtcNow,
            LastSeen = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var sut = GetSut();
        var payload = new IngestPayload
        {
            SerialNumber = "SN_UNBOUND",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            IsConnected = true,
            Sensors = new List<SensorReading_Dto> { new() { Id = SensorId1, Value = 99.0 } }
        };
        await sut.ProcessAsync(payload);

        await using var db2 = await CreateDbContextAsync();
        var count = await db2.SensorReadings.CountAsync();
        count.Should().Be(0);
    }
}
