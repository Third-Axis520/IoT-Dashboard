using System.Net;
using System.Net.Http.Json;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Models;
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
        // Seed a device connection directly (POST endpoint removed)
        await using var db = await CreateDbContextAsync();
        db.DeviceConnections.Add(new DeviceConnection
        {
            Name = "Diag Test",
            Protocol = "modbus_tcp",
            ConfigJson = "{}",
            IsEnabled = false,
            CreatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var response = await Client.GetAsync("/api/diagnostics/polling");
        var diag = await response.Content.ReadFromJsonAsync<PollingDiagnosticsDto>();

        diag!.Connections.Should().Contain(c => c.Name == "Diag Test" && c.Status == "disabled");
    }
}
