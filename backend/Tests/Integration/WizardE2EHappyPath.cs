using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IoT.CentralApi.Controllers;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Models;
using IoT.CentralApi.Tests._Shared;
using IoT.CentralApi.Tests.Adapters._Fixtures;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Tests.Integration;

/// <summary>
/// Full E2E happy path:
///   1. Provision DeviceConnection + EquipmentType + Sensors via API
///   2. Start Modbus test server
///   3. Wait for PollingBackgroundService to write SensorReadings
///   4. Verify diagnostics show healthy status
/// </summary>
public class WizardE2EHappyPath : IntegrationTestBase
{
    [Fact]
    public async Task FullWizardFlow_ProvisionPollAndVerify()
    {
        // ── 1. Start Modbus server ────────────────────────────────────────────
        await using var server = await ModbusTestServerFixture.StartAsync();
        server.SetRegister(0, 500);
        server.SetRegister(1, 750);
        server.SetRegister(2, 120);

        // ── 2. Get property type IDs ──────────────────────────────────────────
        var ptResp = await Client.GetAsync("/api/property-types");
        var pts = await ptResp.Content.ReadFromJsonAsync<List<PropertyTypeDto>>();
        var tempId = pts!.First(p => p.Key == "temperature").Id;
        var pressureId = pts!.First(p => p.Key == "pressure").Id;

        // ── 3. Verify protocols are available ─────────────────────────────────
        var protResp = await Client.GetAsync("/api/protocols");
        protResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var protocols = await protResp.Content.ReadFromJsonAsync<List<ProtocolDto>>();
        protocols!.Should().Contain(p => p.Id == "modbus_tcp");

        // ── 4. Atomic provision: connection + equipment + sensors ──────────────
        var provisionReq = new SaveDeviceConnectionRequest(
            Name: "E2E Modbus",
            Protocol: "modbus_tcp",
            Config: JsonSerializer.Serialize(new
            {
                host = "127.0.0.1",
                port = server.Port,
                unitId = 0,
                startAddress = 0,
                count = 3,
                dataType = "uint16"
            }),
            PollIntervalMs: 500,
            IsEnabled: true,
            EquipmentType: new SaveEquipmentTypeRequest(
                Name: "E2E Test Oven",
                VisType: "dual_side_spark",
                Description: "Auto-created by E2E test",
                Sensors: new List<SaveSensorRequest>
                {
                    new(SensorId: 5001, PointId: "pt_temp1", Label: "爐溫上", Unit: "℃",
                        PropertyTypeId: tempId, RawAddress: "0"),
                    new(SensorId: 5002, PointId: "pt_temp2", Label: "爐溫下", Unit: "℃",
                        PropertyTypeId: tempId, RawAddress: "1"),
                    new(SensorId: 5003, PointId: "pt_press", Label: "壓力", Unit: "kPa",
                        PropertyTypeId: pressureId, RawAddress: "2"),
                }));

        var createResp = await Client.PostAsJsonAsync("/api/device-connections", provisionReq);
        createResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var detail = await createResp.Content.ReadFromJsonAsync<DeviceConnectionDetailDto>();
        detail!.EquipmentType.Should().NotBeNull();
        detail.EquipmentType!.Sensors.Should().HaveCount(3);
        var connectionId = detail.Id;

        // ── 5. Bind Device for DataIngestionService ───────────────────────────
        // Upsert: PollingBackgroundService may race ahead and create the Device
        // (with null AssetCode) before this runs; in that case, just bind it.
        await using (var db = await CreateDbContextAsync())
        {
            var serialNumber = $"poll_{connectionId}";
            var device = await db.Devices.FirstOrDefaultAsync(d => d.SerialNumber == serialNumber);
            if (device == null)
            {
                db.Devices.Add(new Device
                {
                    SerialNumber = serialNumber,
                    AssetCode = "E2E_OVEN_001",
                    FirstSeen = DateTime.UtcNow,
                    LastSeen = DateTime.UtcNow,
                });
            }
            else
            {
                device.AssetCode = "E2E_OVEN_001";
                device.LastSeen = DateTime.UtcNow;
            }
            await db.SaveChangesAsync();
        }

        // ── 6. Wait for polling to produce readings ───────────────────────────
        await WaitForConditionAsync(async () =>
        {
            await using var db = await CreateDbContextAsync();
            return await db.SensorReadings
                .CountAsync(r => r.AssetCode == "E2E_OVEN_001") >= 3;
        }, timeout: TimeSpan.FromSeconds(15));

        // ── 7. Verify readings values ─────────────────────────────────────────
        await using (var db = await CreateDbContextAsync())
        {
            var readings = await db.SensorReadings
                .Where(r => r.AssetCode == "E2E_OVEN_001")
                .ToListAsync();

            readings.Should().Contain(r => r.SensorId == 5001 && r.Value == 500);
            readings.Should().Contain(r => r.SensorId == 5002 && r.Value == 750);
            readings.Should().Contain(r => r.SensorId == 5003 && r.Value == 120);
        }

        // ── 8. Verify diagnostics endpoint ────────────────────────────────────
        var diagResp = await Client.GetAsync("/api/diagnostics/polling");
        diagResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var diag = await diagResp.Content.ReadFromJsonAsync<PollingDiagnosticsDto>();
        diag!.Polling.IsRunning.Should().BeTrue();
        diag.Connections.Should().Contain(c => c.Name == "E2E Modbus" && c.Status == "healthy");
    }
}
