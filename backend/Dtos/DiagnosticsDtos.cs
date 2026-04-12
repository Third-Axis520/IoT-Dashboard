namespace IoT.CentralApi.Dtos;

public record PollingDiagnosticsDto(
    PollingStatusDto Polling,
    List<ConnectionHealthDto> Connections);

public record PollingStatusDto(
    bool IsRunning,
    int ActiveConnections,
    DateTime? LastTickAt);

public record ConnectionHealthDto(
    int Id,
    string Name,
    string Protocol,
    string Status,
    int ConsecutiveErrors,
    DateTime? LastPollAt,
    string? LastErrorMessage);
