using System.ComponentModel.DataAnnotations;
using IoT.CentralApi.Controllers;

namespace IoT.CentralApi.Dtos;

public record DeviceConnectionDto(
    int Id,
    string Name,
    string Protocol,
    string ConfigJson,
    int? PollIntervalMs,
    bool IsEnabled,
    DateTime? LastPollAt,
    string? LastPollError,
    int ConsecutiveErrors,
    int? EquipmentTypeId,
    string? EquipmentTypeName,
    DateTime CreatedAt);

public record DeviceConnectionDetailDto(
    int Id,
    string Name,
    string Protocol,
    string ConfigJson,
    int? PollIntervalMs,
    bool IsEnabled,
    DateTime? LastPollAt,
    string? LastPollError,
    int ConsecutiveErrors,
    int? EquipmentTypeId,
    EquipmentTypeDto? EquipmentType,
    DateTime CreatedAt,
    /// <summary>自動建立的 Device.AssetCode；push_ingest 時為 null</summary>
    string? AssetCode = null);

public record SaveDeviceConnectionRequest(
    [Required, MaxLength(200)] string Name,
    [Required, MaxLength(50)] string Protocol,
    [Required] string Config,
    int? PollIntervalMs,
    bool IsEnabled = true,
    SaveEquipmentTypeRequest? EquipmentType = null);

public record UpdateDeviceConnectionRequest(
    [Required, MaxLength(200)] string Name,
    [Required] string Config,
    int? PollIntervalMs,
    bool IsEnabled = true);
