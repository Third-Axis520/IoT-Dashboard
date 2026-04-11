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
// DO NOT modify the IProtocolAdapter interface. If you need new methods,
// discuss with the team first — changes affect ALL adapters.
//
// This file will be re-enabled in Task 9 once IProtocolAdapter contracts exist.
// ─────────────────────────────────────────────────────────────────────────────

namespace IoT.CentralApi.Adapters;

// Placeholder until Task 9 creates IProtocolAdapter and supporting types.
// See backend/Adapters/README.md for the contract this template implements.
internal static class _TemplatePlaceholder
{
    // Will be replaced with TemplateAdapter class implementing IProtocolAdapter in Task 9.
}
