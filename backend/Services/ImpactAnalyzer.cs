using IoT.CentralApi.Data;
using IoT.CentralApi.Dtos;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Services;

/// <summary>
/// Analyzes cross-entity impact before destructive operations.
/// Returns ImpactResult indicating if confirmation is needed.
/// </summary>
public class ImpactAnalyzer(IDbContextFactory<IoTDbContext> dbFactory)
{
    /// <summary>Check impact of deleting a PropertyType.</summary>
    public async Task<ImpactResult> AnalyzePropertyTypeDeletion(int propertyTypeId)
    {
        await using var db = await dbFactory.CreateDbContextAsync();

        var sensors = await db.EquipmentTypeSensors
            .Where(s => s.PropertyTypeId == propertyTypeId)
            .Include(s => s.EquipmentType)
            .ToListAsync();

        if (sensors.Count == 0)
            return new ImpactResult(false, null);

        var equipmentNames = sensors
            .Select(s => s.EquipmentType.Name)
            .Distinct()
            .ToList();

        return new ImpactResult(true, new ImpactDetail(
            Severity: "block",
            Title: "此屬性類型正在使用中",
            Message: $"有 {sensors.Count} 個感測器使用此屬性類型，分佈在 {equipmentNames.Count} 個設備類型中。請先移除這些引用。",
            Affected: equipmentNames));
    }

    /// <summary>Check impact of deleting a DeviceConnection.</summary>
    public async Task<ImpactResult> AnalyzeDeviceConnectionDeletion(int connectionId)
    {
        await using var db = await dbFactory.CreateDbContextAsync();

        var dc = await db.DeviceConnections
            .Include(dc => dc.EquipmentType!)
                .ThenInclude(et => et.LineEquipments)
                    .ThenInclude(le => le.LineConfig)
            .FirstOrDefaultAsync(dc => dc.Id == connectionId);

        if (dc?.EquipmentType == null)
            return new ImpactResult(false, null);

        var lineEquipments = dc.EquipmentType.LineEquipments;
        if (lineEquipments.Count == 0)
            return new ImpactResult(false, null);

        var lineNames = lineEquipments
            .Select(le => le.LineConfig.Name)
            .Distinct()
            .ToList();

        return new ImpactResult(true, new ImpactDetail(
            Severity: "warning",
            Title: "設備類型已配置在產線中",
            Message: $"關聯的設備類型 '{dc.EquipmentType.Name}' 正在 {lineNames.Count} 條產線中使用。刪除連線不會影響��線配置，但設備類型將失去資料來源。",
            Affected: lineNames));
    }
}
