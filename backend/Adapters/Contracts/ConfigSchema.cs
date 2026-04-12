namespace IoT.CentralApi.Adapters.Contracts;

public record ConfigSchema
{
    public List<ConfigField> Fields { get; init; } = new();
}
