using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IoT.CentralApi.Controllers;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Tests._Shared;
using IoT.CentralApi.Tests.Adapters._Fixtures;

namespace IoT.CentralApi.Tests.Controllers;

public class DeviceConnectionControllerTests : IntegrationTestBase
{
    private async Task<int> GetFirstPropertyTypeIdAsync()
    {
        var resp = await Client.GetAsync("/api/property-types");
        var list = await resp.Content.ReadFromJsonAsync<List<PropertyTypeDto>>();
        return list!.First(p => p.Key == "temperature").Id;
    }

    private SaveDeviceConnectionRequest MakeRequest(int ptId, int port = 502) => new(
        Name: "Test Modbus",
        Protocol: "modbus_tcp",
        Config: JsonSerializer.Serialize(new
        {
            host = "127.0.0.1",
            port,
            unitId = 0,
            startAddress = 0,
            count = 2,
            dataType = "uint16"
        }),
        PollIntervalMs: 5000,
        IsEnabled: true,
        EquipmentType: new SaveEquipmentTypeRequest(
            Name: "Test Equipment",
            VisType: "single_kpi",
            Description: "Auto-created by wizard",
            Sensors: new List<SaveSensorRequest>
            {
                new(SensorId: 9001, PointId: "pt_temp", Label: "溫度", Unit: "℃",
                    PropertyTypeId: ptId, RawAddress: "0"),
                new(SensorId: 9002, PointId: "pt_temp2", Label: "溫度2", Unit: "℃",
                    PropertyTypeId: ptId, RawAddress: "1"),
            }));

    [Fact]
    public async Task Create_AtomicProvision_CreatesConnectionAndEquipment()
    {
        var ptId = await GetFirstPropertyTypeIdAsync();
        var req = MakeRequest(ptId);

        var response = await Client.PostAsJsonAsync("/api/device-connections", req);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var detail = await response.Content.ReadFromJsonAsync<DeviceConnectionDetailDto>();
        detail.Should().NotBeNull();
        detail!.Name.Should().Be("Test Modbus");
        detail.Protocol.Should().Be("modbus_tcp");
        detail.PollIntervalMs.Should().Be(5000);
        detail.EquipmentType.Should().NotBeNull();
        detail.EquipmentType!.Name.Should().Be("Test Equipment");
        detail.EquipmentType.Sensors.Should().HaveCount(2);
    }

    [Fact]
    public async Task Create_Returns404_ForUnknownProtocol()
    {
        var req = new SaveDeviceConnectionRequest("Bad", "nonexistent", "{}", null);
        var response = await Client.PostAsJsonAsync("/api/device-connections", req);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Create_Returns400_ForInvalidConfig()
    {
        var req = new SaveDeviceConnectionRequest("Bad Config", "modbus_tcp", "{}", null);
        var response = await Client.PostAsJsonAsync("/api/device-connections", req);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GetAll_ReturnsCreatedConnections()
    {
        var ptId = await GetFirstPropertyTypeIdAsync();
        await Client.PostAsJsonAsync("/api/device-connections", MakeRequest(ptId));

        var response = await Client.GetAsync("/api/device-connections");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var list = await response.Content.ReadFromJsonAsync<List<DeviceConnectionDto>>();
        list.Should().NotBeNull();
        list!.Should().Contain(dc => dc.Name == "Test Modbus");
    }

    [Fact]
    public async Task GetOne_ReturnsDetailWithEquipment()
    {
        var ptId = await GetFirstPropertyTypeIdAsync();
        var createResp = await Client.PostAsJsonAsync("/api/device-connections", MakeRequest(ptId));
        var created = await createResp.Content.ReadFromJsonAsync<DeviceConnectionDetailDto>();

        var response = await Client.GetAsync($"/api/device-connections/{created!.Id}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var detail = await response.Content.ReadFromJsonAsync<DeviceConnectionDetailDto>();
        detail!.EquipmentType.Should().NotBeNull();
        detail.EquipmentType!.Sensors.Should().HaveCount(2);
    }

    [Fact]
    public async Task Update_ChangesNameAndConfig()
    {
        var ptId = await GetFirstPropertyTypeIdAsync();
        var createResp = await Client.PostAsJsonAsync("/api/device-connections", MakeRequest(ptId));
        var created = await createResp.Content.ReadFromJsonAsync<DeviceConnectionDetailDto>();

        var updateReq = new UpdateDeviceConnectionRequest(
            Name: "Updated Name",
            Config: JsonSerializer.Serialize(new
            {
                host = "192.168.1.100",
                port = 502,
                unitId = 1,
                startAddress = 0,
                count = 2,
                dataType = "uint16"
            }),
            PollIntervalMs: 10000,
            IsEnabled: false);

        var response = await Client.PutAsJsonAsync($"/api/device-connections/{created!.Id}", updateReq);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await response.Content.ReadFromJsonAsync<DeviceConnectionDto>();
        updated!.Name.Should().Be("Updated Name");
        updated.PollIntervalMs.Should().Be(10000);
        updated.IsEnabled.Should().BeFalse();
    }

    [Fact]
    public async Task Delete_RemovesConnection()
    {
        var ptId = await GetFirstPropertyTypeIdAsync();
        var createResp = await Client.PostAsJsonAsync("/api/device-connections", MakeRequest(ptId));
        var created = await createResp.Content.ReadFromJsonAsync<DeviceConnectionDetailDto>();

        var deleteResp = await Client.DeleteAsync($"/api/device-connections/{created!.Id}");
        deleteResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResp = await Client.GetAsync($"/api/device-connections/{created.Id}");
        getResp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task TestConnection_WorksWithLiveModbusServer()
    {
        await using var server = await ModbusTestServerFixture.StartAsync();
        server.SetRegister(0, 42);

        var ptId = await GetFirstPropertyTypeIdAsync();
        var req = MakeRequest(ptId, server.Port);
        var createResp = await Client.PostAsJsonAsync("/api/device-connections", req);
        var created = await createResp.Content.ReadFromJsonAsync<DeviceConnectionDetailDto>();

        var response = await Client.PostAsync($"/api/device-connections/{created!.Id}/test", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var scan = await response.Content.ReadFromJsonAsync<ScanResponse>();
        scan!.Success.Should().BeTrue();
        scan.Points.Should().NotBeNull();
        scan.Points!.Should().Contain(p => p.CurrentValue == 42);
    }
}
