// ─────────────────────────────────────────────────────────────────────────────
// ModbusTcpAdapterHelpers — 純靜態輔助函式（從 ModbusTcpAdapter 拆出）
// ─────────────────────────────────────────────────────────────────────────────

using FluentModbus;
using IoT.CentralApi.Adapters.Contracts;

namespace IoT.CentralApi.Adapters;

internal static class ModbusTcpAdapterHelpers
{
    // ── FC03 Holding Registers implementation ─────────────────────────────────

    internal static Result<Dictionary<string, double>> ReadHoldingRegistersImpl(
        ModbusTcpClient client, ModbusTcpConfig config)
    {
        var offset = config.StartAddress >= 40001
            ? config.StartAddress - 40001
            : config.StartAddress;

        var dataType = config.DataType.ToLower();
        var registersPerValue = (dataType == "uint32" || dataType == "int32" || dataType == "float32")
            ? 2 : 1;
        var registerCount = config.Count * registersPerValue;

        var raw = client.ReadHoldingRegisters<short>(
            (byte)config.UnitId, offset, registerCount);

        var values = new Dictionary<string, double>();

        for (int i = 0; i < config.Count; i++)
        {
            var rawAddress = (offset + i * registersPerValue).ToString();

            // Apply byte swap to each 16-bit register before combining
            var r0 = config.ByteSwap ? SwapBytes16(raw[i * registersPerValue])
                                     : (ushort)raw[i * registersPerValue];
            var r1 = registersPerValue > 1
                ? (config.ByteSwap ? SwapBytes16(raw[i * registersPerValue + 1])
                                   : (ushort)raw[i * registersPerValue + 1])
                : (ushort)0;

            double value = dataType switch
            {
                "uint16"  => r0,
                "int16"   => (short)r0,
                "uint32"  => (uint)((r0 << 16) | r1),
                "int32"   => (int)((r0 << 16) | r1),
                "float32" => BitConverter.Int32BitsToSingle((int)((r0 << 16) | r1)),
                _ => throw new FormatException($"Unknown dataType: {dataType}")
            };

            values[rawAddress] = Math.Round(value * config.Scale, ScaleDecimals(config.Scale));
        }

        return Result<Dictionary<string, double>>.Ok(values);
    }

    // ── FC02 Discrete Inputs implementation ───────────────────────────────────

    internal static Result<Dictionary<string, double>> ReadDiscreteInputsImpl(
        ModbusTcpClient client, ModbusTcpConfig config)
    {
        var offset = config.StartAddress >= 10001
            ? config.StartAddress - 10001
            : config.StartAddress;

        // ReadDiscreteInputs returns Span<byte> — must call ToArray() before leaving this scope
        var raw = client.ReadDiscreteInputs(config.UnitId, offset, config.Count).ToArray();
        var bits = ExpandBits(raw, config.Count);

        var values = new Dictionary<string, double>();
        for (int i = 0; i < config.Count; i++)
            values[(offset + i).ToString()] = bits[i] ? 1.0 : 0.0;

        return Result<Dictionary<string, double>>.Ok(values);
    }

    // ── Bit expansion helper (FC02) ────────────────────────────────────────────

    /// <summary>
    /// Expands packed bit bytes (little-endian bit order, as returned by FC02) into
    /// a bool array. Bit 0 of byte 0 = index 0; bit 1 of byte 0 = index 1; etc.
    /// </summary>
    internal static bool[] ExpandBits(byte[] bytes, int count)
    {
        var result = new bool[count];
        for (int i = 0; i < count; i++)
            result[i] = (bytes[i / 8] & (1 << (i % 8))) != 0;
        return result;
    }

    // ── Exception classification helper ───────────────────────────────────────

    internal static bool IsTransientException(Exception ex)
    {
        // Unwrap AggregateException to check inner exceptions
        if (ex is AggregateException agg)
            return agg.InnerExceptions.Any(IsTransientException);

        // Check inner exception chain
        if (ex.InnerException != null && IsTransientException(ex.InnerException))
            return true;

        // SocketException is always transient
        if (ex is System.Net.Sockets.SocketException)
            return true;

        // FluentModbus wraps connection errors — detect by message keywords
        var msg = ex.Message;
        return msg.Contains("connect", StringComparison.OrdinalIgnoreCase)
            || msg.Contains("connection", StringComparison.OrdinalIgnoreCase)
            || msg.Contains("TCP", StringComparison.OrdinalIgnoreCase)
            || msg.Contains("timeout", StringComparison.OrdinalIgnoreCase)
            || msg.Contains("拒絕連線", StringComparison.OrdinalIgnoreCase)   // zh-TW: connection refused
            || msg.Contains("無法連線", StringComparison.OrdinalIgnoreCase);  // zh-TW: unable to connect
    }

    // ── Byte-swap helper ───────────────────────────────────────────────────────

    internal static ushort SwapBytes16(short raw)
    {
        var u = (ushort)raw;
        return (ushort)((u << 8) | (u >> 8));
    }

    // ── Scale decimals helper ──────────────────────────────────────────────────

    /// <summary>
    /// 根據縮放係數推算應保留的小數位數，消除 IEEE 754 浮點殘差。
    /// scale=0.1 → 1位, scale=0.01 → 2位, scale=1 → 0位
    /// </summary>
    internal static int ScaleDecimals(double scale)
    {
        if (scale == 0 || scale >= 1) return 0;
        return Math.Max(0, (int)Math.Ceiling(-Math.Log10(Math.Abs(scale))));
    }
}
