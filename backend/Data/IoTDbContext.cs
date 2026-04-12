using IoT.CentralApi.Models;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Data;

public class IoTDbContext(DbContextOptions<IoTDbContext> options) : DbContext(options)
{
    public DbSet<SensorReading> SensorReadings => Set<SensorReading>();
    public DbSet<SensorAlert> SensorAlerts => Set<SensorAlert>();
    public DbSet<SensorLimit> SensorLimits => Set<SensorLimit>();
    public DbSet<AssetCache> AssetCaches => Set<AssetCache>();
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<RegisterMapProfile> RegisterMapProfiles => Set<RegisterMapProfile>();
    public DbSet<RegisterMapEntry> RegisterMapEntries => Set<RegisterMapEntry>();
    public DbSet<PlcTemplate> PlcTemplates => Set<PlcTemplate>();
    public DbSet<PlcZoneDefinition> PlcZoneDefinitions => Set<PlcZoneDefinition>();
    public DbSet<PlcRegisterDefinition> PlcRegisterDefinitions => Set<PlcRegisterDefinition>();
    public DbSet<EquipmentType>       EquipmentTypes       => Set<EquipmentType>();
    public DbSet<EquipmentTypeSensor> EquipmentTypeSensors => Set<EquipmentTypeSensor>();
    public DbSet<LineConfig>          LineConfigs          => Set<LineConfig>();
    public DbSet<LineEquipment>       LineEquipments       => Set<LineEquipment>();
    public DbSet<PropertyType>        PropertyTypes        => Set<PropertyType>();
    public DbSet<DeviceConnection>    DeviceConnections    => Set<DeviceConnection>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // SensorLimit 複合主鍵
        modelBuilder.Entity<SensorLimit>()
            .HasKey(s => new { s.AssetCode, s.SensorId });

        // SensorReadings 索引（查詢歷史常用）
        modelBuilder.Entity<SensorReading>()
            .HasIndex(r => new { r.AssetCode, r.SensorId, r.Timestamp });

        // SensorAlerts 索引
        modelBuilder.Entity<SensorAlert>()
            .HasIndex(a => new { a.AssetCode, a.Timestamp });

        // Devices 唯一索引
        modelBuilder.Entity<Device>()
            .HasIndex(d => d.SerialNumber)
            .IsUnique();

        // RegisterMapProfile：LineId 唯一索引
        modelBuilder.Entity<RegisterMapProfile>()
            .HasIndex(p => p.LineId)
            .IsUnique();

        // RegisterMapEntry：一份 Profile 內，同一地址不重複
        modelBuilder.Entity<RegisterMapEntry>()
            .HasIndex(e => new { e.ProfileId, e.RegisterAddress })
            .IsUnique();

        // PlcZoneDefinition：同一 Template 內 ZoneIndex 唯一
        modelBuilder.Entity<PlcZoneDefinition>()
            .HasIndex(z => new { z.TemplateId, z.ZoneIndex })
            .IsUnique();

        // PlcRegisterDefinition：同一 Template 內 RegisterAddress 唯一
        modelBuilder.Entity<PlcRegisterDefinition>()
            .HasIndex(r => new { r.TemplateId, r.RegisterAddress })
            .IsUnique();

        // RegisterMapProfile → PlcTemplate（nullable FK，刪除 Template 時 SetNull）
        modelBuilder.Entity<RegisterMapProfile>()
            .HasOne(p => p.PlcTemplate)
            .WithMany()
            .HasForeignKey(p => p.PlcTemplateId)
            .OnDelete(DeleteBehavior.SetNull);

        // ── EquipmentType ─────────────────────────────────────────────────────
        modelBuilder.Entity<EquipmentTypeSensor>()
            .HasIndex(s => new { s.EquipmentTypeId, s.SensorId })
            .IsUnique();

        modelBuilder.Entity<EquipmentTypeSensor>()
            .HasOne(s => s.EquipmentType)
            .WithMany(et => et.Sensors)
            .HasForeignKey(s => s.EquipmentTypeId)
            .OnDelete(DeleteBehavior.Cascade);

        // ── LineConfig ────────────────────────────────────────────────────────
        modelBuilder.Entity<LineConfig>()
            .HasIndex(lc => lc.LineId)
            .IsUnique();

        modelBuilder.Entity<LineEquipment>()
            .HasOne(le => le.LineConfig)
            .WithMany(lc => lc.Equipments)
            .HasForeignKey(le => le.LineConfigId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<LineEquipment>()
            .HasOne(le => le.EquipmentType)
            .WithMany(et => et.LineEquipments)
            .HasForeignKey(le => le.EquipmentTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        // PropertyType: Key 全域唯一
        modelBuilder.Entity<PropertyType>()
            .HasIndex(pt => pt.Key)
            .IsUnique();

        // ── DeviceConnection ──────────────────────────────────────────────────
        modelBuilder.Entity<DeviceConnection>()
            .HasOne(dc => dc.EquipmentType)
            .WithMany()
            .HasForeignKey(dc => dc.EquipmentTypeId)
            .OnDelete(DeleteBehavior.SetNull);

        // EquipmentTypeSensor → PropertyType FK
        modelBuilder.Entity<EquipmentTypeSensor>()
            .HasOne(s => s.PropertyType)
            .WithMany()
            .HasForeignKey(s => s.PropertyTypeId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
