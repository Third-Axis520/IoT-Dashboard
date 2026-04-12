// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE: Protocol Adapter
// ─────────────────────────────────────────────────────────────────────────────
// To create a new adapter:
//   1. Copy this file to `<YourProtocol>Adapter.cs`
//   2. Rename class `TemplateAdapter` → `<YourProtocol>Adapter`
//   3. Implement DiscoverAsync, PollAsync, ValidateConfig
//   4. Define your config schema in GetConfigSchema()
//   5. Register in Program.cs:
//        builder.Services.AddSingleton<IProtocolAdapter, YourProtocolAdapter>();
//   6. Write tests in backend/Tests/Adapters/YourProtocolAdapterTests.cs
//
// DO NOT modify the IProtocolAdapter interface without updating ALL adapters.
// ─────────────────────────────────────────────────────────────────────────────

using IoT.CentralApi.Adapters.Contracts;

namespace IoT.CentralApi.Adapters;

[Obsolete("Template only — copy this file to create a new adapter")]
public class TemplateAdapter : IProtocolAdapter
{
    public string ProtocolId => "template";
    public string DisplayName => "Template Protocol";
    public bool SupportsDiscovery => true;
    public bool SupportsLivePolling => true;

    public ConfigSchema GetConfigSchema() => new()
    {
        Fields =
        {
            new ConfigField("host", "string", "主機位址",
                Required: true, Placeholder: "192.168.1.1"),
            new ConfigField("port", "number", "Port",
                Required: true, DefaultValue: "8080"),
        }
    };

    public ValidationResult ValidateConfig(string configJson)
    {
        return ValidationResult.Invalid("Template adapter not implemented");
    }

    public Task<Result<DiscoveryResult>> DiscoverAsync(string configJson, CancellationToken ct)
    {
        return Task.FromResult(Result<DiscoveryResult>.Fail(
            ErrorKind.UnknownProtocol, "Template adapter not implemented"));
    }

    public Task<Result<PollResult>> PollAsync(string configJson, CancellationToken ct)
    {
        return Task.FromResult(Result<PollResult>.Fail(
            ErrorKind.UnknownProtocol, "Template adapter not implemented"));
    }
}
