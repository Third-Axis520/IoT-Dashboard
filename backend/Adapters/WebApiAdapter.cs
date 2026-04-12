// ─────────────────────────────────────────────────────────────────────────────
// WebApiAdapter — HTTP REST API 協議適配器
// ─────────────────────────────────────────────────────────────────────────────
// 透過 HTTP GET / POST 讀取 JSON 端點，並用 dot-notation JSONPath 定位資料陣列。
// 支援 JArray 格式（[{name, value}...]）與 JObject 格式（{key: doubleValue}）。
// ─────────────────────────────────────────────────────────────────────────────

using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using IoT.CentralApi.Adapters.Contracts;

namespace IoT.CentralApi.Adapters;

public class WebApiAdapter : IProtocolAdapter
{
    private readonly IHttpClientFactory _httpFactory;

    public string ProtocolId => "web_api";
    public string DisplayName => "HTTP REST API";
    public bool SupportsDiscovery => true;
    public bool SupportsLivePolling => true;

    public WebApiAdapter(IHttpClientFactory httpFactory)
    {
        _httpFactory = httpFactory;
    }

    public ConfigSchema GetConfigSchema() => new()
    {
        Fields =
        {
            new ConfigField(
                Name: "url",
                Type: "string",
                Label: "端點 URL",
                Required: true,
                Placeholder: "https://api.example.com/sensors"),
            new ConfigField(
                Name: "method",
                Type: "enum",
                Label: "HTTP 方法",
                Required: false,
                DefaultValue: "GET",
                Options: ["GET", "POST"]),
            new ConfigField(
                Name: "jsonPathRoot",
                Type: "string",
                Label: "JSON 路徑 (dot-notation, e.g. $.data.sensors)",
                Required: true,
                DefaultValue: "$",
                Placeholder: "$.data.sensors"),
            new ConfigField(
                Name: "keyField",
                Type: "string",
                Label: "鍵名欄位（陣列模式）",
                Required: false,
                DefaultValue: "name",
                Placeholder: "name"),
            new ConfigField(
                Name: "valueField",
                Type: "string",
                Label: "數值欄位（陣列模式）",
                Required: false,
                DefaultValue: "value",
                Placeholder: "value")
        }
    };

    public ValidationResult ValidateConfig(string configJson)
    {
        try
        {
            var config = JsonSerializer.Deserialize<WebApiConfig>(configJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (config == null || string.IsNullOrWhiteSpace(config.Url))
                return ValidationResult.Invalid("url 不能為空");

            if (!Uri.TryCreate(config.Url, UriKind.Absolute, out var uri)
                || (uri.Scheme != "http" && uri.Scheme != "https"))
                return ValidationResult.Invalid($"url 格式無效: '{config.Url}'");

            var method = (config.Method ?? "GET").ToUpperInvariant();
            if (method != "GET" && method != "POST")
                return ValidationResult.Invalid($"method 必須為 GET 或 POST，目前值: '{config.Method}'");

            return ValidationResult.Valid();
        }
        catch (JsonException ex)
        {
            return ValidationResult.Invalid($"Config JSON 格式錯誤: {ex.Message}");
        }
    }

    public async Task<Result<DiscoveryResult>> DiscoverAsync(string configJson, CancellationToken ct)
    {
        if (!TryParseConfig(configJson, out var config, out var parseError))
            return Result<DiscoveryResult>.Fail(ErrorKind.InvalidConfig, parseError!);

        var readResult = await ReadAsync(config!, ct);
        if (!readResult.IsSuccess)
            return Result<DiscoveryResult>.Fail(readResult.ErrorKind, readResult.ErrorMessage!);

        var points = readResult.Value!.Select(kvp => new DiscoveredPoint(
            RawAddress: kvp.Key,
            CurrentValue: kvp.Value,
            DataType: "double",
            SuggestedLabel: kvp.Key
        )).ToList();

        return Result<DiscoveryResult>.Ok(new DiscoveryResult(points));
    }

    public async Task<Result<PollResult>> PollAsync(string configJson, CancellationToken ct)
    {
        if (!TryParseConfig(configJson, out var config, out var parseError))
            return Result<PollResult>.Fail(ErrorKind.InvalidConfig, parseError!);

        var readResult = await ReadAsync(config!, ct);
        if (!readResult.IsSuccess)
            return Result<PollResult>.Fail(readResult.ErrorKind, readResult.ErrorMessage!);

        return Result<PollResult>.Ok(new PollResult(readResult.Value!, DateTime.UtcNow));
    }

    // ── Shared read logic ──────────────────────────────────────────────────────

    private async Task<Result<Dictionary<string, double>>> ReadAsync(
        WebApiConfig config, CancellationToken ct)
    {
        try
        {
            var client = _httpFactory.CreateClient("WebApiAdapter");
            client.Timeout = TimeSpan.FromSeconds(10);

            var method = (config.Method ?? "GET").ToUpperInvariant() == "POST"
                ? HttpMethod.Post
                : HttpMethod.Get;

            var request = new HttpRequestMessage(method, config.Url);

            if (config.Headers != null)
            {
                foreach (var (key, val) in config.Headers)
                    request.Headers.TryAddWithoutValidation(key, val);
            }

            HttpResponseMessage response;
            try
            {
                response = await client.SendAsync(request, ct);
            }
            catch (HttpRequestException ex)
            {
                return Result<Dictionary<string, double>>.Fail(
                    ErrorKind.Transient, $"HTTP 連線失敗: {ex.Message}");
            }
            catch (TaskCanceledException) when (!ct.IsCancellationRequested)
            {
                return Result<Dictionary<string, double>>.Fail(
                    ErrorKind.Transient, "HTTP 請求逾時 (10s)");
            }

            if (response.StatusCode == HttpStatusCode.Unauthorized)
                return Result<Dictionary<string, double>>.Fail(
                    ErrorKind.Unauthorized, "HTTP 401 Unauthorized — 請確認 headers 驗證設定");

            if (!response.IsSuccessStatusCode)
                return Result<Dictionary<string, double>>.Fail(
                    ErrorKind.DeviceError,
                    $"HTTP {(int)response.StatusCode} {response.ReasonPhrase}");

            var body = await response.Content.ReadAsStringAsync(ct);

            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                var target = NavigatePath(root, config.JsonPathRoot ?? "$");
                if (target == null)
                    return Result<Dictionary<string, double>>.Fail(
                        ErrorKind.DeviceError,
                        $"JSON 路徑 '{config.JsonPathRoot}' 找不到對應資料");

                var values = new Dictionary<string, double>();
                var keyField = config.KeyField ?? "name";
                var valueField = config.ValueField ?? "value";

                switch (target.Value.ValueKind)
                {
                    case JsonValueKind.Array:
                        foreach (var item in target.Value.EnumerateArray())
                        {
                            if (item.TryGetProperty(keyField, out var keyEl)
                                && item.TryGetProperty(valueField, out var valEl)
                                && valEl.TryGetDouble(out var dval))
                            {
                                values[keyEl.GetString() ?? keyEl.ToString()] = dval;
                            }
                        }
                        break;

                    case JsonValueKind.Object:
                        foreach (var prop in target.Value.EnumerateObject())
                        {
                            if (prop.Value.TryGetDouble(out var dval))
                                values[prop.Name] = dval;
                        }
                        break;

                    default:
                        return Result<Dictionary<string, double>>.Fail(
                            ErrorKind.DeviceError,
                            $"JSON 路徑 '{config.JsonPathRoot}' 指向的不是陣列或物件");
                }

                if (values.Count == 0)
                    return Result<Dictionary<string, double>>.Fail(
                        ErrorKind.DeviceError,
                        $"JSON 路徑 '{config.JsonPathRoot}' 找不到任何可解析的數值資料點");

                return Result<Dictionary<string, double>>.Ok(values);
            }
            catch (JsonException ex)
            {
                return Result<Dictionary<string, double>>.Fail(
                    ErrorKind.DeviceError, $"回應 JSON 格式錯誤: {ex.Message}");
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Result<Dictionary<string, double>>.Fail(
                ErrorKind.Bug, $"未預期的錯誤: {ex.GetType().Name}: {ex.Message}");
        }
    }

    // ── Simple dot-notation JSON path navigator ────────────────────────────────
    // Supports: "$", "$.foo", "$.foo.bar.baz"
    // Does NOT support: wildcards, filters, array index

    private static JsonElement? NavigatePath(JsonElement root, string path)
    {
        var current = root;
        var trimmed = path.TrimStart('$').TrimStart('.');

        if (string.IsNullOrEmpty(trimmed))
            return current;

        var segments = trimmed.Split('.', StringSplitOptions.RemoveEmptyEntries);
        foreach (var seg in segments)
        {
            if (current.ValueKind != JsonValueKind.Object
                || !current.TryGetProperty(seg, out var next))
                return null;
            current = next;
        }

        return current;
    }

    // ── Config parsing helper ──────────────────────────────────────────────────

    private static bool TryParseConfig(
        string configJson,
        out WebApiConfig? config,
        out string? error)
    {
        try
        {
            config = JsonSerializer.Deserialize<WebApiConfig>(configJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (config == null)
            {
                error = "Config 不能為空";
                return false;
            }

            error = null;
            return true;
        }
        catch (JsonException ex)
        {
            config = null;
            error = $"Config JSON 格式錯誤: {ex.Message}";
            return false;
        }
    }
}
