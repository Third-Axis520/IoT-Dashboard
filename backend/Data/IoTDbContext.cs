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
    }
}
