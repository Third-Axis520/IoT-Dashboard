using System.Net;
using System.Net.Http.Json;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Tests._Shared;

namespace IoT.CentralApi.Tests.Controllers;

public class ProtocolsControllerTests : IntegrationTestBase
{
    [Fact]
    public async Task GetAll_ReturnsAllRegisteredProtocols()
    {
        var response = await Client.GetAsync("/api/protocols");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var protocols = await response.Content.ReadFromJsonAsync<List<ProtocolDto>>();
        protocols.Should().NotBeNull();
        protocols!.Count.Should().BeGreaterThanOrEqualTo(3);
        protocols.Should().Contain(p => p.Id == "push_ingest");
        protocols.Should().Contain(p => p.Id == "modbus_tcp");
        protocols.Should().Contain(p => p.Id == "web_api");
    }

    [Fact]
    public async Task GetAll_IncludesConfigSchemaFields()
    {
        var response = await Client.GetAsync("/api/protocols");
        var protocols = await response.Content.ReadFromJsonAsync<List<ProtocolDto>>();

        var modbus = protocols!.First(p => p.Id == "modbus_tcp");
        modbus.DisplayName.Should().Be("Modbus TCP");
        modbus.SupportsDiscovery.Should().BeTrue();
        modbus.SupportsLivePolling.Should().BeTrue();
        modbus.ConfigSchema.Should().NotBeNull();
        modbus.ConfigSchema.Fields.Should().Contain(f => f.Name == "host" && f.Required);
        modbus.ConfigSchema.Fields.Should().Contain(f => f.Name == "port" && f.Type == "number");
    }

    [Fact]
    public async Task GetOne_ReturnsSpecificProtocol()
    {
        var response = await Client.GetAsync("/api/protocols/modbus_tcp");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var protocol = await response.Content.ReadFromJsonAsync<ProtocolDto>();
        protocol!.Id.Should().Be("modbus_tcp");
        protocol.DisplayName.Should().Be("Modbus TCP");
    }

    [Fact]
    public async Task GetOne_Returns404_ForUnknownProtocol()
    {
        var response = await Client.GetAsync("/api/protocols/nonexistent");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
