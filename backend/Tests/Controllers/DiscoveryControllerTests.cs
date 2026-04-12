using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Tests._Shared;
using IoT.CentralApi.Tests.Adapters._Fixtures;

namespace IoT.CentralApi.Tests.Controllers;

public class DiscoveryControllerTests : IntegrationTestBase
{
    [Fact]
    public async Task Scan_ReturnsDiscoveredPoints_ForModbusTcp()
    {
        await using var server = await ModbusTestServerFixture.StartAsync();

        // Set some register values
        server.SetRegister(0, 100);
        server.SetRegister(1, 200);
        server.SetRegister(2, 300);

        var config = JsonSerializer.Serialize(new
        {
            host = "127.0.0.1",
            port = server.Port,
            unitId = 0,
            startAddress = 0,
            count = 3,
            dataType = "uint16"
        });

        var request = new ScanRequest("modbus_tcp", config);
        var response = await Client.PostAsJsonAsync("/api/discovery/scan", request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var scan = await response.Content.ReadFromJsonAsync<ScanResponse>();
        scan!.Success.Should().BeTrue();
        scan.Points.Should().NotBeNull();
        scan.Points!.Should().HaveCount(3);
        scan.Points[0].CurrentValue.Should().Be(100);
        scan.Points[1].CurrentValue.Should().Be(200);
        scan.Points[2].CurrentValue.Should().Be(300);
    }

    [Fact]
    public async Task Scan_Returns404_ForUnknownProtocol()
    {
        var request = new ScanRequest("nonexistent", "{}");
        var response = await Client.PostAsJsonAsync("/api/discovery/scan", request);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Scan_Returns400_ForInvalidConfig()
    {
        var request = new ScanRequest("modbus_tcp", "{}");
        var response = await Client.PostAsJsonAsync("/api/discovery/scan", request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Scan_Returns502_WhenConnectionFails()
    {
        var config = JsonSerializer.Serialize(new
        {
            host = "127.0.0.1",
            port = 1,  // no server listening
            unitId = 1,
            startAddress = 0,
            count = 1,
            dataType = "uint16"
        });

        var request = new ScanRequest("modbus_tcp", config);
        var response = await Client.PostAsJsonAsync("/api/discovery/scan", request);

        response.StatusCode.Should().Be(HttpStatusCode.BadGateway);
        var scan = await response.Content.ReadFromJsonAsync<ScanResponse>();
        scan!.Success.Should().BeFalse();
        scan.Error.Should().NotBeNullOrEmpty();
    }
}
