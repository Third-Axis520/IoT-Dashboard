using System.ComponentModel.DataAnnotations;

namespace IoT.CentralApi.Dtos;

public record PropertyTypeDto(
    int Id,
    string Key,
    string Name,
    string Icon,
    string DefaultUnit,
    double? DefaultUcl,
    double? DefaultLcl,
    string Behavior,
    bool IsBuiltIn,
    int SortOrder,
    DateTime CreatedAt);

public record SavePropertyTypeRequest(
    [Required, MaxLength(50)] string Key,
    [Required, MaxLength(100)] string Name,
    [Required, MaxLength(50)] string Icon,
    [MaxLength(20)] string DefaultUnit = "",
    double? DefaultUcl = null,
    double? DefaultLcl = null,
    [Required, MaxLength(20)] string Behavior = "normal",
    int SortOrder = 0);

public record UpdatePropertyTypeRequest(
    [Required, MaxLength(100)] string Name,
    [Required, MaxLength(50)] string Icon,
    [MaxLength(20)] string DefaultUnit = "",
    double? DefaultUcl = null,
    double? DefaultLcl = null,
    int SortOrder = 0);
