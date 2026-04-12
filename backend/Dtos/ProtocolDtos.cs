namespace IoT.CentralApi.Dtos;

public record ProtocolDto(
    string Id,
    string DisplayName,
    bool SupportsDiscovery,
    bool SupportsLivePolling,
    ConfigSchemaDto ConfigSchema);

public record ConfigSchemaDto(List<ConfigFieldDto> Fields);

public record ConfigFieldDto(
    string Name,
    string Type,
    string Label,
    bool Required,
    string? DefaultValue,
    string? Placeholder,
    string[]? Options,
    double? Min,
    double? Max);
