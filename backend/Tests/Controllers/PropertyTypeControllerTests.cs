using System.Net;
using System.Net.Http.Json;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Tests._Shared;

namespace IoT.CentralApi.Tests.Controllers;

public class PropertyTypeControllerTests : IntegrationTestBase
{
    [Fact]
    public async Task GetAll_ReturnsSeededBuiltInProperties()
    {
        var response = await Client.GetAsync("/api/property-types");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var properties = await response.Content.ReadFromJsonAsync<List<PropertyTypeDto>>();
        properties.Should().NotBeNull();
        properties!.Should().HaveCount(9);
        properties.Should().Contain(p => p.Key == "temperature" && p.Name == "溫度");
        properties.Should().Contain(p => p.Key == "material_detect" && p.Behavior == "material_detect");
    }

    [Fact]
    public async Task GetOne_ReturnsSpecificProperty()
    {
        // Get all first, pick one
        var allResp = await Client.GetAsync("/api/property-types");
        var all = await allResp.Content.ReadFromJsonAsync<List<PropertyTypeDto>>();
        var temp = all!.First(p => p.Key == "temperature");

        var response = await Client.GetAsync($"/api/property-types/{temp.Id}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await response.Content.ReadFromJsonAsync<PropertyTypeDto>();
        dto!.Key.Should().Be("temperature");
        dto.IsBuiltIn.Should().BeTrue();
    }

    [Fact]
    public async Task GetOne_Returns404_WhenNotFound()
    {
        var response = await Client.GetAsync("/api/property-types/99999");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
