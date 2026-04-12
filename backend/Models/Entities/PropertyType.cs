// ─────────────────────────────────────────────────────────────────────────────
// PropertyType — 屬性類型 (溫度/壓力/在位...)
// ─────────────────────────────────────────────────────────────────────────────
// 用途:
//   取代 EquipmentTypeSensor 中硬編碼的 Role 欄位。
//   每個 sensor 都會關聯一個 PropertyType，描述該 sensor 的「語意類別」。
//
// Behavior 欄位的特殊作用:
//   - "normal"          — 一般數值，走 UCL/LCL 告警
//   - "material_detect" — 在位判斷，值=0 時 DataIngestionService 跳過所有告警
//   - "asset_code"      — 資產編號 (v2 會用 register 值當 assetCode)
//   - "state"           — 狀態碼
//   - "counter"         — 計數器，不做 UCL/LCL 比對
//
// 內建屬性 (IsBuiltIn=true) 不可刪除，Key/Behavior 不可改。
// ─────────────────────────────────────────────────────────────────────────────

using System.ComponentModel.DataAnnotations;

namespace IoT.CentralApi.Models;

public class PropertyType
{
    public int Id { get; set; }

    [Required, MaxLength(50)]
    public string Key { get; set; } = "";

    [Required, MaxLength(100)]
    public string Name { get; set; } = "";

    [Required, MaxLength(50)]
    public string Icon { get; set; } = "";

    [MaxLength(20)]
    public string DefaultUnit { get; set; } = "";

    public double? DefaultUcl { get; set; }
    public double? DefaultLcl { get; set; }

    [Required, MaxLength(20)]
    public string Behavior { get; set; } = "normal";

    public bool IsBuiltIn { get; set; }

    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }
}
