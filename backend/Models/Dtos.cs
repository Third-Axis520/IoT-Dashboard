namespace IoT.CentralApi.Models;

// ── Ingest（OvenDataReceive → Central API）─────────────────────────────────

public class IngestPayload
{
    public string SerialNumber { get; set; } = "";
    public long Timestamp { get; set; }
    public bool IsConnected { get; set; }
    public List<SensorReading_Dto> Sensors { get; set; } = [];
}

public class SensorReading_Dto
{
    public int Id { get; set; }
    public double Value { get; set; }
    public string? Error { get; set; }
}

// ── SSE 推送（Central API → Dashboard）────────────────────────────────────

public class SseDataUpdate
{
    public string AssetCode { get; set; } = "";
    public string? AssetName { get; set; }
    public long Timestamp { get; set; }
    public bool IsConnected { get; set; }
    /// <summary>40013 鞋子在位：true = 有料，false = 無料，null = 設備無此感測器</summary>
    public bool? HasMaterial { get; set; }
    public List<SseSensorItem> Sensors { get; set; } = [];
}

public class SseSensorItem
{
    public int Id { get; set; }
    public double Value { get; set; }
    public double Ucl { get; set; }
    public double Lcl { get; set; }
    public string? Error { get; set; }
}

// ── Limits API ──────────────────────────────────────────────────────────────

public class SensorLimitDto : System.ComponentModel.DataAnnotations.IValidatableObject
{
    public int SensorId { get; set; }
    public string? SensorName { get; set; }

    [System.ComponentModel.DataAnnotations.Range(0, 9999, ErrorMessage = "UCL 必須在 0~9999 之間")]
    public double UCL { get; set; }

    [System.ComponentModel.DataAnnotations.Range(0, 9999, ErrorMessage = "LCL 必須在 0~9999 之間")]
    public double LCL { get; set; }

    [System.ComponentModel.DataAnnotations.MaxLength(10)]
    public string Unit { get; set; } = "℃";

    public IEnumerable<System.ComponentModel.DataAnnotations.ValidationResult> Validate(
        System.ComponentModel.DataAnnotations.ValidationContext validationContext)
    {
        if (UCL < LCL)
            yield return new System.ComponentModel.DataAnnotations.ValidationResult(
                "UCL 必須大於或等於 LCL",
                [nameof(UCL), nameof(LCL)]);
    }
}

public class UpdateLimitsRequest
{
    public List<SensorLimitDto> Limits { get; set; } = [];
}

// ── History API ─────────────────────────────────────────────────────────────

public class HistoryPoint
{
    public long Time { get; set; }
    public double Value { get; set; }
}

// ── Alerts API ──────────────────────────────────────────────────────────────

public class AlertDto
{
    public long Id { get; set; }
    public string AssetCode { get; set; } = "";
    public int SensorId { get; set; }
    public string? SensorName { get; set; }
    public double Value { get; set; }
    public double LimitValue { get; set; }
    public string AlertType { get; set; } = "";
    public string Severity { get; set; } = "";
    public long Timestamp { get; set; }
    public bool IsAcknowledged { get; set; }
}

// ── Asset API ────────────────────────────────────────────────────────────────

public class AssetInfoDto
{
    public string AssetCode { get; set; } = "";
    public string? AssetName { get; set; }
    public string? NickName { get; set; }
    public string? DepartmentName { get; set; }
    public string? SupplierName { get; set; }
    public string? Spec { get; set; }
}

// ── Devices API ──────────────────────────────────────────────────────────────

public class DeviceDto
{
    public int Id { get; set; }
    public string SerialNumber { get; set; } = "";
    public string? IpAddress { get; set; }
    public string? AssetCode { get; set; }
    public string? FriendlyName { get; set; }
    public string? AssetName { get; set; }
    public string? DepartmentName { get; set; }
    public DateTime FirstSeen { get; set; }
    public DateTime LastSeen { get; set; }
    public bool IsBound => AssetCode != null;
}

public class BindDeviceRequest
{
    public string AssetCode { get; set; } = "";
    public string? FriendlyName { get; set; }
}

public class RegisterDeviceRequest
{
    public string SerialNumber { get; set; } = "";
    public string? FriendlyName { get; set; }
}

// ── Register Map API ─────────────────────────────────────────────────────────

public class RegisterMapEntryDto
{
    public int Id { get; set; }
    public int ZoneIndex { get; set; }
    public int RegisterAddress { get; set; }
    public string EquipmentId { get; set; } = "";
    public string PointId { get; set; } = "";
    public string Label { get; set; } = "";
    public string Unit { get; set; } = "℃";
}

public class RegisterMapProfileDto
{
    public int Id { get; set; }
    public string LineId { get; set; } = "";
    public string ProfileName { get; set; } = "";
    public DateTime UpdatedAt { get; set; }
    public int? PlcTemplateId { get; set; }
    public PlcTemplateDetailDto? PlcTemplate { get; set; }
    public List<RegisterMapEntryDto> Entries { get; set; } = [];
}

public class SaveRegisterMapRequest
{
    public string ProfileName { get; set; } = "";
    public int? PlcTemplateId { get; set; }
    public List<RegisterMapEntryDto> Entries { get; set; } = [];
}

// ── PLC Template API ─────────────────────────────────────────────────────────

public class PlcTemplateSummaryDto
{
    public int Id { get; set; }
    public string ModelName { get; set; } = "";
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; }
    public int ZoneCount { get; set; }
    public int RegisterCount { get; set; }
}

public class PlcTemplateDetailDto
{
    public int Id { get; set; }
    public string ModelName { get; set; } = "";
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<PlcZoneDefinitionDto> Zones { get; set; } = [];
    public List<PlcRegisterDefinitionDto> Registers { get; set; } = [];

    public static PlcTemplateDetailDto From(PlcTemplate t) => new()
    {
        Id = t.Id,
        ModelName = t.ModelName,
        Description = t.Description,
        CreatedAt = t.CreatedAt,
        Zones = t.Zones
            .OrderBy(z => z.ZoneIndex)
            .Select(z => new PlcZoneDefinitionDto
            {
                Id = z.Id,
                ZoneIndex = z.ZoneIndex,
                ZoneName = z.ZoneName,
                AssetCodeRegStart = z.AssetCodeRegStart,
                AssetCodeRegCount = z.AssetCodeRegCount,
            }).ToList(),
        Registers = t.Registers
            .OrderBy(r => r.RegisterAddress)
            .Select(r => new PlcRegisterDefinitionDto
            {
                Id = r.Id,
                RegisterAddress = r.RegisterAddress,
                DefaultLabel = r.DefaultLabel,
                DefaultUnit = r.DefaultUnit,
                DefaultZoneIndex = r.DefaultZoneIndex,
            }).ToList(),
    };
}

public class PlcZoneDefinitionDto
{
    public int Id { get; set; }
    public int ZoneIndex { get; set; }
    public string ZoneName { get; set; } = "";
    public int AssetCodeRegStart { get; set; }
    public int AssetCodeRegCount { get; set; }
}

public class PlcRegisterDefinitionDto
{
    public int Id { get; set; }
    public int RegisterAddress { get; set; }
    public string DefaultLabel { get; set; } = "";
    public string DefaultUnit { get; set; } = "℃";
    public int? DefaultZoneIndex { get; set; }
}

public class SavePlcTemplateRequest
{
    [System.ComponentModel.DataAnnotations.Required]
    [System.ComponentModel.DataAnnotations.MaxLength(100)]
    public string ModelName { get; set; } = "";
    [System.ComponentModel.DataAnnotations.MaxLength(300)]
    public string? Description { get; set; }
    public List<PlcZoneDefinitionDto> Zones { get; set; } = [];
    public List<PlcRegisterDefinitionDto> Registers { get; set; } = [];
}
