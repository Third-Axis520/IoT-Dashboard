using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Tools;

public static class DeviceSeeder
{
    public static async Task SeedPressingMachineAsync(
        IoTDbContext db, string assetCode, string displayName, int lineConfigId)
    {
        if (await db.DeviceConnections.AnyAsync(dc =>
            dc.Protocol == "iot_receiver_db" &&
            dc.ConfigJson.Contains($"\"{assetCode}\"")))
        {
            Console.WriteLine($"[seed] 強勢壓底機 {assetCode} 已存在，跳過");
            return;
        }

        var props = await db.PropertyTypes.ToDictionaryAsync(p => p.Key);
        var pressure = props["pressure"].Id;
        var duration = props["duration"].Id;
        var counter = props["counter"].Id;

        var eqType = new EquipmentType
        {
            Name = "強勢壓底機",
            VisType = "pressing_machine_lr",
            Description = "壓合段強勢壓底機，左右兩側多階段壓力 + 循環時間",
            CreatedAt = DateTime.UtcNow,
            Sensors =
            [
                new EquipmentTypeSensor { SensorId = 50001, PointId = "pt_run_time",        Label = "開機時間",     Unit = "s",   PropertyTypeId = duration, RawAddress = "RunTimeSeconds",          SortOrder = 0 },
                new EquipmentTypeSensor { SensorId = 50002, PointId = "pt_operate_time",    Label = "作業時間",     Unit = "s",   PropertyTypeId = duration, RawAddress = "OperateTimeSeconds",      SortOrder = 1 },
                new EquipmentTypeSensor { SensorId = 50003, PointId = "pt_left_count",      Label = "左壓次",       Unit = "次",  PropertyTypeId = counter,  RawAddress = "LeftPressCount",          SortOrder = 2 },
                new EquipmentTypeSensor { SensorId = 50004, PointId = "pt_left_cycle",      Label = "左循環時間",   Unit = "s",   PropertyTypeId = duration, RawAddress = "LeftCycleTime",           SortOrder = 3 },
                new EquipmentTypeSensor { SensorId = 50005, PointId = "pt_left_press_dur",  Label = "左壓著時間",   Unit = "s",   PropertyTypeId = duration, RawAddress = "LeftPressDuration",       SortOrder = 4 },
                new EquipmentTypeSensor { SensorId = 50006, PointId = "pt_right_count",     Label = "右壓次",       Unit = "次",  PropertyTypeId = counter,  RawAddress = "RightPressCount",         SortOrder = 5 },
                new EquipmentTypeSensor { SensorId = 50007, PointId = "pt_right_cycle",     Label = "右循環時間",   Unit = "s",   PropertyTypeId = duration, RawAddress = "RightCycleTime",          SortOrder = 6 },
                new EquipmentTypeSensor { SensorId = 50008, PointId = "pt_right_press_dur", Label = "右壓著時間",   Unit = "s",   PropertyTypeId = duration, RawAddress = "RightPressDuration",      SortOrder = 7 },
                new EquipmentTypeSensor { SensorId = 50009, PointId = "pt_left_p1",         Label = "左束緊壓力",   Unit = "bar", PropertyTypeId = pressure, RawAddress = "LeftTighteningPressure",  SortOrder = 8 },
                new EquipmentTypeSensor { SensorId = 50010, PointId = "pt_left_p2",         Label = "左二次壓力",   Unit = "bar", PropertyTypeId = pressure, RawAddress = "LeftSecondaryPressure",   SortOrder = 9 },
                new EquipmentTypeSensor { SensorId = 50011, PointId = "pt_left_p3",         Label = "左押邊壓力",   Unit = "bar", PropertyTypeId = pressure, RawAddress = "LeftEdgePressure",        SortOrder = 10 },
                new EquipmentTypeSensor { SensorId = 50012, PointId = "pt_right_p1",        Label = "右束緊壓力",   Unit = "bar", PropertyTypeId = pressure, RawAddress = "RightTighteningPressure", SortOrder = 11 },
                new EquipmentTypeSensor { SensorId = 50013, PointId = "pt_right_p2",        Label = "右二次壓力",   Unit = "bar", PropertyTypeId = pressure, RawAddress = "RightSecondaryPressure",  SortOrder = 12 },
                new EquipmentTypeSensor { SensorId = 50014, PointId = "pt_right_p3",        Label = "右押邊壓力",   Unit = "bar", PropertyTypeId = pressure, RawAddress = "RightEdgePressure",       SortOrder = 13 },
            ]
        };
        db.EquipmentTypes.Add(eqType);
        await db.SaveChangesAsync();

        var conn = new DeviceConnection
        {
            Name = displayName,
            Protocol = "iot_receiver_db",
            ConfigJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                tableName = "PressingMachineRealTimeData",
                assetCode,
                maxAgeMs = 30000,
            }),
            PollIntervalMs = 2000,
            IsEnabled = true,
            EquipmentTypeId = eqType.Id,
            CreatedAt = DateTime.UtcNow,
        };
        db.DeviceConnections.Add(conn);

        var maxSort = await db.LineEquipments
            .Where(le => le.LineConfigId == lineConfigId)
            .Select(le => (int?)le.SortOrder)
            .MaxAsync() ?? -1;

        db.LineEquipments.Add(new LineEquipment
        {
            LineConfigId = lineConfigId,
            EquipmentTypeId = eqType.Id,
            AssetCode = assetCode,
            DisplayName = displayName,
            SortOrder = maxSort + 1,
            IsHidden = false,
        });

        await db.SaveChangesAsync();
        Console.WriteLine($"[seed] 強勢壓底機 {assetCode} ({displayName}) 已建立，EquipmentTypeId={eqType.Id}, ConnectionId={conn.Id}");
    }

    public static async Task SeedVisualMarkingMachineAsync(
        IoTDbContext db, string assetCode, string displayName, int lineConfigId)
    {
        if (await db.DeviceConnections.AnyAsync(dc =>
            dc.Protocol == "iot_receiver_db" &&
            dc.ConfigJson.Contains($"\"{assetCode}\"")))
        {
            Console.WriteLine($"[seed] 劃線機 {assetCode} 已存在，跳過");
            return;
        }

        var pressure = await db.PropertyTypes
            .Where(p => p.Key == "pressure").Select(p => p.Id).FirstAsync();

        var eqType = new EquipmentType
        {
            Name = "畫線機",
            VisType = "visual_marking_machine",
            Description = "視覺辨識劃線設備，僅監測壓力",
            CreatedAt = DateTime.UtcNow,
            Sensors =
            [
                new EquipmentTypeSensor { SensorId = 60001, PointId = "pt_pressure", Label = "壓力", Unit = "bar", PropertyTypeId = pressure, RawAddress = "Pressure", SortOrder = 0 },
            ]
        };
        db.EquipmentTypes.Add(eqType);
        await db.SaveChangesAsync();

        var conn = new DeviceConnection
        {
            Name = displayName,
            Protocol = "iot_receiver_db",
            ConfigJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                tableName = "VisualMarkingMachineRealTimeData",
                assetCode,
                maxAgeMs = 30000,
            }),
            PollIntervalMs = 2000,
            IsEnabled = true,
            EquipmentTypeId = eqType.Id,
            CreatedAt = DateTime.UtcNow,
        };
        db.DeviceConnections.Add(conn);

        var maxSort = await db.LineEquipments
            .Where(le => le.LineConfigId == lineConfigId)
            .Select(le => (int?)le.SortOrder)
            .MaxAsync() ?? -1;

        db.LineEquipments.Add(new LineEquipment
        {
            LineConfigId = lineConfigId,
            EquipmentTypeId = eqType.Id,
            AssetCode = assetCode,
            DisplayName = displayName,
            SortOrder = maxSort + 1,
            IsHidden = false,
        });

        await db.SaveChangesAsync();
        Console.WriteLine($"[seed] 畫線機 {assetCode} ({displayName}) 已建立，EquipmentTypeId={eqType.Id}, ConnectionId={conn.Id}");
    }
}
