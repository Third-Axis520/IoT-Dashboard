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

    /// <summary>記錄當下 40013 鞋子在位狀態；true = 有料，false = 無料（空機）</summary>
    public bool HasMaterial { get; set; } = true;

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

// 暫存器對應基本檔（每條前端產線一份）
public class RegisterMapProfile
{
    [Key]
    public int Id { get; set; }

    /// <summary>對應前端 ProductionLine.id（字串 key，例: "line_live"）</summary>
    [Required, MaxLength(100)]
    public string LineId { get; set; } = "";

    [MaxLength(100)]
    public string ProfileName { get; set; } = "";

    public DateTime UpdatedAt { get; set; }

    public List<RegisterMapEntry> Entries { get; set; } = [];

    public int? PlcTemplateId { get; set; }
    public PlcTemplate? PlcTemplate { get; set; }
}

// PLC 型號範本（全域共用）
public class PlcTemplate
{
    [Key] public int Id { get; set; }
    [Required, MaxLength(100)] public string ModelName { get; set; } = "";
    [MaxLength(300)] public string? Description { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<PlcZoneDefinition> Zones { get; set; } = [];
    public List<PlcRegisterDefinition> Registers { get; set; } = [];
}

// Zone 定義：這款 PLC 的第 N 個 Zone，資產編號藏在哪段暫存器
public class PlcZoneDefinition
{
    [Key] public int Id { get; set; }
    public int TemplateId { get; set; }
    public PlcTemplate Template { get; set; } = null!;
    public int ZoneIndex { get; set; }
    [MaxLength(50)] public string ZoneName { get; set; } = "";
    public int AssetCodeRegStart { get; set; }   // 起始地址（十進位）
    public int AssetCodeRegCount { get; set; }   // 幾個暫存器存資產編號
}

// 暫存器定義：這款 PLC 的某個暫存器地址，預設是什麼用途
public class PlcRegisterDefinition
{
    [Key] public int Id { get; set; }
    public int TemplateId { get; set; }
    public PlcTemplate Template { get; set; } = null!;
    public int RegisterAddress { get; set; }     // 十進位地址
    [MaxLength(100)] public string DefaultLabel { get; set; } = "";
    [MaxLength(10)] public string DefaultUnit { get; set; } = "℃";
    public int? DefaultZoneIndex { get; set; }
}

// 暫存器對應明細（一列 = 一個暫存器地址 → 某 Zone 的某 Equipment/Point）
public class RegisterMapEntry
{
    [Key]
    public int Id { get; set; }

    public int ProfileId { get; set; }
    public RegisterMapProfile Profile { get; set; } = null!;

    /// <summary>Zone 索引 0~3，對應資產編號暫存器群組</summary>
    public int ZoneIndex { get; set; }

    /// <summary>溫度暫存器地址，十進位（1~15 對應 0x0001~0x000F）</summary>
    public int RegisterAddress { get; set; }

    /// <summary>對應前端 Equipment.id</summary>
    [MaxLength(100)]
    public string EquipmentId { get; set; } = "";

    /// <summary>對應前端 Point.id</summary>
    [MaxLength(100)]
    public string PointId { get; set; } = "";

    [MaxLength(100)]
    public string Label { get; set; } = "";

    [MaxLength(10)]
    public string Unit { get; set; } = "℃";
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
