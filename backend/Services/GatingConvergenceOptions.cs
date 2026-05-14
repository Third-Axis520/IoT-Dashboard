namespace IoT.CentralApi.Services;

public class GatingConvergenceOptions
{
    public const string SectionName = "Gating";

    // When true, sensors gated by a SensorGatingRule produce no SensorReading
    // row at all (matches the "don't write" semantics the new gating UX
    // promises). When false (default) the legacy material_detect path still
    // writes readings with HasMaterial=false so the existing dashboard
    // behaviour holds. Flip in Phase B after frontend stops depending on
    // HasMaterial=false readings being present in SSE.
    public bool StrictMode { get; set; } = false;
}
