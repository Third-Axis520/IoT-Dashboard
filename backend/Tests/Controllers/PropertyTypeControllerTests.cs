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
        properties!.Should().HaveCount(8);
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

    [Fact]
    public async Task Create_AddsCustomPropertyType()
    {
        var request = new SavePropertyTypeRequest(
            Key: "current",
            Name: "電流",
            Icon: "zap",
            DefaultUnit: "A",
            DefaultUcl: 100,
            DefaultLcl: 0,
            Behavior: "normal",
            SortOrder: 100);

        var response = await Client.PostAsJsonAsync("/api/property-types", request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var created = await response.Content.ReadFromJsonAsync<PropertyTypeDto>();
        created.Should().NotBeNull();
        created!.Key.Should().Be("current");
        created.Name.Should().Be("電流");
        created.IsBuiltIn.Should().BeFalse();
        created.Id.Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task Create_ReturnsConflict_WhenKeyAlreadyExists()
    {
        var request = new SavePropertyTypeRequest(
            Key: "temperature",
            Name: "溫度2",
            Icon: "thermometer",
            Behavior: "normal");

        var response = await Client.PostAsJsonAsync("/api/property-types", request);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Update_ChangesNameAndUnit_ButNotKeyOrBehavior()
    {
        // Arrange — create a custom property
        var createReq = new SavePropertyTypeRequest("voltage", "電壓", "zap", "V", null, null, "normal", 0);
        var createResp = await Client.PostAsJsonAsync("/api/property-types", createReq);
        var created = await createResp.Content.ReadFromJsonAsync<PropertyTypeDto>();

        // Act — update name and unit
        var updateReq = new UpdatePropertyTypeRequest("輸入電壓", "zap", "V", 240, 200, 0);
        var updateResp = await Client.PutAsJsonAsync($"/api/property-types/{created!.Id}", updateReq);

        // Assert
        updateResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await updateResp.Content.ReadFromJsonAsync<PropertyTypeDto>();
        updated!.Name.Should().Be("輸入電壓");
        updated.Key.Should().Be("voltage");       // Key unchanged
        updated.Behavior.Should().Be("normal");   // Behavior unchanged
        updated.DefaultUcl.Should().Be(240);
        updated.DefaultLcl.Should().Be(200);
    }

    [Fact]
    public async Task Delete_BuiltInProperty_Returns409()
    {
        var listResp = await Client.GetAsync("/api/property-types");
        var list = await listResp.Content.ReadFromJsonAsync<List<PropertyTypeDto>>();
        var tempId = list!.First(p => p.Key == "temperature").Id;

        var response = await Client.DeleteAsync($"/api/property-types/{tempId}");

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Delete_CustomProperty_Succeeds_WhenNotInUse()
    {
        // Arrange — create custom
        var createReq = new SavePropertyTypeRequest("torque", "扭力", "wrench", "Nm", null, null, "normal", 0);
        var createResp = await Client.PostAsJsonAsync("/api/property-types", createReq);
        var created = await createResp.Content.ReadFromJsonAsync<PropertyTypeDto>();

        // Act
        var deleteResp = await Client.DeleteAsync($"/api/property-types/{created!.Id}");

        // Assert
        deleteResp.StatusCode.Should().Be(HttpStatusCode.NoContent);
        var afterResp = await Client.GetAsync($"/api/property-types/{created.Id}");
        afterResp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_ReturnsNotFound_WhenIdDoesNotExist()
    {
        var response = await Client.DeleteAsync("/api/property-types/99999");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_Returns409_WhenPropertyTypeIsInUseByASensor()
    {
        // Arrange — create a custom property, then create an EquipmentType with a sensor referencing it
        var ptReq = new SavePropertyTypeRequest("vibration", "振動", "activity", "mm/s", null, null, "normal", 0);
        var ptResp = await Client.PostAsJsonAsync("/api/property-types", ptReq);
        var pt = await ptResp.Content.ReadFromJsonAsync<PropertyTypeDto>();

        var etReq = new
        {
            name = "Test Equipment",
            visType = "single_kpi",
            description = (string?)null,
            sensors = new[]
            {
                new { sensorId = 8001, pointId = "pt_vib", label = "振動", unit = "mm/s", propertyTypeId = pt!.Id, rawAddress = (string?)null, sortOrder = 0 }
            }
        };
        var etResp = await Client.PostAsJsonAsync("/api/equipment-types", etReq);
        etResp.StatusCode.Should().Be(HttpStatusCode.OK);

        // Act — try to delete the property type that's now in use
        var deleteResp = await Client.DeleteAsync($"/api/property-types/{pt.Id}");

        // Assert
        deleteResp.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }
}
