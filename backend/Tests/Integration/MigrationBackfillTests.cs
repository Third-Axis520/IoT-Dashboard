using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using IoT.CentralApi.Tests._Shared;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Tests.Integration;

public class MigrationBackfillTests : IntegrationTestBase
{
    [Fact]
    public async Task EquipmentTypeSensor_CanBeCreated_WithPropertyTypeId()
    {
        await using var db = await CreateDbContextAsync();

        var temp = await db.PropertyTypes.FirstAsync(p => p.Key == "temperature");

        var et = new EquipmentType
        {
            Name = "Test EQ",
            VisType = "single_kpi",
            CreatedAt = DateTime.UtcNow,
            Sensors = new List<EquipmentTypeSensor>
            {
                new()
                {
                    SensorId = 9001,
                    PointId = "pt_t1",
                    Label = "Temp",
                    Unit = "℃",
                    PropertyTypeId = temp.Id,
                    RawAddress = "40001",
                    SortOrder = 0
                }
            }
        };

        db.EquipmentTypes.Add(et);
        await db.SaveChangesAsync();

        var loaded = await db.EquipmentTypes
            .Include(e => e.Sensors)
                .ThenInclude(s => s.PropertyType)
            .FirstAsync(e => e.Id == et.Id);

        loaded.Sensors.Should().HaveCount(1);
        loaded.Sensors[0].PropertyType.Key.Should().Be("temperature");
        loaded.Sensors[0].RawAddress.Should().Be("40001");
    }

    [Fact]
    public void EquipmentTypeSensor_HasNoRoleProperty_Anymore()
    {
        // Verify via reflection that EquipmentTypeSensor no longer has a "Role" property
        var type = typeof(EquipmentTypeSensor);
        var roleProp = type.GetProperty("Role");
        roleProp.Should().BeNull("Role was migrated to PropertyTypeId");
    }
}
