# IoT Dashboard ↔ IoTReceiverAPI 整合 + UI 自助化清除 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 IoTReceiverAPI 寫進共用 DB 的兩張寬表（PressingMachineRealTimeData / VisualMarkingMachineRealTimeData）接到 IoT-Dashboard 儀錶板上，同時清除過度自助化的 UI（wizard、gating、PLC template、register map）。

**Architecture:** 新增 `IoTReceiverDbAdapter` 實作 `IProtocolAdapter`，透過 `IIoTReceiverDataSource` 抽象讀共用 DB（白名單 raw SQL，避免引入跨 service entity）。寬表單筆 row 在 PollAsync 內展開為 `Dictionary<string, double>`，後續走既有 PollingBackgroundService → SensorReadings → SSE → Tile 流程。前端新增兩個 visualization 元件 + EquipmentCard switch 增加兩個 case。砍 UI 用「刪檔 + 簡化主流程」分階段執行，最後一個 PR 才做 EF migration drop 9 張表。

**Tech Stack:** .NET 9 / EF Core 9 / xUnit + FluentAssertions / React 19 / Vite 6 / Vitest + RTL

**Spec:** `docs/superpowers/specs/2026-05-26-iot-receiver-integration-design.md` (commit c849061)

**5 個 Phase = 5 個 PR**：每完成一個 phase 都要可獨立部署、可獨立回退。

---

## File Structure

### 新增（Phase 0 + Phase 1）

| 路徑 | 責任 |
|------|------|
| `backend/Adapters/IoTReceiverDbAdapter.cs` | 實作 IProtocolAdapter，編排 config 驗證 + 委派 data source 讀 row |
| `backend/Adapters/IoTReceiverDbConfig.cs` | record 型別 ConfigJson 結構 |
| `backend/Services/IIoTReceiverDataSource.cs` | 抽象介面，便於測試替身 |
| `backend/Services/SqlIoTReceiverDataSource.cs` | 預設實作：raw SQL + 白名單欄位 |
| `backend/Tests/Adapters/IoTReceiverDbAdapterTests.cs` | 單元測試（stub data source）|
| `backend/Tools/DeviceSeeder.cs` | CLI 入口：seed-pressing-machine / seed-marking-machine |
| `frontend/src/components/visualizations/PressingMachineLr.tsx` | 壓合機 13-metric 左右對稱 tile |
| `frontend/src/components/visualizations/VisualMarkingMachine.tsx` | 劃線機單 metric tile |

### 修改（橫跨 Phase 0-3）

| 路徑 | 改什麼 |
|------|--------|
| `backend/Program.cs` | 註冊 IoTReceiverDbAdapter + IIoTReceiverDataSource；加 CLI args 解析；移除被砍 service 註冊 |
| `frontend/src/types/index.ts` | `VisType` 加 `pressing_machine_lr` / `visual_marking_machine` |
| `frontend/src/components/layout/EquipmentCard.tsx` | switch 加 2 個 case |
| `frontend/src/components/modals/LimitsSettingsModal.tsx` | 拔 gating + sensor management section |
| `frontend/src/App.tsx` | 拔被砍 modal 的開啟按鈕 |
| `frontend/src/contexts/LanguageContext.tsx` | 移除已砍 modal 的 i18n keys |
| `frontend/src/lib/apiLineConfig.ts` 等 4 檔 | 只留 GET 函式，砍 mutation |

### 刪除（Phase 2 + Phase 3）

- 後端：6 個 controller + 2 個 service + 6 個 entity（清單見 Phase 3）
- 前端：11 個 modal + DeviceIntegrationWizard 整個資料夾 + 3 個 api helper（清單見 Phase 2）

### Migration（Phase 4）

| 路徑 | 內容 |
|------|------|
| `backend/Migrations/20260526_StripSelfServiceAndSeedIoTReceiver.cs` | DROP 9 張表（SensorGatingRules / PlcTemplates / PlcZoneDefinitions / PlcRegisterDefinitions / RegisterMapProfiles / RegisterMapEntries / Devices + 兩張之前 EnsureCreated 沒砍的）|

---

# Phase 0：新增 IoTReceiverDbAdapter（後端內部，無外觀變化）

**部署影響**：服務重啟即可，看板無變化。**這個 phase 結束時 prod 多了一個沒人用的 adapter，零風險。**

## Task 0.1: 寫 IIoTReceiverDataSource 介面與 record

**Files:**
- Create: `backend/Services/IIoTReceiverDataSource.cs`
- Create: `backend/Adapters/IoTReceiverDbConfig.cs`

- [ ] **Step 1: 寫 `IIoTReceiverDataSource` 介面**

`backend/Services/IIoTReceiverDataSource.cs`:

```csharp
namespace IoT.CentralApi.Services;

public interface IIoTReceiverDataSource
{
    /// <summary>
    /// 從共用 DB 讀 IoTReceiverAPI 寫入的最新一筆 row（依 AssetCode + RecordTime DESC）。
    /// 回傳 Dictionary&lt;column, value&gt;，含 RecordTime；row 不存在時回 null。
    /// </summary>
    Task<IReadOnlyDictionary<string, object>?> ReadLatestRowAsync(
        string tableName,
        string assetCode,
        CancellationToken ct);
}
```

- [ ] **Step 2: 寫 `IoTReceiverDbConfig` record**

`backend/Adapters/IoTReceiverDbConfig.cs`:

```csharp
namespace IoT.CentralApi.Adapters;

internal record IoTReceiverDbConfig(
    string TableName,
    string AssetCode,
    int MaxAgeMs = 30000);
```

- [ ] **Step 3: Commit**

```powershell
git add backend/Services/IIoTReceiverDataSource.cs backend/Adapters/IoTReceiverDbConfig.cs
git commit -m "feat(adapter): IIoTReceiverDataSource interface + config record"
```

## Task 0.2: 寫 SqlIoTReceiverDataSource（raw SQL 實作）

**Files:**
- Create: `backend/Services/SqlIoTReceiverDataSource.cs`

- [ ] **Step 1: 寫實作**

`backend/Services/SqlIoTReceiverDataSource.cs`:

```csharp
using IoT.CentralApi.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Services;

public class SqlIoTReceiverDataSource(IDbContextFactory<IoTDbContext> dbFactory) : IIoTReceiverDataSource
{
    private static readonly HashSet<string> AllowedTables = new(StringComparer.Ordinal)
    {
        "PressingMachineRealTimeData",
        "VisualMarkingMachineRealTimeData",
    };

    public async Task<IReadOnlyDictionary<string, object>?> ReadLatestRowAsync(
        string tableName, string assetCode, CancellationToken ct)
    {
        if (!AllowedTables.Contains(tableName))
            throw new ArgumentException($"tableName '{tableName}' not allowed", nameof(tableName));

        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var conn = db.Database.GetDbConnection();
        await conn.OpenAsync(ct);

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"SELECT TOP 1 * FROM [dbo].[{tableName}] WHERE AssetCode = @assetCode ORDER BY RecordTime DESC";
        var p = cmd.CreateParameter();
        p.ParameterName = "@assetCode";
        p.Value = assetCode;
        cmd.Parameters.Add(p);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;

        var dict = new Dictionary<string, object>(reader.FieldCount, StringComparer.Ordinal);
        for (int i = 0; i < reader.FieldCount; i++)
        {
            var name = reader.GetName(i);
            dict[name] = reader.IsDBNull(i) ? DBNull.Value : reader.GetValue(i);
        }
        return dict;
    }
}
```

- [ ] **Step 2: 註冊到 Program.cs**

`backend/Program.cs` line 117 後（在其他 Singleton 旁）加：

```csharp
builder.Services.AddSingleton<IIoTReceiverDataSource, SqlIoTReceiverDataSource>();
```

- [ ] **Step 3: 編譯確認**

```powershell
dotnet build backend
```

預期：build succeeded, 0 errors。

- [ ] **Step 4: Commit**

```powershell
git add backend/Services/SqlIoTReceiverDataSource.cs backend/Program.cs
git commit -m "feat(adapter): SqlIoTReceiverDataSource raw-SQL reader with table allowlist"
```

## Task 0.3: 寫 IoTReceiverDbAdapter 主體 + 註冊

**Files:**
- Create: `backend/Adapters/IoTReceiverDbAdapter.cs`
- Modify: `backend/Program.cs` (註冊 adapter)

- [ ] **Step 1: 寫 Adapter**

`backend/Adapters/IoTReceiverDbAdapter.cs`:

```csharp
// ─────────────────────────────────────────────────────────────────────────────
// IoTReceiverDbAdapter — 從共用 DB 讀 IoTReceiverAPI 寫入的寬表
// ─────────────────────────────────────────────────────────────────────────────
// 兩張支援的表：
//   - PressingMachineRealTimeData    (壓合機，14 個數值欄位)
//   - VisualMarkingMachineRealTimeData (劃線機，Pressure 1 個欄位)
// 兩張表都由 IoTReceiverAPI 寫入（共用 IoTControlChart DB）。
// 本 adapter 不引入對應 entity，避免雙向 schema 耦合。
// ─────────────────────────────────────────────────────────────────────────────

using System.Text.Json;
using IoT.CentralApi.Adapters.Contracts;
using IoT.CentralApi.Services;

namespace IoT.CentralApi.Adapters;

public class IoTReceiverDbAdapter(IIoTReceiverDataSource dataSource) : IProtocolAdapter
{
    public string ProtocolId => "iot_receiver_db";
    public string DisplayName => "IoT Receiver Shared DB";
    public bool SupportsDiscovery => false;
    public bool SupportsLivePolling => true;

    private static readonly IReadOnlyDictionary<string, string[]> TableNumericFields =
        new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["PressingMachineRealTimeData"] =
            [
                "RunTimeSeconds", "OperateTimeSeconds",
                "LeftPressCount", "LeftCycleTime", "LeftPressDuration",
                "RightPressCount", "RightCycleTime", "RightPressDuration",
                "LeftTighteningPressure", "LeftSecondaryPressure", "LeftEdgePressure",
                "RightTighteningPressure", "RightSecondaryPressure", "RightEdgePressure",
            ],
            ["VisualMarkingMachineRealTimeData"] = ["Pressure"],
        };

    public ConfigSchema GetConfigSchema() => new()
    {
        Fields =
        {
            new ConfigField("tableName", "enum", "資料表",
                Required: true,
                Options: [..TableNumericFields.Keys]),
            new ConfigField("assetCode", "string", "AssetCode",
                Required: true, Placeholder: "0000020881"),
            new ConfigField("maxAgeMs", "number", "最大資料年齡 (ms)",
                Required: false, DefaultValue: "30000"),
        }
    };

    public ValidationResult ValidateConfig(string configJson)
    {
        if (!TryParse(configJson, out var cfg, out var err))
            return ValidationResult.Invalid(err!);
        if (!TableNumericFields.ContainsKey(cfg!.TableName))
            return ValidationResult.Invalid($"tableName '{cfg.TableName}' 不在白名單");
        if (string.IsNullOrWhiteSpace(cfg.AssetCode))
            return ValidationResult.Invalid("assetCode 不可為空");
        if (cfg.MaxAgeMs < 5000)
            return ValidationResult.Invalid("maxAgeMs 必須 ≥ 5000");
        return ValidationResult.Valid();
    }

    public Task<Result<DiscoveryResult>> DiscoverAsync(string configJson, CancellationToken ct) =>
        Task.FromResult(Result<DiscoveryResult>.Fail(
            ErrorKind.UnknownProtocol, "iot_receiver_db 不支援 discovery（欄位固定）"));

    public async Task<Result<PollResult>> PollAsync(string configJson, CancellationToken ct)
    {
        if (!TryParse(configJson, out var cfg, out var err))
            return Result<PollResult>.Fail(ErrorKind.InvalidConfig, err!);

        if (!TableNumericFields.TryGetValue(cfg!.TableName, out var allowedFields))
            return Result<PollResult>.Fail(ErrorKind.InvalidConfig,
                $"tableName '{cfg.TableName}' 不在白名單");

        IReadOnlyDictionary<string, object>? row;
        try
        {
            row = await dataSource.ReadLatestRowAsync(cfg.TableName, cfg.AssetCode, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Result<PollResult>.Fail(ErrorKind.Transient,
                $"讀 DB 失敗: {ex.GetType().Name}: {ex.Message}");
        }

        if (row == null)
            return Result<PollResult>.Fail(ErrorKind.DeviceError,
                $"找不到 AssetCode '{cfg.AssetCode}' 的資料");

        if (!row.TryGetValue("RecordTime", out var rtObj) || rtObj is not DateTime rt)
            return Result<PollResult>.Fail(ErrorKind.DeviceError,
                "row 缺少 RecordTime 欄位");

        var ageMs = (DateTime.UtcNow - DateTime.SpecifyKind(rt, DateTimeKind.Utc)).TotalMilliseconds;
        if (ageMs > cfg.MaxAgeMs)
            return Result<PollResult>.Fail(ErrorKind.Transient,
                $"資料過舊 ({ageMs:F0}ms > {cfg.MaxAgeMs}ms)");

        var values = new Dictionary<string, double>(allowedFields.Length, StringComparer.Ordinal);
        foreach (var field in allowedFields)
        {
            if (row.TryGetValue(field, out var val) && val is not DBNull && TryToDouble(val, out var d))
                values[field] = d;
        }

        if (values.Count == 0)
            return Result<PollResult>.Fail(ErrorKind.DeviceError,
                $"row 沒有任何可解析的數值欄位");

        return Result<PollResult>.Ok(new PollResult(values, DateTime.UtcNow));
    }

    private static bool TryParse(string json, out IoTReceiverDbConfig? cfg, out string? err)
    {
        cfg = null;
        try
        {
            cfg = JsonSerializer.Deserialize<IoTReceiverDbConfig>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (cfg == null) { err = "Config 不可為空"; return false; }
            err = null;
            return true;
        }
        catch (JsonException ex)
        {
            err = $"Config JSON 格式錯誤: {ex.Message}";
            return false;
        }
    }

    private static bool TryToDouble(object val, out double result)
    {
        switch (val)
        {
            case double d:  result = d; return true;
            case decimal m: result = (double)m; return true;
            case int i:     result = i; return true;
            case long l:    result = l; return true;
            case float f:   result = f; return true;
            case short s:   result = s; return true;
            default:        result = 0; return false;
        }
    }
}
```

- [ ] **Step 2: 註冊到 Program.cs**

`backend/Program.cs` 在第 135 行 `WebApiAdapter` 註冊後加：

```csharp
builder.Services.AddSingleton<IProtocolAdapter, IoTReceiverDbAdapter>();
```

- [ ] **Step 3: 編譯確認**

```powershell
dotnet build backend
```

預期：build succeeded, 0 errors。

- [ ] **Step 4: Commit**

```powershell
git add backend/Adapters/IoTReceiverDbAdapter.cs backend/Program.cs
git commit -m "feat(adapter): IoTReceiverDbAdapter for shared-DB wide tables"
```

## Task 0.4: 寫 IoTReceiverDbAdapterTests（stub data source）

**Files:**
- Create: `backend/Tests/Adapters/IoTReceiverDbAdapterTests.cs`

- [ ] **Step 1: 寫測試**

`backend/Tests/Adapters/IoTReceiverDbAdapterTests.cs`:

```csharp
using System.Text.Json;
using IoT.CentralApi.Adapters;
using IoT.CentralApi.Adapters.Contracts;
using IoT.CentralApi.Services;

namespace IoT.CentralApi.Tests.Adapters;

public class IoTReceiverDbAdapterTests
{
    private sealed class StubDataSource : IIoTReceiverDataSource
    {
        public IReadOnlyDictionary<string, object>? NextRow { get; set; }
        public Exception? NextException { get; set; }
        public (string Table, string Asset)? LastCall { get; private set; }

        public Task<IReadOnlyDictionary<string, object>?> ReadLatestRowAsync(
            string tableName, string assetCode, CancellationToken ct)
        {
            LastCall = (tableName, assetCode);
            if (NextException != null) throw NextException;
            return Task.FromResult(NextRow);
        }
    }

    private static (IoTReceiverDbAdapter Adapter, StubDataSource Ds) CreateSut()
    {
        var ds = new StubDataSource();
        return (new IoTReceiverDbAdapter(ds), ds);
    }

    private static string Cfg(string table, string asset, int maxAgeMs = 30000) =>
        JsonSerializer.Serialize(new { tableName = table, assetCode = asset, maxAgeMs });

    // ── Identity ───────────────────────────────────────────────────────────────

    [Fact]
    public void ProtocolId_IsIoTReceiverDb()
    {
        var (sut, _) = CreateSut();
        sut.ProtocolId.Should().Be("iot_receiver_db");
    }

    [Fact]
    public void SupportsDiscovery_IsFalse()
    {
        var (sut, _) = CreateSut();
        sut.SupportsDiscovery.Should().BeFalse();
    }

    // ── ValidateConfig ─────────────────────────────────────────────────────────

    [Fact]
    public void ValidateConfig_AcceptsKnownTable()
    {
        var (sut, _) = CreateSut();
        sut.ValidateConfig(Cfg("PressingMachineRealTimeData", "0000020881"))
           .IsValid.Should().BeTrue();
    }

    [Fact]
    public void ValidateConfig_RejectsUnknownTable()
    {
        var (sut, _) = CreateSut();
        var r = sut.ValidateConfig(Cfg("Other", "x"));
        r.IsValid.Should().BeFalse();
        r.ErrorMessage.Should().Contain("白名單");
    }

    [Fact]
    public void ValidateConfig_RejectsEmptyAssetCode()
    {
        var (sut, _) = CreateSut();
        var r = sut.ValidateConfig(Cfg("PressingMachineRealTimeData", ""));
        r.IsValid.Should().BeFalse();
    }

    [Fact]
    public void ValidateConfig_RejectsTooSmallMaxAge()
    {
        var (sut, _) = CreateSut();
        var r = sut.ValidateConfig(Cfg("PressingMachineRealTimeData", "x", maxAgeMs: 1000));
        r.IsValid.Should().BeFalse();
    }

    // ── PollAsync happy path ───────────────────────────────────────────────────

    [Fact]
    public async Task PollAsync_PressingMachine_ReturnsAllNumericFields()
    {
        var (sut, ds) = CreateSut();
        ds.NextRow = new Dictionary<string, object>
        {
            ["RecordTime"] = DateTime.UtcNow.AddSeconds(-5),
            ["RunTimeSeconds"] = 3600,
            ["OperateTimeSeconds"] = 3500,
            ["LeftPressCount"] = 100,
            ["LeftCycleTime"] = 30.5m,
            ["LeftPressDuration"] = 5.2m,
            ["RightPressCount"] = 98,
            ["RightCycleTime"] = 30.8m,
            ["RightPressDuration"] = 5.3m,
            ["LeftTighteningPressure"] = 12.5m,
            ["LeftSecondaryPressure"] = 8.3m,
            ["LeftEdgePressure"] = 6.1m,
            ["RightTighteningPressure"] = 12.6m,
            ["RightSecondaryPressure"] = 8.4m,
            ["RightEdgePressure"] = 6.2m,
            // 字串欄位應該被過濾掉
            ["AssetCode"] = "0000020881",
            ["AssetName"] = "test",
        };

        var r = await sut.PollAsync(
            Cfg("PressingMachineRealTimeData", "0000020881"), CancellationToken.None);

        r.IsSuccess.Should().BeTrue();
        r.Value!.Values.Should().HaveCount(14);
        r.Value.Values["LeftTighteningPressure"].Should().Be(12.5);
        r.Value.Values.Should().NotContainKey("AssetCode");
    }

    [Fact]
    public async Task PollAsync_VisualMarking_OnlyPressure()
    {
        var (sut, ds) = CreateSut();
        ds.NextRow = new Dictionary<string, object>
        {
            ["RecordTime"] = DateTime.UtcNow,
            ["Pressure"] = 12,
            ["AssetCode"] = "0000020882",
        };

        var r = await sut.PollAsync(
            Cfg("VisualMarkingMachineRealTimeData", "0000020882"), CancellationToken.None);

        r.IsSuccess.Should().BeTrue();
        r.Value!.Values.Keys.Should().BeEquivalentTo(["Pressure"]);
        r.Value.Values["Pressure"].Should().Be(12);
    }

    // ── PollAsync error paths ──────────────────────────────────────────────────

    [Fact]
    public async Task PollAsync_RowNotFound_ReturnsDeviceError()
    {
        var (sut, ds) = CreateSut();
        ds.NextRow = null;

        var r = await sut.PollAsync(
            Cfg("PressingMachineRealTimeData", "missing"), CancellationToken.None);

        r.IsSuccess.Should().BeFalse();
        r.ErrorKind.Should().Be(ErrorKind.DeviceError);
    }

    [Fact]
    public async Task PollAsync_DataTooOld_ReturnsTransient()
    {
        var (sut, ds) = CreateSut();
        ds.NextRow = new Dictionary<string, object>
        {
            ["RecordTime"] = DateTime.UtcNow.AddMinutes(-5),  // 300s > default 30s maxAge
            ["Pressure"] = 12,
        };

        var r = await sut.PollAsync(
            Cfg("VisualMarkingMachineRealTimeData", "x"), CancellationToken.None);

        r.IsSuccess.Should().BeFalse();
        r.ErrorKind.Should().Be(ErrorKind.Transient);
        r.ErrorMessage.Should().Contain("過舊");
    }

    [Fact]
    public async Task PollAsync_DataSourceThrows_ReturnsTransient()
    {
        var (sut, ds) = CreateSut();
        ds.NextException = new InvalidOperationException("DB down");

        var r = await sut.PollAsync(
            Cfg("PressingMachineRealTimeData", "x"), CancellationToken.None);

        r.IsSuccess.Should().BeFalse();
        r.ErrorKind.Should().Be(ErrorKind.Transient);
    }

    [Fact]
    public async Task PollAsync_InvalidJson_ReturnsInvalidConfig()
    {
        var (sut, _) = CreateSut();
        var r = await sut.PollAsync("not json", CancellationToken.None);
        r.IsSuccess.Should().BeFalse();
        r.ErrorKind.Should().Be(ErrorKind.InvalidConfig);
    }

    // ── Discovery ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task DiscoverAsync_AlwaysFails()
    {
        var (sut, _) = CreateSut();
        var r = await sut.DiscoverAsync(
            Cfg("PressingMachineRealTimeData", "x"), CancellationToken.None);
        r.IsSuccess.Should().BeFalse();
        r.ErrorKind.Should().Be(ErrorKind.UnknownProtocol);
    }
}
```

- [ ] **Step 2: 跑測試**

```powershell
dotnet test backend/Tests --filter "FullyQualifiedName~IoTReceiverDbAdapterTests"
```

預期：12 個 test pass。

- [ ] **Step 3: Commit + 結束 Phase 0**

```powershell
git add backend/Tests/Adapters/IoTReceiverDbAdapterTests.cs
git commit -m "test(adapter): IoTReceiverDbAdapter unit tests (12 cases)"
```

**Phase 0 完成 PR**：可部署，prod 多一個未使用的 adapter，零功能變化。

---

# Phase 1：Seeder + Tile（讓兩台設備出現在儀錶板）

**部署影響**：跑 seeder → DB 多兩筆 EquipmentType + DeviceConnection + LineEquipment → 儀錶板出現兩個新區塊。沒接通前是 stale 狀態。

## Task 1.1: 加 `duration` PropertyType（用於壓合機 cycle / press duration / runtime）

**Files:**
- Modify: `backend/Program.cs:580-590` (SeedPropertyTypesAsync)

- [ ] **Step 1: 在 SeedPropertyTypesAsync 內加 duration**

`backend/Program.cs` 找到 `static async Task SeedPropertyTypesAsync(...)` ，在 `material_detect` 那行後加：

```csharp
new PropertyType { Key = "duration", Name = "時間長度", Icon = "clock", DefaultUnit = "s", Behavior = "normal", IsBuiltIn = true, SortOrder = 9, CreatedAt = now }
```

完整 chunk 變成：

```csharp
ctx.PropertyTypes.AddRange(
    new PropertyType { Key = "temperature",     Name = "溫度",     Icon = "thermometer",  DefaultUnit = "℃",    Behavior = "normal",          IsBuiltIn = true, SortOrder = 1, CreatedAt = now },
    new PropertyType { Key = "pressure",        Name = "壓力",     Icon = "gauge",        DefaultUnit = "kPa",  Behavior = "normal",          IsBuiltIn = true, SortOrder = 2, CreatedAt = now },
    new PropertyType { Key = "humidity",        Name = "濕度",     Icon = "droplets",     DefaultUnit = "%",    Behavior = "normal",          IsBuiltIn = true, SortOrder = 3, CreatedAt = now },
    new PropertyType { Key = "flow",            Name = "流量",     Icon = "waves",        DefaultUnit = "L/min",Behavior = "normal",          IsBuiltIn = true, SortOrder = 4, CreatedAt = now },
    new PropertyType { Key = "counter",         Name = "計數器",   Icon = "hash",         DefaultUnit = "count",Behavior = "counter",         IsBuiltIn = true, SortOrder = 5, CreatedAt = now },
    new PropertyType { Key = "state",           Name = "狀態",     Icon = "activity",     DefaultUnit = "",     Behavior = "state",           IsBuiltIn = true, SortOrder = 6, CreatedAt = now },
    new PropertyType { Key = "asset_code",      Name = "資產編號", Icon = "tag",          DefaultUnit = "",     Behavior = "asset_code",      IsBuiltIn = true, SortOrder = 7, CreatedAt = now },
    new PropertyType { Key = "material_detect", Name = "在位",     Icon = "check-circle", DefaultUnit = "",     Behavior = "material_detect", IsBuiltIn = true, SortOrder = 8, CreatedAt = now },
    new PropertyType { Key = "duration",        Name = "時間長度", Icon = "clock",        DefaultUnit = "s",    Behavior = "normal",          IsBuiltIn = true, SortOrder = 9, CreatedAt = now }
);
```

⚠️ `SeedPropertyTypesAsync` 有 early-return `if (await ctx.PropertyTypes.AnyAsync()) return;`，舊 DB 不會跑到這段。要靠 idempotent upsert：

- [ ] **Step 2: 改 SeedPropertyTypesAsync 為 idempotent upsert**

把整個 function 改成：

```csharp
static async Task SeedPropertyTypesAsync(IoTDbContext ctx)
{
    var now = DateTime.UtcNow;
    var builtIn = new[]
    {
        new PropertyType { Key = "temperature",     Name = "溫度",     Icon = "thermometer",  DefaultUnit = "℃",    Behavior = "normal",          IsBuiltIn = true, SortOrder = 1, CreatedAt = now },
        new PropertyType { Key = "pressure",        Name = "壓力",     Icon = "gauge",        DefaultUnit = "kPa",  Behavior = "normal",          IsBuiltIn = true, SortOrder = 2, CreatedAt = now },
        new PropertyType { Key = "humidity",        Name = "濕度",     Icon = "droplets",     DefaultUnit = "%",    Behavior = "normal",          IsBuiltIn = true, SortOrder = 3, CreatedAt = now },
        new PropertyType { Key = "flow",            Name = "流量",     Icon = "waves",        DefaultUnit = "L/min",Behavior = "normal",          IsBuiltIn = true, SortOrder = 4, CreatedAt = now },
        new PropertyType { Key = "counter",         Name = "計數器",   Icon = "hash",         DefaultUnit = "count",Behavior = "counter",         IsBuiltIn = true, SortOrder = 5, CreatedAt = now },
        new PropertyType { Key = "state",           Name = "狀態",     Icon = "activity",     DefaultUnit = "",     Behavior = "state",           IsBuiltIn = true, SortOrder = 6, CreatedAt = now },
        new PropertyType { Key = "asset_code",      Name = "資產編號", Icon = "tag",          DefaultUnit = "",     Behavior = "asset_code",      IsBuiltIn = true, SortOrder = 7, CreatedAt = now },
        new PropertyType { Key = "material_detect", Name = "在位",     Icon = "check-circle", DefaultUnit = "",     Behavior = "material_detect", IsBuiltIn = true, SortOrder = 8, CreatedAt = now },
        new PropertyType { Key = "duration",        Name = "時間長度", Icon = "clock",        DefaultUnit = "s",    Behavior = "normal",          IsBuiltIn = true, SortOrder = 9, CreatedAt = now },
    };

    var existingKeys = await ctx.PropertyTypes.Select(p => p.Key).ToListAsync();
    foreach (var pt in builtIn)
    {
        if (!existingKeys.Contains(pt.Key))
            ctx.PropertyTypes.Add(pt);
    }
    await ctx.SaveChangesAsync();
}
```

- [ ] **Step 3: 跑後端確認 seed 沒炸**

```powershell
dotnet run --project backend
```

等啟動 log 出現 `IoT Central API started on http://0.0.0.0:5200` 後按 Ctrl+C 停掉。

確認 DB：

```powershell
sqlcmd -S localhost -d IoTControlChart -E -Q "SELECT [Key], [Name], [SortOrder] FROM PropertyTypes ORDER BY SortOrder" -W -s "|"
```

預期：9 列，最後一列為 `duration | 時間長度 | 9`。

- [ ] **Step 4: Commit**

```powershell
git add backend/Program.cs
git commit -m "feat(seed): add 'duration' PropertyType; make seed idempotent"
```

## Task 1.2: 寫 DeviceSeeder（CLI 工具，建立 EquipmentType + Sensors + DeviceConnection + LineEquipment）

**Files:**
- Create: `backend/Tools/DeviceSeeder.cs`
- Modify: `backend/Program.cs` (CLI args check)

- [ ] **Step 1: 寫 DeviceSeeder**

`backend/Tools/DeviceSeeder.cs`:

```csharp
using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using Microsoft.EntityFrameworkCore;

namespace IoT.CentralApi.Tools;

public static class DeviceSeeder
{
    public static async Task SeedPressingMachineAsync(
        IoTDbContext db, string assetCode, string displayName, int lineConfigId)
    {
        // Idempotent: 若 DeviceConnection 已存在 → 跳過
        if (await db.DeviceConnections.AnyAsync(dc =>
            dc.Protocol == "iot_receiver_db" &&
            dc.ConfigJson.Contains($"\"{assetCode}\"")))
        {
            Console.WriteLine($"[seed] 壓合機 {assetCode} 已存在，跳過");
            return;
        }

        var props = await db.PropertyTypes.ToDictionaryAsync(p => p.Key);
        var pressure = props["pressure"].Id;
        var duration = props["duration"].Id;
        var counter = props["counter"].Id;

        var eqType = new EquipmentType
        {
            Name = "壓合機",
            VisType = "pressing_machine_lr",
            Description = "壓合段壓合機，左右兩側多階段壓力 + 循環時間",
            CreatedAt = DateTime.UtcNow,
            Sensors =
            {
                new EquipmentTypeSensor { SensorId = 50001, PointId = "pt_run_time",        Label = "開機時間",     Unit = "s",   PropertyTypeId = duration, RawAddress = "RunTimeSeconds",          SortOrder = 0 },
                new EquipmentTypeSensor { SensorId = 50002, PointId = "pt_operate_time",    Label = "作業時間",     Unit = "s",   PropertyTypeId = duration, RawAddress = "OperateTimeSeconds",      SortOrder = 1 },
                new EquipmentTypeSensor { SensorId = 50003, PointId = "pt_left_count",      Label = "左壓次",       Unit = "次",  PropertyTypeId = counter,  RawAddress = "LeftPressCount",          SortOrder = 2 },
                new EquipmentTypeSensor { SensorId = 50004, PointId = "pt_left_cycle",      Label = "左循環時間",   Unit = "s",   PropertyTypeId = duration, RawAddress = "LeftCycleTime",           SortOrder = 3 },
                new EquipmentTypeSensor { SensorId = 50005, PointId = "pt_left_press_dur",  Label = "左壓著時間",   Unit = "s",   PropertyTypeId = duration, RawAddress = "LeftPressDuration",       SortOrder = 4 },
                new EquipmentTypeSensor { SensorId = 50006, PointId = "pt_right_count",     Label = "右壓次",       Unit = "次",  PropertyTypeId = counter,  RawAddress = "RightPressCount",         SortOrder = 5 },
                new EquipmentTypeSensor { SensorId = 50007, PointId = "pt_right_cycle",     Label = "右循環時間",   Unit = "s",   PropertyTypeId = duration, RawAddress = "RightCycleTime",          SortOrder = 6 },
                new EquipmentTypeSensor { SensorId = 50008, PointId = "pt_right_press_dur", Label = "右壓著時間",   Unit = "s",   PropertyTypeId = duration, RawAddress = "RightPressDuration",      SortOrder = 7 },
                new EquipmentTypeSensor { SensorId = 50009, PointId = "pt_left_p1",         Label = "左束緊壓力",   Unit = "bar", PropertyTypeId = pressure, RawAddress = "LeftTighteningPressure",  SortOrder = 8 },
                new EquipmentTypeSensor { SensorId = 50010, PointId = "pt_left_p2",         Label = "左二次壓力",   Unit = "bar", PropertyTypeId = pressure, RawAddress = "LeftSecondaryPressure",   SortOrder = 9 },
                new EquipmentTypeSensor { SensorId = 50011, PointId = "pt_left_p3",         Label = "左押邊壓力",   Unit = "bar", PropertyTypeId = pressure, RawAddress = "LeftEdgePressure",        SortOrder = 10 },
                new EquipmentTypeSensor { SensorId = 50012, PointId = "pt_right_p1",        Label = "右束緊壓力",   Unit = "bar", PropertyTypeId = pressure, RawAddress = "RightTighteningPressure", SortOrder = 11 },
                new EquipmentTypeSensor { SensorId = 50013, PointId = "pt_right_p2",        Label = "右二次壓力",   Unit = "bar", PropertyTypeId = pressure, RawAddress = "RightSecondaryPressure",  SortOrder = 12 },
                new EquipmentTypeSensor { SensorId = 50014, PointId = "pt_right_p3",        Label = "右押邊壓力",   Unit = "bar", PropertyTypeId = pressure, RawAddress = "RightEdgePressure",       SortOrder = 13 },
            }
        };
        db.EquipmentTypes.Add(eqType);
        await db.SaveChangesAsync();

        var conn = new DeviceConnection
        {
            Name = displayName,
            Protocol = "iot_receiver_db",
            ConfigJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                tableName = "PressingMachineRealTimeData",
                assetCode,
                maxAgeMs = 30000,
            }),
            PollIntervalMs = 2000,
            IsEnabled = true,
            EquipmentTypeId = eqType.Id,
            CreatedAt = DateTime.UtcNow,
        };
        db.DeviceConnections.Add(conn);

        var maxSort = await db.LineEquipments
            .Where(le => le.LineConfigId == lineConfigId)
            .Select(le => (int?)le.SortOrder)
            .MaxAsync() ?? -1;

        db.LineEquipments.Add(new LineEquipment
        {
            LineConfigId = lineConfigId,
            EquipmentTypeId = eqType.Id,
            AssetCode = assetCode,
            DisplayName = displayName,
            SortOrder = maxSort + 1,
            IsHidden = false,
        });

        await db.SaveChangesAsync();
        Console.WriteLine($"[seed] 壓合機 {assetCode} ({displayName}) 已建立，EquipmentTypeId={eqType.Id}, ConnectionId={conn.Id}");
    }

    public static async Task SeedVisualMarkingMachineAsync(
        IoTDbContext db, string assetCode, string displayName, int lineConfigId)
    {
        if (await db.DeviceConnections.AnyAsync(dc =>
            dc.Protocol == "iot_receiver_db" &&
            dc.ConfigJson.Contains($"\"{assetCode}\"")))
        {
            Console.WriteLine($"[seed] 劃線機 {assetCode} 已存在，跳過");
            return;
        }

        var pressure = await db.PropertyTypes
            .Where(p => p.Key == "pressure").Select(p => p.Id).FirstAsync();

        var eqType = new EquipmentType
        {
            Name = "智能視覺劃線機",
            VisType = "visual_marking_machine",
            Description = "視覺辨識劃線設備，僅監測壓力",
            CreatedAt = DateTime.UtcNow,
            Sensors =
            {
                new EquipmentTypeSensor { SensorId = 60001, PointId = "pt_pressure", Label = "壓力", Unit = "bar", PropertyTypeId = pressure, RawAddress = "Pressure", SortOrder = 0 },
            }
        };
        db.EquipmentTypes.Add(eqType);
        await db.SaveChangesAsync();

        var conn = new DeviceConnection
        {
            Name = displayName,
            Protocol = "iot_receiver_db",
            ConfigJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                tableName = "VisualMarkingMachineRealTimeData",
                assetCode,
                maxAgeMs = 30000,
            }),
            PollIntervalMs = 2000,
            IsEnabled = true,
            EquipmentTypeId = eqType.Id,
            CreatedAt = DateTime.UtcNow,
        };
        db.DeviceConnections.Add(conn);

        var maxSort = await db.LineEquipments
            .Where(le => le.LineConfigId == lineConfigId)
            .Select(le => (int?)le.SortOrder)
            .MaxAsync() ?? -1;

        db.LineEquipments.Add(new LineEquipment
        {
            LineConfigId = lineConfigId,
            EquipmentTypeId = eqType.Id,
            AssetCode = assetCode,
            DisplayName = displayName,
            SortOrder = maxSort + 1,
            IsHidden = false,
        });

        await db.SaveChangesAsync();
        Console.WriteLine($"[seed] 劃線機 {assetCode} ({displayName}) 已建立，EquipmentTypeId={eqType.Id}, ConnectionId={conn.Id}");
    }
}
```

- [ ] **Step 2: 加 CLI 入口到 Program.cs**

在 `backend/Program.cs` 的 `var app = builder.Build();` 之後、`using (var scope = app.Services.CreateScope())` 之前（約 line 149），加：

```csharp
// CLI mode: dotnet run -- seed-pressing-machine <assetCode> <displayName> [lineConfigId=1]
if (args.Length > 0 && args[0].StartsWith("seed-"))
{
    using var cliScope = app.Services.CreateScope();
    var dbFactory = cliScope.ServiceProvider.GetRequiredService<IDbContextFactory<IoTDbContext>>();
    await using var cliDb = await dbFactory.CreateDbContextAsync();
    await cliDb.Database.EnsureCreatedAsync();

    var asset = args.Length > 1 ? args[1] : throw new ArgumentException("AssetCode required");
    var name = args.Length > 2 ? args[2] : asset;
    var lineId = args.Length > 3 ? int.Parse(args[3]) : 1;

    switch (args[0])
    {
        case "seed-pressing-machine":
            await IoT.CentralApi.Tools.DeviceSeeder.SeedPressingMachineAsync(cliDb, asset, name, lineId);
            return;
        case "seed-marking-machine":
            await IoT.CentralApi.Tools.DeviceSeeder.SeedVisualMarkingMachineAsync(cliDb, asset, name, lineId);
            return;
        default:
            Console.Error.WriteLine($"Unknown command: {args[0]}");
            Environment.Exit(1);
            return;
    }
}
```

- [ ] **Step 3: 編譯**

```powershell
dotnet build backend
```

- [ ] **Step 4: 試跑（dev DB）**

```powershell
dotnet run --project backend -- seed-pressing-machine 0000020881 "C 棟壓合機 #1" 3
dotnet run --project backend -- seed-marking-machine 0000020882 "C 棟劃線機 #1" 3
```

預期輸出：
```
[seed] 壓合機 0000020881 (C 棟壓合機 #1) 已建立，EquipmentTypeId=X, ConnectionId=Y
[seed] 劃線機 0000020882 (C 棟劃線機 #1) 已建立，EquipmentTypeId=A, ConnectionId=B
```

> ⚠️ 若 `lineConfigId=3` 在你的 dev DB 對應錯產線，改參數。Prod 的 lineConfigId 在 spec 的 Q5 待確認。

- [ ] **Step 5: 確認 DB 寫入**

```powershell
sqlcmd -S localhost -d IoTControlChart -E -Q "SELECT Id, Name, Protocol, EquipmentTypeId FROM DeviceConnections WHERE Protocol = 'iot_receiver_db'" -W -s "|"
```

預期：2 列。

- [ ] **Step 6: Idempotent 驗證**

再跑一次 step 4 兩個指令。預期：印出「已存在，跳過」，DB 不增加新列。

- [ ] **Step 7: Commit**

```powershell
git add backend/Tools/DeviceSeeder.cs backend/Program.cs
git commit -m "feat(seed): DeviceSeeder CLI for PressingMachine + VisualMarkingMachine"
```

## Task 1.3: 擴充 VisType 型別 + 寫 VisualMarkingMachine tile

**Files:**
- Modify: `frontend/src/types/index.ts`
- Create: `frontend/src/components/visualizations/VisualMarkingMachine.tsx`

- [ ] **Step 1: 擴充 VisType union**

`frontend/src/types/index.ts` line 3：

```typescript
export type VisType = 'molding_matrix' | 'four_rings' | 'dual_side_spark' | 'single_kpi' | 'custom_grid' | 'pressing_machine_lr' | 'visual_marking_machine';
```

- [ ] **Step 2: 寫 VisualMarkingMachine 元件**

`frontend/src/components/visualizations/VisualMarkingMachine.tsx`:

```typescript
import type { Point } from '../../types';
import { cn } from '../../utils/cn';

interface Props {
  points: Point[];
}

export function VisualMarkingMachine({ points }: Props) {
  const pressure = points.find(p => p.id === 'pt_pressure');

  if (!pressure) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-sm">
        無資料
      </div>
    );
  }

  const statusColor =
    pressure.status === 'danger' ? 'text-[var(--accent-red)]' :
    pressure.status === 'warning' ? 'text-[var(--accent-yellow)]' :
    'text-[var(--text-primary)]';

  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <div className={cn("text-5xl font-bold tabular-nums", statusColor)}>
        {pressure.value.toFixed(1)}
      </div>
      <div className="text-sm text-[var(--text-muted)] mt-2">
        {pressure.name} ({pressure.unit})
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```powershell
git add frontend/src/types/index.ts frontend/src/components/visualizations/VisualMarkingMachine.tsx
git commit -m "feat(tile): VisualMarkingMachine tile + extend VisType"
```

## Task 1.4: 寫 PressingMachineLr tile

**Files:**
- Create: `frontend/src/components/visualizations/PressingMachineLr.tsx`

- [ ] **Step 1: 寫元件**

`frontend/src/components/visualizations/PressingMachineLr.tsx`:

```typescript
import type { Point } from '../../types';
import { cn } from '../../utils/cn';

interface Props {
  points: Point[];
}

function PointRow({ point }: { point: Point }) {
  const statusColor =
    point.status === 'danger' ? 'text-[var(--accent-red)]' :
    point.status === 'warning' ? 'text-[var(--accent-yellow)]' :
    'text-[var(--text-primary)]';

  return (
    <div className="flex justify-between items-baseline text-xs">
      <span className="text-[var(--text-muted)]">{point.name}</span>
      <span className={cn("tabular-nums font-mono", statusColor)}>
        {point.value.toFixed(1)} {point.unit}
      </span>
    </div>
  );
}

export function PressingMachineLr({ points }: Props) {
  const byId = new Map(points.map(p => [p.id, p]));

  const runTime = byId.get('pt_run_time');
  const operateTime = byId.get('pt_operate_time');

  const leftPoints = [
    'pt_left_count', 'pt_left_cycle', 'pt_left_press_dur',
    'pt_left_p1', 'pt_left_p2', 'pt_left_p3',
  ].map(id => byId.get(id)).filter((p): p is Point => p !== undefined);

  const rightPoints = [
    'pt_right_count', 'pt_right_cycle', 'pt_right_press_dur',
    'pt_right_p1', 'pt_right_p2', 'pt_right_p3',
  ].map(id => byId.get(id)).filter((p): p is Point => p !== undefined);

  return (
    <div className="flex-1 flex flex-col gap-2">
      {/* Runtime header */}
      {(runTime || operateTime) && (
        <div className="flex justify-around text-[10px] text-[var(--text-muted)] border-b border-[var(--border)] pb-1">
          {runTime && <span>開機 {runTime.value.toFixed(0)}s</span>}
          {operateTime && <span>作業 {operateTime.value.toFixed(0)}s</span>}
        </div>
      )}
      {/* L/R columns */}
      <div className="flex-1 grid grid-cols-2 gap-3 min-h-0">
        <div className="flex flex-col gap-1 border-r border-[var(--border)] pr-2">
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">左側</div>
          {leftPoints.map(p => <PointRow key={p.id} point={p} />)}
        </div>
        <div className="flex flex-col gap-1 pl-2">
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">右側</div>
          {rightPoints.map(p => <PointRow key={p.id} point={p} />)}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
git add frontend/src/components/visualizations/PressingMachineLr.tsx
git commit -m "feat(tile): PressingMachineLr tile (L/R columns, 6 metrics each + runtime header)"
```

## Task 1.5: 把兩個新 tile 接進 EquipmentCard switch

**Files:**
- Modify: `frontend/src/components/layout/EquipmentCard.tsx`

- [ ] **Step 1: import 新元件**

`EquipmentCard.tsx` line 11 後加：

```typescript
import { PressingMachineLr } from '../visualizations/PressingMachineLr';
import { VisualMarkingMachine } from '../visualizations/VisualMarkingMachine';
```

- [ ] **Step 2: 在 visualization body 區段加兩個 case**

`EquipmentCard.tsx` 找到 line 259-263 的 visType switch，加兩行（在 `custom_grid` 後）：

```tsx
{eq.visType === 'custom_grid' && <CustomGrid points={eq.points} dragScope={eq.id} onPointSwap={(drag, drop) => onPointSwap(lineId, eq.id, drag, drop)} />}
{eq.visType === 'pressing_machine_lr' && <PressingMachineLr points={eq.points} />}
{eq.visType === 'visual_marking_machine' && <VisualMarkingMachine points={eq.points} />}
```

- [ ] **Step 3: build 前端**

```powershell
cd frontend && npm run build
```

預期：0 errors。

- [ ] **Step 4: 跑 dev 看一眼**

```powershell
cd frontend && npm run dev
```

打開 `http://localhost:5173`，捲到產線最後，預期看到「C 棟壓合機 #1」與「C 棟劃線機 #1」兩個區塊。沒接通前狀態為 stale / 無資料。Ctrl+C 結束。

- [ ] **Step 5: Commit + 結束 Phase 1**

```powershell
git add frontend/src/components/layout/EquipmentCard.tsx
git commit -m "feat(tile): register pressing_machine_lr + visual_marking_machine in EquipmentCard"
```

**Phase 1 完成 PR**：deploy 後跑 seeder → dashboard 出現兩個新區塊，廠商接通就有數據；未接通顯示無資料。**回退**：DELETE FROM DeviceConnections/LineEquipments/EquipmentTypeSensors/EquipmentTypes where Id 對應到新建的兩筆。

---

# Phase 2：砍前端 self-service UI

**部署影響**：dashboard 主畫面看起來簡化（少了一堆設定按鈕），核心功能不變。

## Task 2.1: 簡化 LimitsSettingsModal（拔 gating + sensor management section）

**Files:**
- Modify: `frontend/src/components/modals/LimitsSettingsModal.tsx`

- [ ] **Step 1: 先確認檔內哪些區段要拔**

```powershell
grep -n "GatingRow\|GatingSelector\|GatingBadge\|SensorManagementSection\|SensorAddPanel" frontend/src/components/modals/LimitsSettingsModal.tsx
```

記下哪些行/區段引用了 gating 與 sensor management。

- [ ] **Step 2: 拔 imports、props、JSX 區段**

具體做法依該檔結構：
1. 刪 `import { GatingRow } from '../sensors/GatingRow';` 等 gating 相關 import
2. 刪 `import { SensorManagementSection } from './SensorManagementSection';` / `import { SensorAddPanel } from './SensorAddPanel';`
3. 刪 props 中與 gating / sensor management 相關的欄位
4. 刪 JSX 內 `<SensorManagementSection ... />`、`<SensorAddPanel ... />`、所有 `<GatingRow>`、可展開的「條件採樣」`<details>` 區段

留：UCL/LCL 欄位、AlertSettingsSection（WeChat 設定）、儲存按鈕。

- [ ] **Step 3: 跑前端測試**

```powershell
cd frontend && npm test -- LimitsSettingsModal
```

⚠️ 失敗預期：依賴 gating prop 的測試會炸。把那些測試刪掉。

- [ ] **Step 4: build 前端確認 type error**

```powershell
cd frontend && npm run build
```

如果有未使用的 import 或 type error，逐一修。

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/components/modals/LimitsSettingsModal.tsx frontend/src/components/modals/__tests__/LimitsSettingsModal.test.tsx
git commit -m "refactor(modal): strip gating + sensor management from LimitsSettingsModal"
```

## Task 2.2: 刪掉 11 個 modal + DeviceIntegrationWizard 目錄

**Files:**
- Delete: 11 modal `.tsx` files + DeviceIntegrationWizard/ directory + corresponding test files

- [ ] **Step 1: 刪檔**

```powershell
git rm frontend/src/components/modals/PlcTemplateModal.tsx
git rm frontend/src/components/modals/PropertyTypesModal.tsx
git rm frontend/src/components/modals/RegisterMapModal.tsx
git rm frontend/src/components/modals/WizardPostPanel.tsx
git rm frontend/src/components/modals/SensorMappingModal.tsx
git rm frontend/src/components/modals/DeviceConnectionsModal.tsx
git rm frontend/src/components/modals/AddDeviceModal.tsx
git rm frontend/src/components/modals/DeviceManagementModal.tsx
git rm frontend/src/components/modals/SensorAddPanel.tsx
git rm frontend/src/components/modals/SensorManagementSection.tsx
git rm frontend/src/components/modals/EditDeviceConnectionModal.tsx
git rm -rf frontend/src/components/modals/DeviceIntegrationWizard
```

- [ ] **Step 2: 砍 sensors gating 元件**

```powershell
git rm frontend/src/components/sensors/GatingBadge.tsx
git rm frontend/src/components/sensors/GatingRow.tsx
git rm frontend/src/components/sensors/GatingSelector.tsx
git rm -rf frontend/src/components/sensors/__tests__
```

- [ ] **Step 3: 砍對應 test 檔**

```powershell
git rm frontend/src/components/modals/__tests__/EditDeviceConnectionModal.test.tsx
git rm frontend/src/components/modals/__tests__/Step2_Config.test.tsx
```

砍前 grep 對應 test 檔，若有其他直接 import 上述 modal 的測試也砍。

- [ ] **Step 4: build 預期破口**

```powershell
cd frontend && npm run build
```

預期：很多 `Cannot find module '../modals/XxxModal'` 的 import error 在 `App.tsx`、`AppToolbar.tsx`、各 hooks 等。下一個 task 修。

- [ ] **Step 5: Commit（即使 build 破，先記錄刪檔點，方便回退）**

```powershell
git commit -m "refactor: remove 11 self-service modals + DeviceIntegrationWizard + sensors gating UI"
```

## Task 2.3: 從 App.tsx 移除被砍 modal 的開啟邏輯

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/AppToolbar.tsx`
- Modify: 其他 import 已刪除 modal 的 hook / util 檔

- [ ] **Step 1: grep 找所有引用點**

```powershell
cd frontend && grep -rn "PlcTemplateModal\|PropertyTypesModal\|RegisterMapModal\|WizardPostPanel\|SensorMappingModal\|DeviceConnectionsModal\|AddDeviceModal\|DeviceManagementModal\|SensorAddPanel\|SensorManagementSection\|EditDeviceConnectionModal\|DeviceIntegrationWizard\|GatingBadge\|GatingRow\|GatingSelector" src
```

- [ ] **Step 2: 逐檔修**

`App.tsx`、`AppToolbar.tsx`、相關 hook 檔：
- 刪 `import` line
- 刪 `useState` for the modal open/close
- 刪打開該 modal 的按鈕 / handler
- 刪 modal 元件本身的 JSX 渲染

對於某些被砍 modal 的「替代入口」，現在沒有 UI → 不用補。整套自助設備管理流程都消失。

- [ ] **Step 3: build until clean**

```powershell
cd frontend && npm run build
```

反覆修到 0 errors。

- [ ] **Step 4: 跑前端測試**

```powershell
cd frontend && npm test
```

預期：少數測試會壞（因為砍掉 modal 引用），把那些測試刪掉。核心測試（History/SSE/UCL-LCL）必須 pass。

- [ ] **Step 5: Commit**

```powershell
git add frontend/src
git commit -m "refactor(frontend): remove all references to deleted self-service modals"
```

## Task 2.4: 砍 / 簡化 api helpers

**Files:**
- Delete: `frontend/src/lib/apiDiscovery.ts`, `apiProtocols.ts`, `apiSensorGating.ts`
- Modify: `apiLineConfig.ts`, `apiDeviceConnections.ts`, `apiEquipmentTypes.ts`, `apiPropertyTypes.ts`（只留 GET）

- [ ] **Step 1: 砍 3 個整檔**

```powershell
git rm frontend/src/lib/apiDiscovery.ts
git rm frontend/src/lib/apiProtocols.ts
git rm frontend/src/lib/apiSensorGating.ts
```

- [ ] **Step 2: 簡化 4 個檔**

對 `apiLineConfig.ts`、`apiDeviceConnections.ts`、`apiEquipmentTypes.ts`、`apiPropertyTypes.ts` 各檔：
- 刪所有 `POST` / `PUT` / `DELETE` / `PATCH` 動作函式
- 留 list / get / fetch... 等 GET 函式
- 順手刪該檔的 mutation-only type import

範例（`apiLineConfig.ts`）：

```typescript
// 砍前可能有：fetchLineConfig, saveLineConfig, deleteLineEquipment, etc.
// 砍後：只留 fetchLineConfig

import { apiClient } from './apiClient';
import type { ApiLineConfig } from '../types';

export async function fetchLineConfig(): Promise<ApiLineConfig[]> {
  const res = await apiClient.get<ApiLineConfig[]>('/api/lineconfig');
  return res.data;
}
```

- [ ] **Step 3: build until clean**

```powershell
cd frontend && npm run build
```

修所有 import error。

- [ ] **Step 4: Commit**

```powershell
git add frontend/src/lib
git commit -m "refactor(api): drop mutation helpers; strip 3 unused api files"
```

## Task 2.5: 清 i18n keys

**Files:**
- Modify: `frontend/src/contexts/LanguageContext.tsx`（或 i18n locale 檔，依專案結構）

- [ ] **Step 1: 找 i18n 主檔**

```powershell
grep -l "i18n\|useTranslation\|LanguageProvider" frontend/src/contexts/ frontend/src/i18n/ 2>/dev/null
```

- [ ] **Step 2: 刪 wizard / gating / plc / register-map 相關翻譯 key**

對所有四個語言（en/zh-TW/zh-CN/zh-HK）刪除：
- `wizard.*`
- `gating.*` / `sensor.gating.*`
- `plcTemplate.*`
- `registerMap.*`
- `sensorMapping.*`
- `deviceManagement.*`
- `discovery.*`

⚠️ 若不確定某 key 是否還用，先 grep：
```powershell
grep -rn "t('foo.bar')" frontend/src
```

- [ ] **Step 3: build + 跑 dev**

```powershell
cd frontend && npm run build && npm run dev
```

打開 dashboard、切換每個語言、確認沒有 `[i18n] missing key: ...` 警告。

- [ ] **Step 4: Commit + 結束 Phase 2**

```powershell
git add frontend/src
git commit -m "chore(i18n): remove translation keys for stripped UI"
```

**Phase 2 完成 PR**：前端編譯 + tests 全綠，dashboard 主畫面少了一堆設定按鈕。**回退**：`git revert` 整個 PR。

---

# Phase 3：砍後端 controller / service

**部署影響**：API 表面縮小，前端反正不再呼叫。

## Task 3.1: 砍 6 個 controller 整檔

**Files:**
- Delete: 6 controller files

- [ ] **Step 1: 砍**

```powershell
git rm backend/Controllers/PlcTemplateController.cs
git rm backend/Controllers/RegisterMapController.cs
git rm backend/Controllers/DiscoveryController.cs
git rm backend/Controllers/ProtocolsController.cs
git rm backend/Controllers/DevicesController.cs
git rm backend/Controllers/SensorGatingController.cs
```

- [ ] **Step 2: 砍對應 test 檔**

```powershell
ls backend/Tests/Controllers/ 2>$null
```

砍與上述 controller 對應的 test 檔（檔名通常為 `XxxControllerTests.cs`）。

- [ ] **Step 3: build**

```powershell
dotnet build backend
```

預期：可能會有 PlcTemplate / RegisterMap entity 在其他地方引用的 type error，下一個 task 處理。

- [ ] **Step 4: Commit**

```powershell
git add backend
git commit -m "refactor(api): remove 6 self-service controllers + their tests"
```

## Task 3.2: Mutation-only 砍：EquipmentType / PropertyType / LineConfig / DeviceConnection controllers

**Files:**
- Modify: 4 controller files

- [ ] **Step 1: 對每個 controller 刪所有非 GET 的 action method**

對 `EquipmentTypeController.cs`、`PropertyTypeController.cs`、`LineConfigController.cs`、`DeviceConnectionController.cs`：

- 刪 `[HttpPost]`、`[HttpPut]`、`[HttpDelete]`、`[HttpPatch]` 的 action methods
- 保留所有 `[HttpGet]` action methods
- 清掉 mutation-only 的 DTO 引用（順手刪不再使用的 DTO record）

- [ ] **Step 2: build**

```powershell
dotnet build backend
```

- [ ] **Step 3: 跑既有 test**

```powershell
dotnet test backend/Tests
```

預期：mutation 對應的測試會炸 → 把那些測試刪掉。GET 測試應保留。

- [ ] **Step 4: Commit**

```powershell
git add backend
git commit -m "refactor(api): keep only GET endpoints on EquipmentType/PropertyType/LineConfig/DeviceConnection"
```

## Task 3.3: 砍 2 個 service + Program.cs 註冊

**Files:**
- Delete: `backend/Services/ImpactAnalyzer.cs`, `backend/Services/GatingEvaluator.cs`
- Modify: `backend/Program.cs`

- [ ] **Step 1: 砍 service**

```powershell
git rm backend/Services/ImpactAnalyzer.cs
git rm backend/Services/GatingEvaluator.cs
```

- [ ] **Step 2: 砍 Program.cs 註冊**

`backend/Program.cs` line 140 + 143 移除：

```csharp
builder.Services.AddSingleton<GatingEvaluator>();
builder.Services.AddScoped<ImpactAnalyzer>();
```

- [ ] **Step 3: 砍 GatingEvaluator 在 DataIngestionService / 其他地方的引用**

```powershell
grep -rn "GatingEvaluator\|ImpactAnalyzer" backend/Services backend/Controllers
```

逐處砍，包括 DI 注入 + 呼叫端。Gating 相關邏輯（pendingReading + maxAgeMs check）整套移除。

- [ ] **Step 4: build + 跑後端測試**

```powershell
dotnet build backend
dotnet test backend/Tests
```

預期：gating 對應的測試會炸 → 砍。

- [ ] **Step 5: Commit + 結束 Phase 3**

```powershell
git add backend
git commit -m "refactor(services): remove ImpactAnalyzer + GatingEvaluator + all references"
```

**Phase 3 完成 PR**：後端 build 過、core test 全綠。可部署。**回退**：`git revert`。

---

# Phase 4：EF Migration drop tables

**部署影響**：永久刪除 9 張表的資料。**不可逆**。先做 DB backup。

## Task 4.1: DB 完整備份

- [ ] **Step 1: backup 指令**

```powershell
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
sqlcmd -S localhost -d master -E -Q "BACKUP DATABASE [IoTControlChart] TO DISK = N'C:\backup\IoTControlChart-pre-strip-$ts.bak' WITH NOFORMAT, NOINIT, NAME = N'Pre Phase 4 strip', SKIP, NOREWIND, NOUNLOAD, STATS = 10"
```

- [ ] **Step 2: 確認檔案存在**

```powershell
ls C:\backup\IoTControlChart-pre-strip-*.bak | Select-Object -Last 1
```

預期：檔案 size > 1 MB。

## Task 4.2: 從 IoTDbContext 移除 9 個 entity DbSet

**Files:**
- Modify: `backend/Data/IoTDbContext.cs`

- [ ] **Step 1: 讀 DbContext 找這些 DbSet 的宣告**

```powershell
grep -n "DbSet<SensorGatingRule>\|DbSet<PlcTemplate>\|DbSet<PlcZoneDefinition>\|DbSet<PlcRegisterDefinition>\|DbSet<RegisterMapProfile>\|DbSet<RegisterMapEntry>\|DbSet<Device>" backend/Data/IoTDbContext.cs
```

- [ ] **Step 2: 砍 DbSet 宣告 + 對應 OnModelCreating 配置 + entity 檔**

砍 DbContext 內：
- `public DbSet<SensorGatingRule> SensorGatingRules => Set<SensorGatingRule>();`
- 同 PlcTemplate / PlcZoneDefinition / PlcRegisterDefinition / RegisterMapProfile / RegisterMapEntry / Device
- `OnModelCreating` 內對這些 entity 的 `.HasIndex`、`.HasOne(...).WithMany(...)` 等配置

砍 entity 檔：

```powershell
git rm backend/Models/Entities/SensorGatingRule.cs
# Models/Entities.cs 是 legacy 大檔，要打開來砍 Device / RegisterMapProfile / RegisterMapEntry / PlcTemplate / PlcZoneDefinition / PlcRegisterDefinition 6 個 class
```

對 `backend/Models/Entities.cs` 用 Edit tool 刪掉 6 個 class（保留 SensorReading / SensorAlert / SensorLimit / AssetCache / EquipmentType / EquipmentTypeSensor / LineConfig / LineEquipment）。

- [ ] **Step 3: 也清 Program.cs 內 EnsureCreated 區段的 idempotent T-SQL**

`backend/Program.cs` 約 162-322 行有大量 `CREATE TABLE IF NOT EXISTS [Devices]/[RegisterMapProfiles]/[RegisterMapEntries]/[PlcTemplates]/[PlcZoneDefinitions]/[PlcRegisterDefinitions]` 的補丁 DDL，整段砍掉。

- [ ] **Step 4: build**

```powershell
dotnet build backend
```

預期：可能有少數地方還在引用這些 entity，逐一砍。

- [ ] **Step 5: Commit**

```powershell
git add backend
git commit -m "refactor(db): remove 7 entity classes + DbSet + EnsureCreated DDL"
```

## Task 4.3: 寫 EF migration 並 drop 9 張表

**Files:**
- Generate: `backend/Migrations/<timestamp>_StripSelfService.cs`

- [ ] **Step 1: 產生 migration**

```powershell
cd backend; dotnet ef migrations add StripSelfService
```

預期：產生 migration 檔自動偵測到 entity 被砍 → 自動產生 DropTable() 指令。

- [ ] **Step 2: 人工 review migration script**

```powershell
dotnet ef migrations script
```

逐行檢查：
- ✅ 必須 DROP：`SensorGatingRules`, `PlcRegisterDefinitions`, `PlcZoneDefinitions`, `PlcTemplates`, `RegisterMapEntries`, `RegisterMapProfiles`, `Devices`
- ❌ **絕對不能**出現：`PressingMachineRealTimeData`, `VisualMarkingMachineRealTimeData`, `AssetCodeAndPlantView`, `AssetSyncLog`, `IoTErrorLog`（這些是 IoTReceiverAPI 的）

如果 migration script 想 DROP 任何 IoTReceiverAPI 的表 → STOP。回頭看 DbContext 是不是不小心 include 了那些 entity。

- [ ] **Step 3: 套到 dev DB**

```powershell
dotnet ef database update
```

預期：DROP 完成，9 張表消失。

- [ ] **Step 4: 確認 dev DB schema**

```powershell
sqlcmd -S localhost -d IoTControlChart -E -Q "SELECT name FROM sys.tables WHERE name IN ('SensorGatingRules','PlcTemplates','PlcZoneDefinitions','PlcRegisterDefinitions','RegisterMapProfiles','RegisterMapEntries','Devices')"
```

預期：0 列（全砍掉）。

```powershell
sqlcmd -S localhost -d IoTControlChart -E -Q "SELECT name FROM sys.tables WHERE name IN ('PressingMachineRealTimeData','VisualMarkingMachineRealTimeData','AssetCodeAndPlantView','AssetSyncLog','IoTErrorLog')"
```

預期：5 列（IoTReceiverAPI 的表完好）。

- [ ] **Step 5: 跑後端 + 確認 polling 4 條 Modbus + 2 條 iot_receiver_db 都正常**

```powershell
dotnet run --project backend
```

打開 dashboard 確認看板正常顯示。Ctrl+C 結束。

- [ ] **Step 6: Commit**

```powershell
git add backend/Migrations
git commit -m "refactor(db): EF migration drops 7 self-service tables (verified IoTReceiverAPI tables intact)"
```

## Task 4.4: 寫部署文件

**Files:**
- Create: `docs/operations/add-new-equipment-from-iot-receiver.md`
- Create: `docs/architecture/iot-receiver-integration.md`
- Modify: `CLAUDE.md` (加 "Do not" 條目)

- [ ] **Step 1: SOP 文件**

`docs/operations/add-new-equipment-from-iot-receiver.md`:

````markdown
# 新增 IoTReceiver 機台到儀錶板 SOP

## 前置條件

1. IoTReceiverAPI 已能接收這台機台的資料（PressingMachine 或 VisualMarkingMachine）
2. 廠商側 endpoint 設定好 AssetCode
3. 該 AssetCode 在 AssetCodeAndPlantView 有對應（Azure FAS sync 應該已包含）

## 步驟

```powershell
# 1. SSH 到 prod server
# 2. cd 到 backend publish 路徑
cd C:\Users\Administrator\Desktop\IoT\IoT-Dashboard\publish\

# 3. 跑 seeder
.\IoT.CentralApi.exe seed-pressing-machine 0000020881 "C 棟壓合機 #1" 3
# 或
.\IoT.CentralApi.exe seed-marking-machine 0000020882 "C 棟劃線機 #1" 3
```

3 個參數：
- AssetCode（必填）
- DisplayName（必填）
- LineConfigId（預設 1，目前 prod 主產線為 3）

## 驗證

```sql
SELECT TOP 5 * FROM PressingMachineRealTimeData WHERE AssetCode = '0000020881' ORDER BY RecordTime DESC;
SELECT * FROM DeviceConnections WHERE Protocol = 'iot_receiver_db';
```

確認看板載入後該設備區塊有資料（廠商已上傳）或 stale 狀態（未上傳）。

## 故障排除

- 看板永遠 Stale：檢查 IoTReceiverAPI 是否有收到該 AssetCode 的資料、`maxAgeMs` 設定是否足夠
- 數值看起來不對：檢查 `EquipmentTypeSensor.RawAddress` 是否對應到正確的 DB 欄位

## 加新機台類型（非壓合機 / 劃線機）

詳見 `docs/architecture/iot-receiver-integration.md` 的「未來機台 onboarding」段落。
````

- [ ] **Step 2: 架構文件**

`docs/architecture/iot-receiver-integration.md`:

````markdown
# IoT-Dashboard ↔ IoTReceiverAPI 整合架構

## 兩個服務共用 IoTControlChart DB

| 服務 | 寫入 | 讀取 |
|------|------|------|
| IoTReceiverAPI (5101) | PressingMachineRealTimeData / VisualMarkingMachineRealTimeData / AssetCodeAndPlantView / AssetSyncLog / IoTErrorLog | — |
| IoT-Dashboard (5200) | SensorReadings / SensorAlerts / SensorLimits / DeviceConnections / ... | 上述 IoTReceiverAPI 兩張寬表（透過 `IoTReceiverDbAdapter`，raw SQL）|

## Schema 主權

兩邊 schema 主權清楚：
- IoT-Dashboard 的 `IoTDbContext` **不引用** IoTReceiverAPI 的 entity
- IoTReceiverAPI 的 `IoTReceiverDb` context **不引用** IoT-Dashboard 的 entity
- 兩邊各自跑 migration，table 名稱不衝突

## 加新機台類型

當有第 3、第 4 種 IoTReceiverAPI 寬表（例如未來新增 GluingMachineRealTimeData）：

1. IoTReceiverAPI 那邊新增 entity + controller + migration（屬於它的工作）
2. IoT-Dashboard 這邊：
   - 把新表名加進 `IoTReceiverDbAdapter.TableNumericFields` 與 `SqlIoTReceiverDataSource.AllowedTables`
   - 加進新 `EquipmentType` + `EquipmentTypeSensor` 對應（透過 DeviceSeeder.cs 新方法）
   - 寫對應的前端 visualization tile + extend VisType union + EquipmentCard switch case

## 不要做的事

- 不要在 IoT-Dashboard 的 DbContext 加入 IoTReceiverAPI 的 entity（會引發 EF migration 衝突，可能誤砍對方的表）
- 不要在 IoTReceiverAPI 那邊嘗試直接寫 SensorReadings 表（介面不對）
- 兩個服務的 startup 都會跑 `EnsureCreated`（IoTDashboard）/ `MigrateAsync`（IoTReceiverAPI），各自只負責自己的表
````

- [ ] **Step 3: 更新 CLAUDE.md**

`backend/CLAUDE.md` 或專案根 `CLAUDE.md` 的「Do not」段落加：

```markdown
- 不要在 IoTDbContext 引用 IoTReceiverAPI 的 entity（PressingMachineRealTimeData / VisualMarkingMachineRealTimeData / AssetCodeAndPlantView / AssetSyncLog / IoTErrorLog）。要讀那兩張寬表，透過 `IoTReceiverDbAdapter` + `IIoTReceiverDataSource`。
```

- [ ] **Step 4: Commit + 結束 Phase 4**

```powershell
git add docs CLAUDE.md
git commit -m "docs: IoTReceiver integration SOP + architecture + CLAUDE.md guidance"
```

**Phase 4 完成 PR**：DB 已 drop 9 張表，整個 self-service 系統完全消失。可部署。**回退**：靠 DB backup 還原（Phase 4.1）。

---

## 部署順序與觀察期建議

| Phase | 部署後觀察 | 進下一個 phase 條件 |
|---|---|---|
| 0 | 1-3 天，確認 IoTReceiverDbAdapter 註冊不影響既有 polling | 既有 4 條 Modbus 正常 + 0 個 unhandled exception |
| 1 | 1-2 週，等廠商接通 + UCL/LCL 校準 | 兩台新設備能正常顯示資料 |
| 2 | 3-5 天 | dashboard 主流程穩定（看板載入、UCL/LCL 編輯、告警）|
| 3 | 3-5 天 | 後端 logs 無 controller 404 / 500 異常 |
| 4 | 1-2 天，注意 DB 增長 | DB 健康、無 EF migration 錯誤 |

每個 phase 都是獨立 PR，可隨時暫停在某 phase 不繼續。

---

## 跨 Phase 已知風險（一次列）

1. **Phase 4 DB drop 不可逆** — backup 是唯一回退手段
2. **跨 service migration 衝突** — 兩個 service 的 `__EFMigrationsHistory` 都寫進同一個 DB，但只要 migration 名稱不重複就 OK
3. **Tile 顯示空白** — Phase 1 部署但廠商還沒接通 → 顯示 stale。文件化處理（SOP）
4. **i18n key 漏砍** — Phase 2 後可能出現 `[i18n] missing key` warning。不影響功能，下次清理
5. **lineConfigId 跑錯** — DeviceSeeder 預設 lineConfigId=1，prod 主產線是 3。SOP 內提醒參數要對

---

## Self-Review

### Spec coverage

- ✅ §3 整體架構 → File Structure + Phase 0
- ✅ §4 IoTReceiverDbAdapter → Task 0.1-0.4
- ✅ §5 EquipmentType seed → Task 1.2
- ✅ §6 PropertyType seed → Task 1.1
- ✅ §7 UCL/LCL → 不在 seeder 內（spec 說保留空值，prod 從 LimitsSettingsModal 填）
- ✅ §8 LineEquipment seed → Task 1.2
- ✅ §9 Tile 設計 → Task 1.3-1.5
- ✅ §10 砍除清單 → Phase 2 + 3
- ✅ §11 DeviceSeeder → Task 1.2
- ✅ §12 EF Migration → Phase 4
- ✅ §13 Phase 分階 → Phase 0-4 一對一
- ✅ §14 風險評估 → 「跨 Phase 已知風險」段
- ✅ §15 文件化 → Task 4.4

### Placeholder scan

無 TBD / TODO。Q1-Q8 (待 user 補資料) 列在 Spec §16，不在 plan 內（plan 預設 user 在 deploy 時提供）。

### Type 一致性

- `ProtocolId` = `"iot_receiver_db"` 在 Adapter, Seeder, Spec 一致
- `VisType` = `"pressing_machine_lr"` / `"visual_marking_machine"` 在 type union, EquipmentCard switch, Seeder 一致
- `PointId` = `pt_run_time` / `pt_left_p1` 等在 Seeder, Tile, Spec 一致
- `RawAddress` 欄位名稱與 IoTReceiverAPI entity property 一致（如 `LeftTighteningPressure`）

Plan complete and saved to `docs/superpowers/plans/2026-05-26-iot-receiver-integration.md`.
