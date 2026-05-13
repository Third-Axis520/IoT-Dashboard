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
    DateTime CreatedAt,
    int AlertOnConsecutiveErrors = 5,
    int AlertCooldownSec = 300,
    bool IsAlertEnabled = true);

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
    string? AssetCode = null,
    int AlertOnConsecutiveErrors = 5,
    int AlertCooldownSec = 300,
    bool IsAlertEnabled = true);

public record SaveDeviceConnectionRequest(
    [Required, MaxLength(200)] string Name,
    [Required, MaxLength(50)] string Protocol,
    [Required] string Config,
    int? PollIntervalMs,
    bool IsEnabled = true,
    SaveEquipmentTypeRequest? EquipmentType = null,
    int AlertOnConsecutiveErrors = 5,
    int AlertCooldownSec = 300,
    bool IsAlertEnabled = true);

public record UpdateDeviceConnectionRequest(
    [Required, MaxLength(200)] string Name,
    [Required] string Config,
    int? PollIntervalMs,
    bool IsEnabled = true,
    int AlertOnConsecutiveErrors = 5,
    int AlertCooldownSec = 300,
    bool IsAlertEnabled = true);
