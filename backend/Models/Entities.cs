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

// ── Direction-C: Dynamic Equipment System ─────────────────────────────────────

/// <summary>設備類型定義（取代前端 MachineTemplate）</summary>
public class EquipmentType
{
    public int Id { get; set; }
    [Required, MaxLength(100)] public string Name { get; set; } = "";
    /// <summary>前端 visType：single_kpi | dual_side_spark | four_rings | molding_matrix | custom_grid</summary>
    [Required, MaxLength(50)] public string VisType { get; set; } = "single_kpi";
    [MaxLength(300)] public string? Description { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<EquipmentTypeSensor> Sensors { get; set; } = [];
    public List<LineEquipment> LineEquipments { get; set; } = [];
}

/// <summary>屬於某設備類型的感測器定義</summary>
public class EquipmentTypeSensor
{
    public int Id { get; set; }
    public int EquipmentTypeId { get; set; }
    /// <summary>PLC 傳入的 SensorId（同 SensorReading.SensorId）</summary>
    public int SensorId { get; set; }
    /// <summary>前端 Point.id，如 "pt_mh_right"</summary>
    [Required, MaxLength(100)] public string PointId { get; set; } = "";
    [Required, MaxLength(100)] public string Label { get; set; } = "";
    [MaxLength(10)] public string Unit { get; set; } = "℃";
    public int PropertyTypeId { get; set; }
    public PropertyType PropertyType { get; set; } = null!;
    [MaxLength(100)] public string? RawAddress { get; set; }
    public int SortOrder { get; set; }
    public EquipmentType EquipmentType { get; set; } = null!;
}

/// <summary>產線設定（取代前端 liveLineConfig.ts）</summary>
public class LineConfig
{
    public int Id { get; set; }
    [Required, MaxLength(100)] public string LineId { get; set; } = "";
    [Required, MaxLength(200)] public string Name { get; set; } = "";
    public DateTime UpdatedAt { get; set; }
    public List<LineEquipment> Equipments { get; set; } = [];
}

/// <summary>產線中的設備實例（一個 EquipmentType 綁定一個 AssetCode）</summary>
public class LineEquipment
{
    public int Id { get; set; }
    public int LineConfigId { get; set; }
    public int EquipmentTypeId { get; set; }
    [MaxLength(50)] public string? AssetCode { get; set; }
    [MaxLength(200)] public string? DisplayName { get; set; }
    public int SortOrder { get; set; }
    /// <summary>True = 不顯示在儀表板，但仍可作為 sensor gating 來源（DI 集中器專用）</summary>
    public bool IsHidden { get; set; }
    public LineConfig LineConfig { get; set; } = null!;
    public EquipmentType EquipmentType { get; set; } = null!;
}
