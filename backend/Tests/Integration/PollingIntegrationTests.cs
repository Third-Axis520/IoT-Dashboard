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

public class PollingIntegrationTests : IntegrationTestBase
{
    [Fact]
    public async Task Polling_WritesSensorReadings_ForProvisionedModbusConnection()
    {
        // 1. Start a Modbus test server with known values
        await using var server = await ModbusTestServerFixture.StartAsync();
        server.SetRegister(0, 250);
        server.SetRegister(1, 370);

        // 2. Get a PropertyType ID for the sensors
        var ptResp = await Client.GetAsync("/api/property-types");
        var pts = await ptResp.Content.ReadFromJsonAsync<List<PropertyTypeDto>>();
        var tempId = pts!.First(p => p.Key == "temperature").Id;

        // 3. Create DeviceConnection with atomic provision
        var req = new SaveDeviceConnectionRequest(
            Name: "Polling Test",
            Protocol: "modbus_tcp",
            Config: JsonSerializer.Serialize(new
            {
                host = "127.0.0.1",
                port = server.Port,
                unitId = 0,
                startAddress = 0,
                count = 2,
                dataType = "uint16"
            }),
            PollIntervalMs: 500,  // poll every 500ms for fast test
            IsEnabled: true,
            EquipmentType: new SaveEquipmentTypeRequest(
                Name: "Poll Test Equipment",
                VisType: "single_kpi",
                Description: null,
                Sensors: new List<SaveSensorRequest>
                {
                    new(SensorId: 7001, PointId: "pt_t1", Label: "溫度1", Unit: "℃",
                        PropertyTypeId: tempId, RawAddress: "0"),
                    new(SensorId: 7002, PointId: "pt_t2", Label: "溫度2", Unit: "℃",
                        PropertyTypeId: tempId, RawAddress: "1"),
                }));

        var createResp = await Client.PostAsJsonAsync("/api/device-connections", req);
        createResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var created = await createResp.Content.ReadFromJsonAsync<DeviceConnectionDetailDto>();
        var connectionId = created!.Id;

        // 4. Bind a Device so DataIngestionService processes the data.
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
                    AssetCode = "POLL_TEST_ASSET",
                    FirstSeen = DateTime.UtcNow,
                    LastSeen = DateTime.UtcNow,
                });
            }
            else
            {
                device.AssetCode = "POLL_TEST_ASSET";
                device.LastSeen = DateTime.UtcNow;
            }
            await db.SaveChangesAsync();
        }

        // 5. Wait for PollingBackgroundService to pick it up and write readings
        await WaitForConditionAsync(async () =>
        {
            await using var db = await CreateDbContextAsync();
            return await db.SensorReadings
                .AnyAsync(r => r.AssetCode == "POLL_TEST_ASSET" && r.SensorId == 7001);
        }, timeout: TimeSpan.FromSeconds(15));

        // 6. Verify the readings
        await using (var db = await CreateDbContextAsync())
        {
            var readings = await db.SensorReadings
                .Where(r => r.AssetCode == "POLL_TEST_ASSET")
                .ToListAsync();

            readings.Should().Contain(r => r.SensorId == 7001 && r.Value == 250);
            readings.Should().Contain(r => r.SensorId == 7002 && r.Value == 370);
        }
    }
}
