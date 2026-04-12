using System.ComponentModel.DataAnnotations;

namespace IoT.CentralApi.Dtos;

public record ScanRequest(
    [Required] string Protocol,
    [Required] string Config);

public record ScanResponse(
    bool Success,
    List<DiscoveredPointDto>? Points,
    string? Error);

public record DiscoveredPointDto(
    string RawAddress,
    double CurrentValue,
    string DataType,
    string? SuggestedLabel);
