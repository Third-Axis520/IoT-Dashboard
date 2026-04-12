// ─────────────────────────────────────────────────────────────────────────────
// DeviceConnection — 設備連線設定
// ─────────────────────────────────────────────────────────────────────────────
// 每個 DeviceConnection 代表一個協議連線 (Modbus TCP / WebAPI / Push)，
// 記錄連線參數 (ConfigJson)、輪詢頻率、狀態、以及關聯的 EquipmentType。
//
// Atomic Provision:
//   透過 DeviceConnectionController POST 一次建立:
//     DeviceConnection + EquipmentType + EquipmentTypeSensors
//
// PollingBackgroundService 會掃描所有 IsEnabled 且 Protocol != push_ingest 的連線，
// 依 PollIntervalMs 定期呼叫對應 adapter 的 PollAsync。
// ─────────────────────────────────────────────────────────────────────────────

using System.ComponentModel.DataAnnotations;

namespace IoT.CentralApi.Models;

public class DeviceConnection
{
    public int Id { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = "";

    /// <summary>對應 IProtocolAdapter.ProtocolId (modbus_tcp / web_api / push_ingest)</summary>
    [Required, MaxLength(50)]
    public string Protocol { get; set; } = "";

    /// <summary>協議專屬 JSON 設定 (host/port/url...)</summary>
    public string ConfigJson { get; set; } = "{}";

    /// <summary>輪詢間隔 (毫秒)。Push 類型不需要。</summary>
    public int? PollIntervalMs { get; set; }

    public bool IsEnabled { get; set; } = true;

    public DateTime? LastPollAt { get; set; }

    [MaxLength(500)]
    public string? LastPollError { get; set; }

    public int ConsecutiveErrors { get; set; }

    /// <summary>關聯的 EquipmentType (nullable，刪除設備類型不連帶刪連線)</summary>
    public int? EquipmentTypeId { get; set; }
    public EquipmentType? EquipmentType { get; set; }

    public DateTime CreatedAt { get; set; }
}
