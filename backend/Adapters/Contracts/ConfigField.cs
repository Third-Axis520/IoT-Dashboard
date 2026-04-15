namespace IoT.CentralApi.Adapters.Contracts;

/// <summary>
/// 一個 config 欄位的描述。前端用這個動態渲染 wizard Step 2 的表單。
/// </summary>
public record ConfigField(
    string Name,
    string Type,
    string Label,
    bool Required = false,
    string? DefaultValue = null,
    string? Placeholder = null,
    string[]? Options = null,
    double? Min = null,
    double? Max = null,
    string? HelpText = null);
