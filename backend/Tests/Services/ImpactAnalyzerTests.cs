using System.Net;
using System.Net.Http.Json;
using IoT.CentralApi.Controllers;
using IoT.CentralApi.Dtos;
using IoT.CentralApi.Services;
using IoT.CentralApi.Tests._Shared;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IoT.CentralApi.Tests.Services;

public class ImpactAnalyzerTests : IntegrationTestBase
{
    private ImpactAnalyzer CreateAnalyzer()
    {
        var dbFactory = Factory.Services.GetRequiredService<IDbContextFactory<IoT.CentralApi.Data.IoTDbContext>>();
        return new ImpactAnalyzer(dbFactory);
    }

    [Fact]
    public async Task PropertyTypeDeletion_ReturnsBlock_WhenInUse()
    {
        // Create a custom property type
        var ptReq = new SavePropertyTypeRequest("test_impact", "測試衝擊", "zap", "V", null, null, "normal", 0);
        var ptResp = await Client.PostAsJsonAsync("/api/property-types", ptReq);
        var pt = await ptResp.Content.ReadFromJsonAsync<PropertyTypeDto>();

        // Create an EquipmentType referencing it
        var etReq = new SaveEquipmentTypeRequest(
            "Impact Test Equipment", "single_kpi", null,
            new List<SaveSensorRequest>
            {
                new(SensorId: 6001, PointId: "pt_test", Label: "測試", Unit: "V",
                    PropertyTypeId: pt!.Id)
            });
        await Client.PostAsJsonAsync("/api/equipment-types", etReq);

        var analyzer = CreateAnalyzer();
        var result = await analyzer.AnalyzePropertyTypeDeletion(pt.Id);

        result.RequiresConfirmation.Should().BeTrue();
        result.Impact.Should().NotBeNull();
        result.Impact!.Severity.Should().Be("block");
        result.Impact.Affected.Should().Contain("Impact Test Equipment");
    }

    [Fact]
    public async Task PropertyTypeDeletion_ReturnsSilent_WhenNotInUse()
    {
        var ptReq = new SavePropertyTypeRequest("test_unused", "未使用", "circle", "", null, null, "normal", 0);
        var ptResp = await Client.PostAsJsonAsync("/api/property-types", ptReq);
        var pt = await ptResp.Content.ReadFromJsonAsync<PropertyTypeDto>();

        var analyzer = CreateAnalyzer();
        var result = await analyzer.AnalyzePropertyTypeDeletion(pt!.Id);

        result.RequiresConfirmation.Should().BeFalse();
        result.Impact.Should().BeNull();
    }

    [Fact]
    public async Task DeviceConnectionDeletion_ReturnsWarning_WhenEquipmentOnLine()
    {
        var ptResp = await Client.GetAsync("/api/property-types");
        var pts = await ptResp.Content.ReadFromJsonAsync<List<PropertyTypeDto>>();
        var tempId = pts!.First(p => p.Key == "temperature").Id;

        // Create EquipmentType
        var etReq = new SaveEquipmentTypeRequest(
            "Line Equipment", "single_kpi", null,
            new List<SaveSensorRequest>
            {
                new(SensorId: 6010, PointId: "pt_line", Label: "溫度", Unit: "℃",
                    PropertyTypeId: tempId)
            });
        var etResp = await Client.PostAsJsonAsync("/api/equipment-types", etReq);
        var et = await etResp.Content.ReadFromJsonAsync<EquipmentTypeDto>();

        // Create LineConfig with this EquipmentType
        var lcReq = new
        {
            lineId = "LINE_IMPACT_TEST",
            name = "衝擊測試產線",
            equipments = new[]
            {
                new { equipmentTypeId = et!.Id, assetCode = "IMPACT_ASSET", sortOrder = 0 }
            }
        };
        await Client.PostAsJsonAsync("/api/line-configs", lcReq);

        // Create DeviceConnection linked to this EquipmentType
        await using var db = await CreateDbContextAsync();
        var dc = new IoT.CentralApi.Models.DeviceConnection
        {
            Name = "Impact Connection",
            Protocol = "modbus_tcp",
            ConfigJson = "{}",
            IsEnabled = false,
            EquipmentTypeId = et.Id,
            CreatedAt = DateTime.UtcNow,
        };
        db.DeviceConnections.Add(dc);
        await db.SaveChangesAsync();

        var analyzer = CreateAnalyzer();
        var result = await analyzer.AnalyzeDeviceConnectionDeletion(dc.Id);

        result.RequiresConfirmation.Should().BeTrue();
        result.Impact.Should().NotBeNull();
        result.Impact!.Severity.Should().Be("warning");
        result.Impact.Affected.Should().Contain("衝擊測試產線");
    }

    [Fact]
    public async Task DeviceConnectionDeletion_ReturnsSilent_WhenNoEquipment()
    {
        await using var db = await CreateDbContextAsync();
        var dc = new IoT.CentralApi.Models.DeviceConnection
        {
            Name = "Orphan Connection",
            Protocol = "push_ingest",
            ConfigJson = "{}",
            IsEnabled = false,
            CreatedAt = DateTime.UtcNow,
        };
        db.DeviceConnections.Add(dc);
        await db.SaveChangesAsync();

        var analyzer = CreateAnalyzer();
        var result = await analyzer.AnalyzeDeviceConnectionDeletion(dc.Id);

        result.RequiresConfirmation.Should().BeFalse();
        result.Impact.Should().BeNull();
    }
}
