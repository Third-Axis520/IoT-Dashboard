// ─────────────────────────────────────────────────────────────────────────────
// ModbusTcpAdapter — Modbus TCP 協議適配器
// ─────────────────────────────────────────────────────────────────────────────
// 使用 FluentModbus 讀取 Holding Registers (FC03) 或 Discrete Inputs (FC02)
// FC03 支援 uint16 / int16 / uint32 / int32 / float32 資料型別
// FC02 固定回傳 0.0 / 1.0（光電開關、限位、到位訊號）
// ─────────────────────────────────────────────────────────────────────────────

using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using FluentModbus;
using IoT.CentralApi.Adapters.Contracts;
using static IoT.CentralApi.Adapters.ModbusTcpAdapterHelpers;

namespace IoT.CentralApi.Adapters;

public class ModbusTcpAdapter : IProtocolAdapter
{
    private static readonly string[] ValidDataTypes =
        ["uint16", "int16", "uint32", "int32", "float32"];

    public string ProtocolId => "modbus_tcp";
    public string DisplayName => "Modbus TCP";
    public bool SupportsDiscovery => true;
    public bool SupportsLivePolling => true;

    public ConfigSchema GetConfigSchema() => new()
    {
        Fields =
        {
            new ConfigField(
                Name: "host",
                Type: "string",
                Label: "主機位址 (IP / hostname)",
                Required: true,
                Placeholder: "192.168.1.100"),
            new ConfigField(
                Name: "port",
                Type: "number",
                Label: "Port",
                Required: false,
                DefaultValue: "502",
                Min: 1,
                Max: 65535),
            new ConfigField(
                Name: "unitId",
                Type: "number",
                Label: "Unit ID (Slave ID)",
                Required: false,
                DefaultValue: "1",
                Min: 0,
                Max: 255),
            new ConfigField(
                Name: "startAddress",
                Type: "number",
                Label: "起始位址 (40001-based or 0-based offset)",
                Required: false,
                DefaultValue: "40001",
                Min: 0),
            new ConfigField(
                Name: "count",
                Type: "number",
                Label: "讀取暫存器數量",
                Required: false,
                DefaultValue: "20",
                Min: 1,
                Max: 125),
            new ConfigField(
                Name: "dataType",
                Type: "enum",
                Label: "資料型別",
                Required: false,
                DefaultValue: "uint16",
                Options: ValidDataTypes,
                HelpText: "每個暫存器的數值解讀方式。\n• uint16：無符號 16-bit（0 ~ 65535）\n• int16：有符號 16-bit（-32768 ~ 32767），溫度類 PLC 常用\n• uint32 / int32：需佔用 2 個連續暫存器\n• float32：IEEE 754 浮點數，需佔用 2 個暫存器\n\n範例：溫度感測器原始值 481 → int16 解讀為 481"),
            new ConfigField(
                Name: "byteSwap",
                Type: "boolean",
                Label: "Byte Swap（高低位元組交換）",
                Required: false,
                DefaultValue: "false",
                HelpText: "部分 PLC 傳送資料時，同一個 16-bit 暫存器的高位元組與低位元組順序與標準相反，需要交換才能得到正確數值。\n\n範例：PLC 傳來 0xE101（十進位 -7935）\n→ 開啟 Byte Swap 後交換 → 0x01E1（十進位 481）\n→ 再乘以縮放係數 0.1 → 48.1 °C"),
            new ConfigField(
                Name: "scale",
                Type: "number",
                Label: "縮放係數（乘數，例如 0.1）",
                Required: false,
                DefaultValue: "1",
                Min: -1000000,
                Max: 1000000,
                HelpText: "讀到的原始整數值乘以此係數後才是實際工程單位數值。PLC 通常以整數傳輸以節省頻寬，再由應用端換算。\n\n範例：\n• 原始值 481 × 0.1 = 48.1 °C\n• 原始值 1013 × 0.1 = 101.3 kPa\n• 不需縮放時填 1（預設）"),
            new ConfigField(
                Name: "function",
                Type: "enum",
                Label: "Modbus 功能碼",
                Required: false,
                DefaultValue: "holding",
                Options: ["holding", "discrete"],
                HelpText: "讀取的暫存器類型。\n• holding：FC03 Holding Register（溫度等類比值）\n• discrete：FC02 Discrete Input（光電開關、限位、到位訊號）\n\n選 discrete 時 dataType / scale / byteSwap 會被忽略，回值固定 0.0 或 1.0。")
        }
    };

    public ValidationResult ValidateConfig(string configJson)
    {
        try
        {
            var config = JsonSerializer.Deserialize<ModbusTcpConfig>(configJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (config == null)
                return ValidationResult.Invalid("Config 不能為空");

            if (string.IsNullOrWhiteSpace(config.Host))
                return ValidationResult.Invalid("host 不能為空");

            if (config.Port < 1 || config.Port > 65535)
                return ValidationResult.Invalid($"port 必須介於 1-65535，目前值: {config.Port}");

            if (config.UnitId < 0 || config.UnitId > 255)
                return ValidationResult.Invalid($"unitId 必須介於 0-255，目前值: {config.UnitId}");

            if (config.Function != "holding" && config.Function != "discrete")
                return ValidationResult.Invalid($"function 必須是 'holding' 或 'discrete'，目前: {config.Function}");

            if (config.Function == "discrete")
            {
                if (config.Count < 1 || config.Count > 2000)
                    return ValidationResult.Invalid($"Discrete Input 一次最多讀 2000 個 bit，目前值: {config.Count}");
            }
            else
            {
                if (config.Count < 1 || config.Count > 125)
                    return ValidationResult.Invalid($"count 必須介於 1-125，目前值: {config.Count}");

                if (!ValidDataTypes.Contains(config.DataType?.ToLower()))
                    return ValidationResult.Invalid(
                        $"dataType 無效: '{config.DataType}'。有效值: {string.Join(", ", ValidDataTypes)}");

                if (config.Scale == 0)
                    return ValidationResult.Invalid("scale 不能為 0（所有讀值會變成 0）");
            }

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

        var values = readResult.Value!;
        var points = values.Select(kvp => new DiscoveredPoint(
            RawAddress: kvp.Key,
            CurrentValue: kvp.Value,
            DataType: config!.DataType,
            SuggestedLabel: $"Register {kvp.Key}"
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
        ModbusTcpConfig config, CancellationToken ct)
    {
        return await Task.Run(() =>
        {
            var client = new ModbusTcpClient();
            try
            {
                client.ConnectTimeout = 5000;
                client.ReadTimeout = 5000;
                client.WriteTimeout = 5000;

                var ip = IPAddress.Parse(config.Host);
                client.Connect(new IPEndPoint(ip, config.Port));

                return config.Function == "discrete"
                    ? ReadDiscreteInputsImpl(client, config)
                    : ReadHoldingRegistersImpl(client, config);
            }
            catch (SocketException ex)
            {
                return Result<Dictionary<string, double>>.Fail(
                    ErrorKind.Transient, $"Socket 連線失敗: {ex.Message}");
            }
            catch (TimeoutException ex)
            {
                return Result<Dictionary<string, double>>.Fail(
                    ErrorKind.Transient, $"連線逾時: {ex.Message}");
            }
            catch (ModbusException ex)
            {
                return Result<Dictionary<string, double>>.Fail(
                    ErrorKind.DeviceError, $"Modbus 裝置錯誤: {ex.Message}");
            }
            catch (FormatException ex)
            {
                return Result<Dictionary<string, double>>.Fail(
                    ErrorKind.InvalidConfig, $"設定格式錯誤: {ex.Message}");
            }
            catch (JsonException ex)
            {
                return Result<Dictionary<string, double>>.Fail(
                    ErrorKind.InvalidConfig, $"JSON 格式錯誤: {ex.Message}");
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // FluentModbus wraps exceptions in AggregateException — check if OCE is hiding inside
                if (ex is AggregateException agg && agg.Flatten().InnerExceptions.Any(e => e is OperationCanceledException))
                    throw;

                // Detect transient vs bug by message content.
                var isTransient = IsTransientException(ex);
                return Result<Dictionary<string, double>>.Fail(
                    isTransient ? ErrorKind.Transient : ErrorKind.Bug,
                    $"未預期的錯誤: {ex.GetType().Name}: {ex.Message}");
            }
            finally
            {
                try { client.Disconnect(); } catch { }
            }
        }, ct);
    }

    // ── Config parsing helper ──────────────────────────────────────────────────

    private static bool TryParseConfig(
        string configJson,
        out ModbusTcpConfig? config,
        out string? error)
    {
        try
        {
            config = JsonSerializer.Deserialize<ModbusTcpConfig>(configJson,
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
