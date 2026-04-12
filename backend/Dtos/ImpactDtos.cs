namespace IoT.CentralApi.Dtos;

public record ImpactResult(
    bool RequiresConfirmation,
    ImpactDetail? Impact);

public record ImpactDetail(
    string Severity,
    string Title,
    string Message,
    List<string> Affected);
