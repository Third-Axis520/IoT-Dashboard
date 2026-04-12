using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IoT.CentralApi.Controllers;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Tests._Shared;

namespace IoT.CentralApi.Tests.Controllers;

public class DiagnosticsControllerTests : IntegrationTestBase
{
    [Fact]
    public async Task GetPollingStatus_ReturnsPollingInfo()
    {
        var response = await Client.GetAsync("/api/diagnostics/polling");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var diag = await response.Content.ReadFromJsonAsync<PollingDiagnosticsDto>();
        diag.Should().NotBeNull();
        diag!.Polling.Should().NotBeNull();
        diag.Polling.IsRunning.Should().BeTrue();
        diag.Connections.Should().NotBeNull();
    }

    [Fact]
    public async Task GetPollingStatus_IncludesConnectionHealth()
    {
        // Create a modbus connection first
        var ptResp = await Client.GetAsync("/api/property-types");
        var pts = await ptResp.Content.ReadFromJsonAsync<List<PropertyTypeDto>>();
        var tempId = pts!.First(p => p.Key == "temperature").Id;

        var req = new SaveDeviceConnectionRequest(
            Name: "Diag Test",
            Protocol: "modbus_tcp",
            Config: JsonSerializer.Serialize(new
            {
                host = "127.0.0.1", port = 502, unitId = 0,
                startAddress = 0, count = 1, dataType = "uint16"
            }),
            PollIntervalMs: 5000,
            IsEnabled: false);
        await Client.PostAsJsonAsync("/api/device-connections", req);

        var response = await Client.GetAsync("/api/diagnostics/polling");
        var diag = await response.Content.ReadFromJsonAsync<PollingDiagnosticsDto>();

        diag!.Connections.Should().Contain(c => c.Name == "Diag Test" && c.Status == "disabled");
    }
}
