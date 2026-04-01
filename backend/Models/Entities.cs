using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace IoT.CentralApi.Models;

// 時序讀值（寫入頻繁）
public class SensorReading
{
    [Key]
    public long Id { get; set; }

    [Required, MaxLength(50)]
    public string AssetCode { get; set; } = "";

    public int SensorId { get; set; }

    public double Value { get; set; }

    public bool HasError { get; set; }

    public DateTime Timestamp { get; set; }
}

// 告警記錄
public class SensorAlert
{
    [Key]
    public long Id { get; set; }

    [Required, MaxLength(50)]
    public string AssetCode { get; set; } = "";

    public int SensorId { get; set; }

    [MaxLength(100)]
    public string? SensorName { get; set; }

    public double Value { get; set; }

    public double LimitValue { get; set; }

    /// <summary>'UCL' | 'LCL'</summary>
    [MaxLength(10)]
    public string AlertType { get; set; } = "";

    /// <summary>'warning' | 'danger'</summary>
    [MaxLength(10)]
    public string Severity { get; set; } = "";

    public DateTime Timestamp { get; set; }

    public bool IsAcknowledged { get; set; }

    public bool WeChatNotified { get; set; }
}

// UCL/LCL 設定（複合主鍵）
public class SensorLimit
{
    [Required, MaxLength(50)]
    public string AssetCode { get; set; } = "";

    public int SensorId { get; set; }

    [MaxLength(100)]
    public string? SensorName { get; set; }

    public double UCL { get; set; }

    public double LCL { get; set; }

    [MaxLength(10)]
    public string Unit { get; set; } = "℃";

    public DateTime? UpdatedAt { get; set; }
}

// 設備登錄（SerialNumber → AssetCode 綁定）
public class Device
{
    [Key]
    public int Id { get; set; }

    [Required, MaxLength(100)]
    public string SerialNumber { get; set; } = "";

    [MaxLength(50)]
    public string? IpAddress { get; set; }

    /// <summary>null 表示尚未綁定</summary>
    [MaxLength(50)]
    public string? AssetCode { get; set; }

    [MaxLength(200)]
    public string? FriendlyName { get; set; }

    public DateTime FirstSeen { get; set; }

    public DateTime LastSeen { get; set; }
}

// FAS 資產資訊快取
public class AssetCache
{
    [Key, MaxLength(50)]
    public string AssetCode { get; set; } = "";

    [MaxLength(200)]
    public string? AssetName { get; set; }

    [MaxLength(200)]
    public string? NickName { get; set; }

    [MaxLength(200)]
    public string? DepartmentName { get; set; }

    [MaxLength(200)]
    public string? SupplierName { get; set; }

    [MaxLength(500)]
    public string? Spec { get; set; }

    public DateTime LastUpdated { get; set; }
}
