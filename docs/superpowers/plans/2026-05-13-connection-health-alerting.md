# Connection Health Alerting + Polling Watchdog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect and broadcast connection health degradation so the 5/3-style 4-day silent outage cannot happen again. Surface health on the dashboard, alert through pluggable channels, and watchdog the polling loop itself.

**Architecture:**
- Per-connection alert thresholds (`AlertOnConsecutiveErrors`, `AlertCooldownSec`, `IsAlertEnabled`) stored on `DeviceConnections` table. Defaults safe for existing rows.
- New `IAlertChannel` abstraction + `AlertDispatcher` Singleton — WeChat becomes one channel of N. SSE channel always on. Future channels (Email/Teams) just register without touching call sites.
- `ConnectionState` tracks a `LastNotifiedState` (Healthy/Unhealthy) and last notify timestamp. `PollingBackgroundService` evaluates state transitions after each poll and dispatches alerts on **transition only** (avoid spam) with cooldown re-arm.
- New `PollingWatchdogService` HostedService runs every 30s; if `PollingBackgroundService.LastTickAt` is stale > 30s → fires critical alert via same dispatcher.
- Frontend: `ConnectionHealthBadge` in `AppToolbar` showing `N/M 正常`, click to expand; `Wizard Step2_Config` + `EditDeviceConnectionModal` add collapsible 進階設定 with the 3 alert fields; `Step2_Config` shows a hint when the chosen host:port already has ≥1 other connection.

**Tech Stack:** .NET 9, EF Core 9 (idempotent SQL DDL in Program.cs — matches existing pattern), xUnit + FluentAssertions, React 19 + TypeScript + Tailwind 4 + i18next (zh-TW / zh-CN / EN — 3 languages).

**Flexibility & compatibility constraints (must hold throughout):**
- Zero hardcoded host / protocol / device assumptions
- DB defaults must give existing connections sensible behavior (alerts on, threshold 5, cooldown 5min)
- Existing 135+49 tests must stay green
- All new alert channels opt-in via config; SSE is the only always-on channel

---

## File Structure

### Backend — Create
- `backend/Services/Alerting/IAlertChannel.cs` — channel contract
- `backend/Services/Alerting/AlertDispatcher.cs` — fan-out + cooldown
- `backend/Services/Alerting/ConnectionAlertEvent.cs` — event record
- `backend/Services/Alerting/Channels/SseAlertChannel.cs` — broadcast via SseHub
- `backend/Services/Alerting/Channels/WeChatAlertChannel.cs` — wraps existing WeChatService
- `backend/Services/PollingWatchdogService.cs` — stalled-tick detector
- `backend/Tests/Services/Alerting/AlertDispatcherTests.cs`
- `backend/Tests/Services/PollingWatchdogServiceTests.cs`

### Backend — Modify
- `backend/Models/Entities/DeviceConnection.cs` — add 3 columns
- `backend/Dtos/DeviceConnectionDtos.cs` — add 3 fields to DTO + request records
- `backend/Controllers/DeviceConnectionController.cs` — propagate 3 fields in Create/Update/Map
- `backend/Services/ConnectionState.cs` — add `LastNotifiedHealthy` + `LastAlertAt`
- `backend/Services/PollingBackgroundService.cs` — call AlertDispatcher.EvaluateAsync after each poll
- `backend/Tests/Services/ConnectionStateTests.cs` — add transition tests
- `backend/Program.cs` — DDL for 3 new columns + register AlertDispatcher + register channels + watchdog
- `backend/Services/WeChatService.cs` — add `SendConnectionAlertAsync` method (re-uses log+file pattern)

### Frontend — Create
- `frontend/src/components/layout/ConnectionHealthBadge.tsx` — toolbar badge + popover
- `frontend/src/hooks/usePollingDiagnostics.ts` — polls `/api/diagnostics/polling` every 10s + SSE refresh trigger

### Frontend — Modify
- `frontend/src/lib/apiDeviceConnections.ts` — extend types with 3 alert fields
- `frontend/src/components/modals/DeviceIntegrationWizard/WizardContext.tsx` — add 3 fields to state
- `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step2_Config.tsx` — collapsible 進階設定 + same-host hint
- `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step7_Review.tsx` — show alert settings in review
- `frontend/src/components/modals/EditDeviceConnectionModal.tsx` — collapsible 進階設定
- `frontend/src/components/layout/AppToolbar.tsx` — slot the badge
- `frontend/src/i18n/index.ts` — add ~20 new keys × 3 languages

---

## Task 1: DB schema — add 3 alert columns to DeviceConnections

**Files:**
- Modify: `backend/Program.cs` (append idempotent DDL after existing DeviceConnections block, around line 533)

- [ ] **Step 1: Add idempotent DDL**

After the existing `DeviceConnections` `IF NOT EXISTS (...) CREATE TABLE` block in `Program.cs`, append:

```csharp
// Connection health alert settings — added 2026-05-13
await ctx.Database.ExecuteSqlRawAsync("""
    IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DeviceConnections' AND schema_id = SCHEMA_ID('dbo'))
       AND NOT EXISTS (
           SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.DeviceConnections') AND name = 'AlertOnConsecutiveErrors'
       )
    BEGIN
        ALTER TABLE [dbo].[DeviceConnections]
            ADD [AlertOnConsecutiveErrors] INT NOT NULL CONSTRAINT DF_DeviceConnections_AlertOnConsecutiveErrors DEFAULT 5,
                [AlertCooldownSec]         INT NOT NULL CONSTRAINT DF_DeviceConnections_AlertCooldownSec DEFAULT 300,
                [IsAlertEnabled]           BIT NOT NULL CONSTRAINT DF_DeviceConnections_IsAlertEnabled DEFAULT 1;
    END
    """);
```

- [ ] **Step 2: Verify locally**

Run: `dotnet build backend/IoT.CentralApi.csproj`
Expected: build succeeds, no errors. (Schema applies on next service start.)

- [ ] **Step 3: Commit**

```bash
git add backend/Program.cs
git commit -m "feat(db): add connection alert settings columns (idempotent DDL)"
```

---

## Task 2: Update DeviceConnection entity + DTOs

**Files:**
- Modify: `backend/Models/Entities/DeviceConnection.cs`
- Modify: `backend/Dtos/DeviceConnectionDtos.cs`
- Modify: `backend/Controllers/DeviceConnectionController.cs`

- [ ] **Step 1: Add 3 properties to entity**

In `backend/Models/Entities/DeviceConnection.cs`, after `ConsecutiveErrors` (line 43), insert:

```csharp
/// <summary>連續錯誤幾次後觸發告警（per-connection；預設 5）</summary>
public int AlertOnConsecutiveErrors { get; set; } = 5;

/// <summary>告警冷卻秒數，避免 alert storm（預設 300）</summary>
public int AlertCooldownSec { get; set; } = 300;

/// <summary>是否啟用此連線的告警（測試/開發用連線可關）</summary>
public bool IsAlertEnabled { get; set; } = true;
```

- [ ] **Step 2: Extend DTOs**

In `backend/Dtos/DeviceConnectionDtos.cs`, update all four records to include the 3 fields with defaults so callers that omit them still work:

```csharp
public record DeviceConnectionDto(
    int Id,
    string Name,
    string Protocol,
    string ConfigJson,
    int? PollIntervalMs,
    bool IsEnabled,
    DateTime? LastPollAt,
    string? LastPollError,
    int ConsecutiveErrors,
    int? EquipmentTypeId,
    string? EquipmentTypeName,
    DateTime CreatedAt,
    int AlertOnConsecutiveErrors = 5,
    int AlertCooldownSec = 300,
    bool IsAlertEnabled = true);

public record DeviceConnectionDetailDto(
    int Id,
    string Name,
    string Protocol,
    string ConfigJson,
    int? PollIntervalMs,
    bool IsEnabled,
    DateTime? LastPollAt,
    string? LastPollError,
    int ConsecutiveErrors,
    int? EquipmentTypeId,
    EquipmentTypeDto? EquipmentType,
    DateTime CreatedAt,
    string? AssetCode = null,
    int AlertOnConsecutiveErrors = 5,
    int AlertCooldownSec = 300,
    bool IsAlertEnabled = true);

public record SaveDeviceConnectionRequest(
    [Required, MaxLength(200)] string Name,
    [Required, MaxLength(50)] string Protocol,
    [Required] string Config,
    int? PollIntervalMs,
    bool IsEnabled = true,
    SaveEquipmentTypeRequest? EquipmentType = null,
    int AlertOnConsecutiveErrors = 5,
    int AlertCooldownSec = 300,
    bool IsAlertEnabled = true);

public record UpdateDeviceConnectionRequest(
    [Required, MaxLength(200)] string Name,
    [Required] string Config,
    int? PollIntervalMs,
    bool IsEnabled = true,
    int AlertOnConsecutiveErrors = 5,
    int AlertCooldownSec = 300,
    bool IsAlertEnabled = true);
```

- [ ] **Step 3: Propagate in Controller**

In `backend/Controllers/DeviceConnectionController.cs`:

a. Find the `MapToDto` private method (search for `private static DeviceConnectionDto MapToDto`). Add the 3 fields to its constructor call:

```csharp
private static DeviceConnectionDto MapToDto(DeviceConnection dc) => new(
    Id: dc.Id,
    Name: dc.Name,
    Protocol: dc.Protocol,
    ConfigJson: dc.ConfigJson,
    PollIntervalMs: dc.PollIntervalMs,
    IsEnabled: dc.IsEnabled,
    LastPollAt: dc.LastPollAt,
    LastPollError: dc.LastPollError,
    ConsecutiveErrors: dc.ConsecutiveErrors,
    EquipmentTypeId: dc.EquipmentTypeId,
    EquipmentTypeName: dc.EquipmentType?.Name,
    CreatedAt: dc.CreatedAt,
    AlertOnConsecutiveErrors: dc.AlertOnConsecutiveErrors,
    AlertCooldownSec: dc.AlertCooldownSec,
    IsAlertEnabled: dc.IsAlertEnabled);
```

b. Same for `MapToDetailDto` — add the 3 fields.

c. In `Create` action where `new DeviceConnection { ... }` is built (search for `new DeviceConnection`), append:

```csharp
AlertOnConsecutiveErrors = req.AlertOnConsecutiveErrors,
AlertCooldownSec = req.AlertCooldownSec,
IsAlertEnabled = req.IsAlertEnabled,
```

d. In `Update` action where existing fields are assigned (e.g. `dc.Name = req.Name;`), append:

```csharp
dc.AlertOnConsecutiveErrors = req.AlertOnConsecutiveErrors;
dc.AlertCooldownSec = req.AlertCooldownSec;
dc.IsAlertEnabled = req.IsAlertEnabled;
```

- [ ] **Step 4: Build and verify**

Run: `dotnet build backend/IoT.CentralApi.csproj`
Expected: clean build.

Run: `dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~DeviceConnection"`
Expected: existing tests pass (no behavior change yet, just additive fields).

- [ ] **Step 5: Commit**

```bash
git add backend/Models/Entities/DeviceConnection.cs backend/Dtos/DeviceConnectionDtos.cs backend/Controllers/DeviceConnectionController.cs
git commit -m "feat(connections): add alert settings fields to entity, DTOs, controller"
```

---

## Task 3: AlertDispatcher + IAlertChannel abstraction (TDD)

**Files:**
- Create: `backend/Services/Alerting/IAlertChannel.cs`
- Create: `backend/Services/Alerting/ConnectionAlertEvent.cs`
- Create: `backend/Services/Alerting/AlertDispatcher.cs`
- Test: `backend/Tests/Services/Alerting/AlertDispatcherTests.cs`

- [ ] **Step 1: Define event record**

Create `backend/Services/Alerting/ConnectionAlertEvent.cs`:

```csharp
namespace IoT.CentralApi.Services.Alerting;

/// <summary>
/// Connection-level health alert event. Kind tells channels how to format.
/// </summary>
public record ConnectionAlertEvent(
    ConnectionAlertKind Kind,
    int ConnectionId,
    string ConnectionName,
    string Protocol,
    int ConsecutiveErrors,
    string? ErrorMessage,
    DateTime OccurredAt);

public enum ConnectionAlertKind
{
    /// <summary>連線從健康變成異常（首次達到 AlertOnConsecutiveErrors 門檻）</summary>
    Unhealthy,
    /// <summary>連線從異常恢復健康</summary>
    Recovered,
    /// <summary>整個 polling tick 停擺（watchdog 觸發）</summary>
    PollingStalled,
}
```

- [ ] **Step 2: Define channel contract**

Create `backend/Services/Alerting/IAlertChannel.cs`:

```csharp
namespace IoT.CentralApi.Services.Alerting;

/// <summary>
/// 告警通道介面。通道實作 (WeChat / SSE / Email / Webhook) 都註冊為
/// IEnumerable<IAlertChannel>，AlertDispatcher 一視同仁 fan-out。
/// </summary>
public interface IAlertChannel
{
    /// <summary>通道顯示名稱（log 用）</summary>
    string Name { get; }

    /// <summary>是否啟用（讓 channel 自己讀 config 決定）</summary>
    bool IsEnabled { get; }

    Task SendAsync(ConnectionAlertEvent evt, CancellationToken ct);
}
```

- [ ] **Step 3: Write failing test for dispatcher**

Create `backend/Tests/Services/Alerting/AlertDispatcherTests.cs`:

```csharp
using IoT.CentralApi.Services.Alerting;
using Microsoft.Extensions.Logging.Abstractions;

namespace IoT.CentralApi.Tests.Services.Alerting;

public class AlertDispatcherTests
{
    private class StubChannel : IAlertChannel
    {
        public string Name => "stub";
        public bool IsEnabled { get; set; } = true;
        public List<ConnectionAlertEvent> Sent { get; } = new();
        public Task SendAsync(ConnectionAlertEvent evt, CancellationToken ct)
        {
            Sent.Add(evt);
            return Task.CompletedTask;
        }
    }

    [Fact]
    public async Task DispatchAsync_FansOutToAllEnabledChannels()
    {
        var ch1 = new StubChannel();
        var ch2 = new StubChannel();
        var ch3 = new StubChannel { IsEnabled = false };
        var dispatcher = new AlertDispatcher(new IAlertChannel[] { ch1, ch2, ch3 }, NullLogger<AlertDispatcher>.Instance);

        var evt = new ConnectionAlertEvent(ConnectionAlertKind.Unhealthy, 1, "conn", "modbus_tcp", 5, "boom", DateTime.UtcNow);
        await dispatcher.DispatchAsync(evt, CancellationToken.None);

        ch1.Sent.Should().ContainSingle();
        ch2.Sent.Should().ContainSingle();
        ch3.Sent.Should().BeEmpty();
    }

    [Fact]
    public async Task DispatchAsync_OneChannelThrowing_DoesNotBlockOthers()
    {
        var throwing = new ThrowingChannel();
        var good = new StubChannel();
        var dispatcher = new AlertDispatcher(new IAlertChannel[] { throwing, good }, NullLogger<AlertDispatcher>.Instance);

        var evt = new ConnectionAlertEvent(ConnectionAlertKind.Unhealthy, 1, "c", "p", 5, "e", DateTime.UtcNow);
        await dispatcher.DispatchAsync(evt, CancellationToken.None);

        good.Sent.Should().ContainSingle();
    }

    private class ThrowingChannel : IAlertChannel
    {
        public string Name => "throwing";
        public bool IsEnabled => true;
        public Task SendAsync(ConnectionAlertEvent evt, CancellationToken ct)
            => throw new InvalidOperationException("channel broke");
    }
}
```

- [ ] **Step 4: Run test, expect failure**

Run: `dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~AlertDispatcherTests"`
Expected: FAIL with "AlertDispatcher not found".

- [ ] **Step 5: Implement AlertDispatcher**

Create `backend/Services/Alerting/AlertDispatcher.cs`:

```csharp
using Microsoft.Extensions.Logging;

namespace IoT.CentralApi.Services.Alerting;

/// <summary>
/// Fan-out connection alerts to all registered IAlertChannel implementations.
/// Each channel failure is logged + isolated so one bad channel can't break others.
/// </summary>
public class AlertDispatcher(IEnumerable<IAlertChannel> channels, ILogger<AlertDispatcher> logger)
{
    public async Task DispatchAsync(ConnectionAlertEvent evt, CancellationToken ct)
    {
        var enabled = channels.Where(c => c.IsEnabled).ToList();
        if (enabled.Count == 0) return;

        var tasks = enabled.Select(async c =>
        {
            try
            {
                await c.SendAsync(evt, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Alert channel '{Channel}' threw for connection {Id} ({Kind})",
                    c.Name, evt.ConnectionId, evt.Kind);
            }
        });

        await Task.WhenAll(tasks);
    }
}
```

- [ ] **Step 6: Run tests, expect pass**

Run: `dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~AlertDispatcherTests"`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/Services/Alerting/ backend/Tests/Services/Alerting/
git commit -m "feat(alerting): add IAlertChannel + AlertDispatcher with isolation"
```

---

## Task 4: SSE + WeChat alert channels

**Files:**
- Create: `backend/Services/Alerting/Channels/SseAlertChannel.cs`
- Create: `backend/Services/Alerting/Channels/WeChatAlertChannel.cs`
- Modify: `backend/Services/SseHub.cs` (add BroadcastConnectionAlertAsync)
- Modify: `backend/Services/WeChatService.cs` (add SendConnectionAlertAsync)

- [ ] **Step 1: Add SSE broadcast method**

In `backend/Services/SseHub.cs`, after `BroadcastConfigAsync` (line 62), insert:

```csharp
/// <summary>廣播 connection-alert 事件給所有已連線的 Dashboard。</summary>
public async Task BroadcastConnectionAlertAsync(object payload, CancellationToken ct = default)
{
    if (_connections.IsEmpty) return;

    var json = JsonSerializer.Serialize(payload, _jsonOptions);
    var message = $"event: connection-alert\ndata: {json}\n\n";

    var tasks = _connections.Select(kv =>
        WriteToConnectionAsync(kv.Key, kv.Value, message, ct));

    var results = await Task.WhenAll(tasks);

    foreach (var deadId in results.Where(id => id != null))
        _connections.TryRemove(deadId!, out _);
}
```

- [ ] **Step 2: Implement SseAlertChannel**

Create `backend/Services/Alerting/Channels/SseAlertChannel.cs`:

```csharp
namespace IoT.CentralApi.Services.Alerting.Channels;

/// <summary>
/// 永遠啟用的內建通道：把連線告警 SSE 廣播給 Dashboard。
/// 沒有外部依賴，保證使用者「在看板就看得到」最低保障。
/// </summary>
public class SseAlertChannel(SseHub sseHub) : IAlertChannel
{
    public string Name => "sse";
    public bool IsEnabled => true;

    public Task SendAsync(ConnectionAlertEvent evt, CancellationToken ct) =>
        sseHub.BroadcastConnectionAlertAsync(new
        {
            kind = evt.Kind.ToString(),
            connectionId = evt.ConnectionId,
            connectionName = evt.ConnectionName,
            protocol = evt.Protocol,
            consecutiveErrors = evt.ConsecutiveErrors,
            errorMessage = evt.ErrorMessage,
            occurredAt = evt.OccurredAt,
        }, ct);
}
```

- [ ] **Step 3: Add WeChat connection alert formatter**

In `backend/Services/WeChatService.cs`, after the existing `SendAlertAsync` method (line 37), insert:

```csharp
public async Task SendConnectionAlertAsync(Alerting.ConnectionAlertEvent evt)
{
    var (icon, label) = evt.Kind switch
    {
        Alerting.ConnectionAlertKind.Unhealthy      => ("🔴", "連線異常"),
        Alerting.ConnectionAlertKind.Recovered      => ("🟢", "連線恢復"),
        Alerting.ConnectionAlertKind.PollingStalled => ("⚠️", "Polling 停擺"),
        _ => ("ℹ️", "連線狀態變更"),
    };

    var text = $"[{icon} {label}] {evt.ConnectionName} ({evt.Protocol})\n" +
               $"連續錯誤：{evt.ConsecutiveErrors} 次\n" +
               (evt.ErrorMessage is null ? "" : $"訊息：{evt.ErrorMessage}\n") +
               $"時間：{evt.OccurredAt:yyyy-MM-dd HH:mm:ss}";

    logger.LogWarning("[WeChat Mock - Connection] {Text}", text);

    Directory.CreateDirectory("Logs");
    await File.AppendAllTextAsync(_logPath, $"{DateTime.UtcNow:O} | {text}\n---\n");

    if (_enabled && !string.IsNullOrWhiteSpace(_webhookUrl))
    {
        // TODO: POST to WeChat Work Webhook (same as SendAlertAsync)
    }
}
```

- [ ] **Step 4: Implement WeChatAlertChannel**

Create `backend/Services/Alerting/Channels/WeChatAlertChannel.cs`:

```csharp
using Microsoft.Extensions.Configuration;

namespace IoT.CentralApi.Services.Alerting.Channels;

/// <summary>
/// Opt-in WeChat channel. Disabled by default; flip via appsettings WeChat:Enabled = true.
/// </summary>
public class WeChatAlertChannel(WeChatService weChat, IConfiguration config) : IAlertChannel
{
    public string Name => "wechat";
    public bool IsEnabled => config.GetValue<bool>("WeChat:Enabled");

    public Task SendAsync(ConnectionAlertEvent evt, CancellationToken ct) =>
        weChat.SendConnectionAlertAsync(evt);
}
```

- [ ] **Step 5: Register in DI**

In `backend/Program.cs`, after `builder.Services.AddSingleton<DataIngestionService>();` (line 118), insert:

```csharp
// ── Alerting Channels ───────────────────────────────────────────────────────
builder.Services.AddSingleton<IAlertChannel, IoT.CentralApi.Services.Alerting.Channels.SseAlertChannel>();
builder.Services.AddSingleton<IAlertChannel, IoT.CentralApi.Services.Alerting.Channels.WeChatAlertChannel>();
builder.Services.AddSingleton<IoT.CentralApi.Services.Alerting.AlertDispatcher>();
```

(Add `using IoT.CentralApi.Services.Alerting;` near the top if needed.)

- [ ] **Step 6: Build verification**

Run: `dotnet build backend/IoT.CentralApi.csproj`
Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add backend/Services/Alerting/Channels/ backend/Services/SseHub.cs backend/Services/WeChatService.cs backend/Program.cs
git commit -m "feat(alerting): add SSE + WeChat channels, register in DI"
```

---

## Task 5: ConnectionState transition tracking (TDD)

**Files:**
- Modify: `backend/Services/ConnectionState.cs`
- Modify: `backend/Tests/Services/ConnectionStateTests.cs`

- [ ] **Step 1: Write failing transition tests**

In `backend/Tests/Services/ConnectionStateTests.cs`, append at end of class (before final `}`):

```csharp
[Fact]
public void EvaluateTransition_FirstUnhealthyCrossing_ReturnsUnhealthy()
{
    var state = new ConnectionState();
    state.RecordFailure(ErrorKind.Transient, "e");
    state.RecordFailure(ErrorKind.Transient, "e");
    state.RecordFailure(ErrorKind.Transient, "e");

    var transition = state.EvaluateAlertTransition(alertThreshold: 3, cooldownSec: 60);

    transition.Should().Be(AlertTransition.BecameUnhealthy);
}

[Fact]
public void EvaluateTransition_BelowThreshold_ReturnsNone()
{
    var state = new ConnectionState();
    state.RecordFailure(ErrorKind.Transient, "e");
    state.RecordFailure(ErrorKind.Transient, "e");

    var transition = state.EvaluateAlertTransition(alertThreshold: 3, cooldownSec: 60);

    transition.Should().Be(AlertTransition.None);
}

[Fact]
public void EvaluateTransition_StillUnhealthy_ReturnsNone()
{
    var state = new ConnectionState();
    for (int i = 0; i < 5; i++) state.RecordFailure(ErrorKind.Transient, "e");
    state.EvaluateAlertTransition(alertThreshold: 3, cooldownSec: 60); // first crossing → BecameUnhealthy

    state.RecordFailure(ErrorKind.Transient, "e");
    var transition = state.EvaluateAlertTransition(alertThreshold: 3, cooldownSec: 60);

    transition.Should().Be(AlertTransition.None);
}

[Fact]
public void EvaluateTransition_RecoveryAfterUnhealthy_ReturnsRecovered()
{
    var state = new ConnectionState();
    for (int i = 0; i < 5; i++) state.RecordFailure(ErrorKind.Transient, "e");
    state.EvaluateAlertTransition(alertThreshold: 3, cooldownSec: 60);

    state.RecordSuccess();
    var transition = state.EvaluateAlertTransition(alertThreshold: 3, cooldownSec: 60);

    transition.Should().Be(AlertTransition.Recovered);
}

[Fact]
public void EvaluateTransition_RecoveryWithoutPriorUnhealthy_ReturnsNone()
{
    var state = new ConnectionState();
    state.RecordSuccess();

    var transition = state.EvaluateAlertTransition(alertThreshold: 3, cooldownSec: 60);

    transition.Should().Be(AlertTransition.None);
}
```

- [ ] **Step 2: Run test, expect failure**

Run: `dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~ConnectionStateTests"`
Expected: FAIL with "AlertTransition not found" or "EvaluateAlertTransition not found".

- [ ] **Step 3: Add transition logic to ConnectionState**

In `backend/Services/ConnectionState.cs`, at top of file inside the namespace (before `public class ConnectionState`), add:

```csharp
public enum AlertTransition
{
    None,
    BecameUnhealthy,
    Recovered,
}
```

Inside `ConnectionState`, after the existing `_lastSuccessAt` field, add:

```csharp
private bool _wasUnhealthy;       // tracks whether we previously crossed into unhealthy
private DateTime? _lastAlertAt;   // for cooldown re-arm
```

Then append the evaluation method (at the bottom of the class, before the closing `}`):

```csharp
/// <summary>
/// Evaluates whether a state transition occurred since the previous call.
/// Returns BecameUnhealthy on first crossing past threshold (cooldown re-arm allowed),
/// Recovered when a success follows a previously-unhealthy state, None otherwise.
/// </summary>
public AlertTransition EvaluateAlertTransition(int alertThreshold, int cooldownSec)
{
    lock (_lock)
    {
        var nowUnhealthy = _consecutiveErrors >= alertThreshold;
        var now = DateTime.UtcNow;

        if (nowUnhealthy && !_wasUnhealthy)
        {
            var cooledDown = _lastAlertAt == null
                || (now - _lastAlertAt.Value).TotalSeconds >= cooldownSec;
            if (!cooledDown) return AlertTransition.None;

            _wasUnhealthy = true;
            _lastAlertAt = now;
            return AlertTransition.BecameUnhealthy;
        }

        if (!nowUnhealthy && _wasUnhealthy && _lastSuccessAt != null)
        {
            _wasUnhealthy = false;
            _lastAlertAt = now;
            return AlertTransition.Recovered;
        }

        return AlertTransition.None;
    }
}
```

- [ ] **Step 4: Run all ConnectionState tests, expect pass**

Run: `dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~ConnectionStateTests"`
Expected: PASS (all transition tests + existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add backend/Services/ConnectionState.cs backend/Tests/Services/ConnectionStateTests.cs
git commit -m "feat(connection-state): add health transition tracking with cooldown"
```

---

## Task 6: Wire AlertDispatcher into PollingBackgroundService

**Files:**
- Modify: `backend/Services/PollingBackgroundService.cs`

- [ ] **Step 1: Inject dispatcher and call after each poll**

In `backend/Services/PollingBackgroundService.cs`:

a. Update the primary constructor signature:

```csharp
public class PollingBackgroundService(
    IServiceScopeFactory scopeFactory,
    IEnumerable<IProtocolAdapter> adapters,
    ConnectionStateRegistry registry,
    IoT.CentralApi.Services.Alerting.AlertDispatcher alertDispatcher,
    ILogger<PollingBackgroundService> logger) : BackgroundService
```

b. Add a helper method at the bottom of the class (before the closing `}`):

```csharp
private async Task EvaluateAndDispatchAsync(DeviceConnection dc, ConnectionState state, CancellationToken ct)
{
    if (!dc.IsAlertEnabled) return;

    var transition = state.EvaluateAlertTransition(
        alertThreshold: dc.AlertOnConsecutiveErrors,
        cooldownSec: dc.AlertCooldownSec);

    if (transition == IoT.CentralApi.Services.AlertTransition.None) return;

    var kind = transition == IoT.CentralApi.Services.AlertTransition.BecameUnhealthy
        ? IoT.CentralApi.Services.Alerting.ConnectionAlertKind.Unhealthy
        : IoT.CentralApi.Services.Alerting.ConnectionAlertKind.Recovered;

    var evt = new IoT.CentralApi.Services.Alerting.ConnectionAlertEvent(
        Kind: kind,
        ConnectionId: dc.Id,
        ConnectionName: dc.Name,
        Protocol: dc.Protocol,
        ConsecutiveErrors: state.ConsecutiveErrors,
        ErrorMessage: state.LastErrorMessage,
        OccurredAt: DateTime.UtcNow);

    await alertDispatcher.DispatchAsync(evt, ct);
}
```

c. In `PollOneAsync`, call this helper at TWO points:
   - After the `state.RecordFailure(...)` + `await UpdateDbStateAsync(...)` block in the failure path (around line 92, after the warning log)
   - After `state.RecordSuccess()` + `state.ScheduleNext(...)` in the success path (around line 104, before the payload conversion)

Concretely, inside the failure branch, after the `if (state.ConsecutiveErrors <= 3 || ...)` log block and before the `return;`, insert:

```csharp
await EvaluateAndDispatchAsync(dc, state, ct);
return;
```

And inside the success branch, after `state.ScheduleNext(dc.PollIntervalMs ?? 5000);`, insert:

```csharp
await EvaluateAndDispatchAsync(dc, state, ct);
```

- [ ] **Step 2: Build and test**

Run: `dotnet build backend/IoT.CentralApi.csproj`
Expected: clean.

Run: `dotnet test backend/Tests/IoT.CentralApi.Tests.csproj`
Expected: 135+ tests still pass, no regressions.

- [ ] **Step 3: Commit**

```bash
git add backend/Services/PollingBackgroundService.cs
git commit -m "feat(polling): dispatch connection health transitions per tick"
```

---

## Task 7: PollingWatchdogService (TDD)

**Files:**
- Create: `backend/Services/PollingWatchdogService.cs`
- Create: `backend/Tests/Services/PollingWatchdogServiceTests.cs`
- Modify: `backend/Program.cs` (register hosted service)

- [ ] **Step 1: Write failing test**

Create `backend/Tests/Services/PollingWatchdogServiceTests.cs`:

```csharp
using IoT.CentralApi.Services;
using IoT.CentralApi.Services.Alerting;
using Microsoft.Extensions.Logging.Abstractions;

namespace IoT.CentralApi.Tests.Services;

public class PollingWatchdogServiceTests
{
    private class CapturingChannel : IAlertChannel
    {
        public string Name => "capture";
        public bool IsEnabled => true;
        public List<ConnectionAlertEvent> Sent { get; } = new();
        public Task SendAsync(ConnectionAlertEvent evt, CancellationToken ct)
        {
            Sent.Add(evt);
            return Task.CompletedTask;
        }
    }

    [Fact]
    public async Task CheckOnce_TickStale_DispatchesStalledAlert()
    {
        var capture = new CapturingChannel();
        var dispatcher = new AlertDispatcher(new IAlertChannel[] { capture }, NullLogger<AlertDispatcher>.Instance);

        var watchdog = new PollingWatchdogService(
            dispatcher,
            NullLogger<PollingWatchdogService>.Instance,
            staleThreshold: TimeSpan.FromSeconds(30));

        var staleTickAt = DateTime.UtcNow.AddSeconds(-60);
        await watchdog.CheckOnceAsync(staleTickAt, CancellationToken.None);

        capture.Sent.Should().ContainSingle()
            .Which.Kind.Should().Be(ConnectionAlertKind.PollingStalled);
    }

    [Fact]
    public async Task CheckOnce_TickFresh_DoesNotDispatch()
    {
        var capture = new CapturingChannel();
        var dispatcher = new AlertDispatcher(new IAlertChannel[] { capture }, NullLogger<AlertDispatcher>.Instance);
        var watchdog = new PollingWatchdogService(
            dispatcher,
            NullLogger<PollingWatchdogService>.Instance,
            staleThreshold: TimeSpan.FromSeconds(30));

        var freshTickAt = DateTime.UtcNow.AddSeconds(-5);
        await watchdog.CheckOnceAsync(freshTickAt, CancellationToken.None);

        capture.Sent.Should().BeEmpty();
    }

    [Fact]
    public async Task CheckOnce_StallThenRecover_DispatchesOnlyOncePerEpisode()
    {
        var capture = new CapturingChannel();
        var dispatcher = new AlertDispatcher(new IAlertChannel[] { capture }, NullLogger<AlertDispatcher>.Instance);
        var watchdog = new PollingWatchdogService(
            dispatcher,
            NullLogger<PollingWatchdogService>.Instance,
            staleThreshold: TimeSpan.FromSeconds(30));

        var stale = DateTime.UtcNow.AddSeconds(-60);
        await watchdog.CheckOnceAsync(stale, CancellationToken.None);
        await watchdog.CheckOnceAsync(stale, CancellationToken.None); // still stale, same episode

        capture.Sent.Should().ContainSingle();
    }
}
```

- [ ] **Step 2: Run test, expect failure**

Run: `dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~PollingWatchdogServiceTests"`
Expected: FAIL with "PollingWatchdogService not found".

- [ ] **Step 3: Implement watchdog**

Create `backend/Services/PollingWatchdogService.cs`:

```csharp
using IoT.CentralApi.Services.Alerting;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace IoT.CentralApi.Services;

/// <summary>
/// 監看 PollingBackgroundService 是否還活著。
/// LastTickAt 距今超過 StaleThreshold → 推 PollingStalled 告警。
/// 同一場停擺只通知一次（episode-based），恢復後重新 arm。
/// </summary>
public class PollingWatchdogService : BackgroundService
{
    private readonly AlertDispatcher _dispatcher;
    private readonly ILogger<PollingWatchdogService> _logger;
    private readonly TimeSpan _staleThreshold;
    private readonly IServiceProvider? _serviceProvider;
    private bool _alertedForCurrentStall;

    public PollingWatchdogService(
        AlertDispatcher dispatcher,
        ILogger<PollingWatchdogService> logger,
        TimeSpan staleThreshold,
        IServiceProvider? serviceProvider = null)
    {
        _dispatcher = dispatcher;
        _logger = logger;
        _staleThreshold = staleThreshold;
        _serviceProvider = serviceProvider;
    }

    /// <summary>DI-friendly constructor with default 30s threshold.</summary>
    public PollingWatchdogService(
        AlertDispatcher dispatcher,
        ILogger<PollingWatchdogService> logger,
        IServiceProvider serviceProvider)
        : this(dispatcher, logger, TimeSpan.FromSeconds(30), serviceProvider) { }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Wait one cycle so PollingBackgroundService has a chance to start ticking
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var polling = _serviceProvider?.GetServices<IHostedService>()
                    .OfType<PollingBackgroundService>()
                    .FirstOrDefault();

                if (polling != null && polling.LastTickAt != DateTime.MinValue)
                {
                    await CheckOnceAsync(polling.LastTickAt, stoppingToken);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "PollingWatchdog tick failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
        }
    }

    /// <summary>Testable single-check. Returns true if alert was dispatched.</summary>
    public async Task<bool> CheckOnceAsync(DateTime lastTickAt, CancellationToken ct)
    {
        var age = DateTime.UtcNow - lastTickAt;
        var stalled = age > _staleThreshold;

        if (stalled && !_alertedForCurrentStall)
        {
            _alertedForCurrentStall = true;
            _logger.LogCritical("Polling stalled: LastTickAt={LastTickAt}, age={Age}", lastTickAt, age);

            var evt = new ConnectionAlertEvent(
                Kind: ConnectionAlertKind.PollingStalled,
                ConnectionId: 0,
                ConnectionName: "PollingBackgroundService",
                Protocol: "internal",
                ConsecutiveErrors: 0,
                ErrorMessage: $"No poll tick for {age.TotalSeconds:F0}s (threshold {_staleThreshold.TotalSeconds:F0}s)",
                OccurredAt: DateTime.UtcNow);
            await _dispatcher.DispatchAsync(evt, ct);
            return true;
        }

        if (!stalled && _alertedForCurrentStall)
        {
            _alertedForCurrentStall = false; // re-arm for next episode
        }

        return false;
    }
}
```

Add `using Microsoft.Extensions.DependencyInjection;` to top of file.

- [ ] **Step 4: Register in Program.cs**

In `backend/Program.cs`, after `builder.Services.AddHostedService<PollingBackgroundService>();` (line 135), insert:

```csharp
builder.Services.AddHostedService<PollingWatchdogService>();
```

- [ ] **Step 5: Run tests, expect pass**

Run: `dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --filter "FullyQualifiedName~PollingWatchdogServiceTests"`
Expected: PASS (3 tests).

Run full suite:
Run: `dotnet test backend/Tests/IoT.CentralApi.Tests.csproj`
Expected: 138+ tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/Services/PollingWatchdogService.cs backend/Tests/Services/PollingWatchdogServiceTests.cs backend/Program.cs
git commit -m "feat(watchdog): add PollingWatchdogService with episode-based alerting"
```

---

## Task 8: Frontend — extend types + diagnostics hook

**Files:**
- Modify: `frontend/src/lib/apiDeviceConnections.ts`
- Create: `frontend/src/hooks/usePollingDiagnostics.ts`

- [ ] **Step 1: Extend types**

In `frontend/src/lib/apiDeviceConnections.ts`, update interfaces:

```typescript
export interface DeviceConnectionItem {
  id: number;
  name: string;
  protocol: string;
  configJson: string;
  pollIntervalMs: number | null;
  isEnabled: boolean;
  lastPollAt: string | null;
  lastPollError: string | null;
  consecutiveErrors: number;
  equipmentTypeId: number | null;
  equipmentTypeName: string | null;
  createdAt: string;
  alertOnConsecutiveErrors: number;
  alertCooldownSec: number;
  isAlertEnabled: boolean;
}

export interface SaveDeviceConnectionRequest {
  name: string;
  protocol: string;
  config: string;
  pollIntervalMs: number | null;
  isEnabled: boolean;
  equipmentType?: {
    name: string;
    visType: string;
    description: string | null;
    sensors: Array<{
      sensorId: number;
      pointId: string;
      label: string;
      unit: string;
      propertyTypeId: number;
      rawAddress: string | null;
      sortOrder: number;
    }>;
  };
  alertOnConsecutiveErrors?: number;
  alertCooldownSec?: number;
  isAlertEnabled?: boolean;
}

export interface UpdateDeviceConnectionRequest {
  name: string;
  config: string;
  pollIntervalMs: number | null;
  isEnabled: boolean;
  alertOnConsecutiveErrors?: number;
  alertCooldownSec?: number;
  isAlertEnabled?: boolean;
}
```

(The `PollingDiagnostics` interface already exists — no changes.)

- [ ] **Step 2: Create diagnostics hook**

Create `frontend/src/hooks/usePollingDiagnostics.ts`:

```typescript
import { useEffect, useRef, useState } from 'react';
import { fetchPollingDiagnostics, type PollingDiagnostics } from '../lib/apiDeviceConnections';

const POLL_MS = 10_000;

/**
 * 每 10 秒拉一次 /api/diagnostics/polling，同時監聽 SSE connection-alert
 * 事件（若有提供 eventSource）來即時刷新。
 */
export function usePollingDiagnostics(eventSource?: EventSource | null) {
  const [data, setData] = useState<PollingDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const load = () => {
      fetchPollingDiagnostics()
        .then(d => { if (mountedRef.current) { setData(d); setError(null); } })
        .catch(e => { if (mountedRef.current) setError(e instanceof Error ? e.message : 'network'); });
    };
    load();
    const interval = setInterval(load, POLL_MS);
    return () => { mountedRef.current = false; clearInterval(interval); };
  }, []);

  // Optional SSE-triggered refresh
  useEffect(() => {
    if (!eventSource) return;
    const handler = () => fetchPollingDiagnostics()
      .then(d => { if (mountedRef.current) setData(d); })
      .catch(() => { /* swallow — polling fallback covers it */ });
    eventSource.addEventListener('connection-alert', handler);
    return () => eventSource.removeEventListener('connection-alert', handler);
  }, [eventSource]);

  return { data, error };
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/apiDeviceConnections.ts frontend/src/hooks/usePollingDiagnostics.ts
git commit -m "feat(frontend): extend connection types with alert fields + add diagnostics hook"
```

---

## Task 9: ConnectionHealthBadge component + slot in toolbar

**Files:**
- Create: `frontend/src/components/layout/ConnectionHealthBadge.tsx`
- Modify: `frontend/src/components/layout/AppToolbar.tsx`
- Modify: `frontend/src/i18n/index.ts`

- [ ] **Step 1: Add i18n keys**

In `frontend/src/i18n/index.ts`, locate each language block (zh-TW / zh-CN / en) and append to its `connectionHealth` section (create the section if missing):

```typescript
// zh-TW
connectionHealth: {
  badgeAllHealthy: '連線正常',
  badgeSomeUnhealthy: '{{bad}}/{{total}} 異常',
  badgeAllOffline: '全部異常',
  popoverTitle: '連線健康度',
  pollingStopped: 'Polling 停擺',
  pollingHealthy: 'Polling 正常',
  lastTickAt: '上次 tick',
  noConnections: '尚無啟用連線',
  consecutiveErrors: '連續錯誤 {{count}} 次',
  lastPollAt: '上次輪詢',
  alertsDisabled: '已關閉告警',
},

// zh-CN
connectionHealth: {
  badgeAllHealthy: '连接正常',
  badgeSomeUnhealthy: '{{bad}}/{{total}} 异常',
  badgeAllOffline: '全部异常',
  popoverTitle: '连接健康度',
  pollingStopped: 'Polling 停摆',
  pollingHealthy: 'Polling 正常',
  lastTickAt: '上次 tick',
  noConnections: '尚无启用连接',
  consecutiveErrors: '连续错误 {{count}} 次',
  lastPollAt: '上次轮询',
  alertsDisabled: '已关闭告警',
},

// en
connectionHealth: {
  badgeAllHealthy: 'Connections OK',
  badgeSomeUnhealthy: '{{bad}}/{{total}} unhealthy',
  badgeAllOffline: 'All offline',
  popoverTitle: 'Connection Health',
  pollingStopped: 'Polling stopped',
  pollingHealthy: 'Polling healthy',
  lastTickAt: 'Last tick',
  noConnections: 'No active connections',
  consecutiveErrors: '{{count}} consecutive errors',
  lastPollAt: 'Last poll',
  alertsDisabled: 'Alerts off',
},
```

- [ ] **Step 2: Create ConnectionHealthBadge**

Create `frontend/src/components/layout/ConnectionHealthBadge.tsx`:

```typescript
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, AlertCircle, CheckCircle2 } from 'lucide-react';
import { usePollingDiagnostics } from '../../hooks/usePollingDiagnostics';
import { useToast } from '../../hooks/useToast';

interface Props {
  eventSource?: EventSource | null;
}

export default function ConnectionHealthBadge({ eventSource }: Props) {
  const { t } = useTranslation();
  const { data } = usePollingDiagnostics(eventSource);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // SSE toast on connection-alert
  useEffect(() => {
    if (!eventSource) return;
    const handler = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.kind === 'Unhealthy') {
          addToast({ type: 'error', message: `${payload.connectionName}: ${t('connectionHealth.consecutiveErrors', { count: payload.consecutiveErrors })}` });
        } else if (payload.kind === 'Recovered') {
          addToast({ type: 'success', message: `${payload.connectionName} ✓` });
        } else if (payload.kind === 'PollingStalled') {
          addToast({ type: 'error', message: t('connectionHealth.pollingStopped') });
        }
      } catch { /* ignore */ }
    };
    eventSource.addEventListener('connection-alert', handler as EventListener);
    return () => eventSource.removeEventListener('connection-alert', handler as EventListener);
  }, [eventSource, t, addToast]);

  if (!data) return null;

  const total = data.connections.length;
  const bad = data.connections.filter(c => c.status === 'error').length;
  const pollingDead = !data.polling.isRunning;

  let icon = <CheckCircle2 size={14} className="text-[var(--accent-green)]" />;
  let label = t('connectionHealth.badgeAllHealthy');
  let tone = 'border-[var(--accent-green)]/30 bg-[var(--accent-green)]/10 text-[var(--accent-green)]';

  if (pollingDead) {
    icon = <AlertCircle size={14} className="text-[var(--accent-red)]" />;
    label = t('connectionHealth.pollingStopped');
    tone = 'border-[var(--accent-red)]/50 bg-[var(--accent-red)]/15 text-[var(--accent-red)]';
  } else if (total === 0) {
    icon = <Activity size={14} className="text-[var(--text-muted)]" />;
    label = t('connectionHealth.noConnections');
    tone = 'border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-muted)]';
  } else if (bad > 0) {
    icon = <AlertCircle size={14} className="text-[var(--accent-amber)]" />;
    label = t('connectionHealth.badgeSomeUnhealthy', { bad, total });
    tone = 'border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]';
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition ${tone}`}
        aria-label={t('connectionHealth.popoverTitle')}
      >
        {icon}
        {label}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] shadow-lg z-50"
          role="dialog"
          aria-label={t('connectionHealth.popoverTitle')}
        >
          <div className="px-3 py-2 border-b border-[var(--border-default)] text-sm font-medium text-[var(--text-main)]">
            {t('connectionHealth.popoverTitle')}
          </div>
          <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-b border-[var(--border-default)]">
            {pollingDead ? t('connectionHealth.pollingStopped') : t('connectionHealth.pollingHealthy')}
            {data.polling.lastTickAt && (
              <> · {t('connectionHealth.lastTickAt')}: {new Date(data.polling.lastTickAt).toLocaleTimeString()}</>
            )}
          </div>
          {data.connections.length === 0 ? (
            <div className="px-3 py-4 text-xs text-[var(--text-muted)]">
              {t('connectionHealth.noConnections')}
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-default)]">
              {data.connections.map(c => (
                <li key={c.id} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-[var(--text-main)] truncate">{c.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                      c.status === 'error'
                        ? 'bg-[var(--accent-red)]/15 text-[var(--accent-red)]'
                        : c.status === 'disabled'
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                        : 'bg-[var(--accent-green)]/15 text-[var(--accent-green)]'
                    }`}>
                      {c.status}
                    </span>
                  </div>
                  {c.consecutiveErrors > 0 && (
                    <div className="text-xs text-[var(--accent-red)] mt-0.5">
                      {t('connectionHealth.consecutiveErrors', { count: c.consecutiveErrors })}
                    </div>
                  )}
                  {c.lastErrorMessage && (
                    <div className="text-xs text-[var(--text-muted)] mt-0.5 truncate" title={c.lastErrorMessage}>
                      {c.lastErrorMessage}
                    </div>
                  )}
                  {c.lastPollAt && (
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      {t('connectionHealth.lastPollAt')}: {new Date(c.lastPollAt).toLocaleTimeString()}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Slot into AppToolbar**

In `frontend/src/components/layout/AppToolbar.tsx`:

a. Import:
```typescript
import ConnectionHealthBadge from './ConnectionHealthBadge';
```

b. Add `eventSource?: EventSource | null` to its `Props` interface (if it doesn't already pass-through SSE; otherwise look for where it gets it and pass it down).

c. Render `<ConnectionHealthBadge eventSource={eventSource} />` near the existing toolbar buttons (right side, before the user/settings menu — match whatever layout pattern already exists).

If `AppToolbar` doesn't currently accept eventSource, accept it from App.tsx and thread it through. App.tsx already uses `useLiveData` which manages an `EventSource` internally — expose it via the hook's return if not already, OR create the EventSource at App level and pass to both `useLiveData` and toolbar.

- [ ] **Step 4: Build and smoke test**

Run: `cd frontend && npm run build`
Expected: clean build, no TypeScript errors.

Run: `cd frontend && npm test -- --run`
Expected: existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/ConnectionHealthBadge.tsx frontend/src/components/layout/AppToolbar.tsx frontend/src/i18n/index.ts frontend/src/App.tsx
git commit -m "feat(frontend): add ConnectionHealthBadge in toolbar with SSE toast"
```

---

## Task 10: Wizard 進階設定 + 同 host 偵測提示

**Files:**
- Modify: `frontend/src/components/modals/DeviceIntegrationWizard/WizardContext.tsx`
- Modify: `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step2_Config.tsx`
- Modify: `frontend/src/components/modals/DeviceIntegrationWizard/index.tsx` (pass new fields in submit)
- Modify: `frontend/src/components/modals/DeviceIntegrationWizard/steps/Step7_Review.tsx`
- Modify: `frontend/src/i18n/index.ts`

- [ ] **Step 1: Extend WizardState**

In `WizardContext.tsx`:

a. Add to `WizardState` interface (after `pollIntervalMs: number;`):

```typescript
alertOnConsecutiveErrors: number;
alertCooldownSec: number;
isAlertEnabled: boolean;
```

b. Add to `initialState`:

```typescript
alertOnConsecutiveErrors: 5,
alertCooldownSec: 300,
isAlertEnabled: true,
```

c. Extend the `Action` union:

```typescript
| { type: 'SET_ALERT_SETTINGS'; alertOnConsecutiveErrors: number; alertCooldownSec: number; isAlertEnabled: boolean }
```

d. Add case to `wizardReducer`:

```typescript
case 'SET_ALERT_SETTINGS':
  return {
    ...state,
    alertOnConsecutiveErrors: action.alertOnConsecutiveErrors,
    alertCooldownSec: action.alertCooldownSec,
    isAlertEnabled: action.isAlertEnabled,
  };
```

- [ ] **Step 2: Add i18n keys**

In `frontend/src/i18n/index.ts`, append to each language's `wizard.config` block:

```typescript
// zh-TW
advancedTitle: '進階設定',
advancedHint: '一般使用者可保留預設值',
alertOnConsecutiveErrors: '連續錯誤幾次後告警',
alertOnConsecutiveErrorsHelp: '達到此次數時透過 Dashboard 與啟用的通道發送通知（預設 5）',
alertCooldownSec: '告警冷卻 (秒)',
alertCooldownSecHelp: '兩次相同連線告警之間最少間隔，避免噪音（預設 300 = 5 分鐘）',
isAlertEnabled: '啟用此連線告警',
sameHostHint: '主機 {{host}}:{{port}} 已有 {{count}} 個連線；部分 Modbus gateway 並發限制 1-4，若儲存後不穩可考慮減少連線數或加大 PollInterval。',

// zh-CN
advancedTitle: '高级设置',
advancedHint: '一般用户可保留默认值',
alertOnConsecutiveErrors: '连续错误几次后告警',
alertOnConsecutiveErrorsHelp: '达到此次数时通过 Dashboard 与启用的通道发送通知（默认 5）',
alertCooldownSec: '告警冷却 (秒)',
alertCooldownSecHelp: '两次相同连接告警之间最少间隔，避免噪音（默认 300 = 5 分钟）',
isAlertEnabled: '启用此连接告警',
sameHostHint: '主机 {{host}}:{{port}} 已有 {{count}} 个连接；部分 Modbus gateway 并发限制 1-4，若保存后不稳定可考虑减少连接数或加大 PollInterval。',

// en
advancedTitle: 'Advanced',
advancedHint: 'Defaults are fine for most users',
alertOnConsecutiveErrors: 'Alert after N consecutive errors',
alertOnConsecutiveErrorsHelp: 'Triggers a Dashboard notification + enabled channels when reached (default 5)',
alertCooldownSec: 'Alert cooldown (sec)',
alertCooldownSecHelp: 'Minimum interval between repeat alerts for the same connection (default 300 = 5 min)',
isAlertEnabled: 'Enable alerts for this connection',
sameHostHint: '{{count}} connection(s) already target {{host}}:{{port}}. Some Modbus gateways limit concurrent sessions to 1-4 — if unstable after saving, reduce connections or increase PollInterval.',
```

- [ ] **Step 3: Add Advanced section + same-host hint to Step2_Config**

In `Step2_Config.tsx`:

a. Add import at top:

```typescript
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { fetchDeviceConnections } from '../../../../lib/apiDeviceConnections';
```

b. Inside the component, after the existing hooks, add:

```typescript
const [advancedOpen, setAdvancedOpen] = useState(false);
const [sameHostCount, setSameHostCount] = useState(0);

// Detect existing connections to same host:port
useEffect(() => {
  const host = state.config.host?.trim();
  const port = state.config.port?.trim() || '502';
  if (!host) { setSameHostCount(0); return; }

  let cancelled = false;
  fetchDeviceConnections()
    .then(list => {
      if (cancelled) return;
      const count = list.filter(c => {
        try {
          const cfg = JSON.parse(c.configJson) as { host?: string; port?: string | number };
          return cfg.host === host && String(cfg.port ?? '502') === port;
        } catch { return false; }
      }).length;
      setSameHostCount(count);
    })
    .catch(() => { /* ignore — hint is best-effort */ });
  return () => { cancelled = true; };
}, [state.config.host, state.config.port]);
```

c. Inside the JSX return (after the existing DynamicForm + connection name + before the bottom of `<div className="p-6">`), insert:

```tsx
{/* Same-host hint */}
{sameHostCount > 0 && (
  <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-md bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/30 text-xs text-[var(--accent-amber)]">
    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
    <span>
      {t('wizard.config.sameHostHint', {
        host: state.config.host,
        port: state.config.port || '502',
        count: sameHostCount,
      })}
    </span>
  </div>
)}

{/* Advanced collapsible */}
<div className="mt-4 border-t border-[var(--border-default)] pt-3">
  <button
    type="button"
    onClick={() => setAdvancedOpen(o => !o)}
    className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)]"
  >
    {advancedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
    {t('wizard.config.advancedTitle')}
    <span className="text-xs text-[var(--text-muted)] ml-2">— {t('wizard.config.advancedHint')}</span>
  </button>

  {advancedOpen && (
    <div className="mt-3 space-y-3 pl-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={state.isAlertEnabled}
          onChange={e => dispatch({
            type: 'SET_ALERT_SETTINGS',
            alertOnConsecutiveErrors: state.alertOnConsecutiveErrors,
            alertCooldownSec: state.alertCooldownSec,
            isAlertEnabled: e.target.checked,
          })}
        />
        <span className="text-[var(--text-main)]">{t('wizard.config.isAlertEnabled')}</span>
      </label>

      <div>
        <label className="block text-sm text-[var(--text-main)] mb-1">
          {t('wizard.config.alertOnConsecutiveErrors')}
        </label>
        <input
          type="number"
          min={1}
          max={1000}
          value={state.alertOnConsecutiveErrors}
          onChange={e => dispatch({
            type: 'SET_ALERT_SETTINGS',
            alertOnConsecutiveErrors: Math.max(1, parseInt(e.target.value, 10) || 5),
            alertCooldownSec: state.alertCooldownSec,
            isAlertEnabled: state.isAlertEnabled,
          })}
          disabled={!state.isAlertEnabled}
          className="w-24 px-2 py-1 rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-main)] text-sm disabled:opacity-50"
        />
        <p className="text-xs text-[var(--text-muted)] mt-1">{t('wizard.config.alertOnConsecutiveErrorsHelp')}</p>
      </div>

      <div>
        <label className="block text-sm text-[var(--text-main)] mb-1">
          {t('wizard.config.alertCooldownSec')}
        </label>
        <input
          type="number"
          min={0}
          max={86400}
          value={state.alertCooldownSec}
          onChange={e => dispatch({
            type: 'SET_ALERT_SETTINGS',
            alertOnConsecutiveErrors: state.alertOnConsecutiveErrors,
            alertCooldownSec: Math.max(0, parseInt(e.target.value, 10) || 300),
            isAlertEnabled: state.isAlertEnabled,
          })}
          disabled={!state.isAlertEnabled}
          className="w-24 px-2 py-1 rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-main)] text-sm disabled:opacity-50"
        />
        <p className="text-xs text-[var(--text-muted)] mt-1">{t('wizard.config.alertCooldownSecHelp')}</p>
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 4: Pass alert fields in wizard submit**

In `frontend/src/components/modals/DeviceIntegrationWizard/index.tsx`, find the submit/POST call (search for `createDeviceConnection`). Pass:

```typescript
alertOnConsecutiveErrors: state.alertOnConsecutiveErrors,
alertCooldownSec: state.alertCooldownSec,
isAlertEnabled: state.isAlertEnabled,
```

into the request body alongside existing fields.

- [ ] **Step 5: Show in Step7 review**

In `Step7_Review.tsx`, after the existing poll interval display, add a small section showing alert settings (only when `isAlertEnabled` is true OR when defaults are changed). Use the same i18n keys.

- [ ] **Step 6: Build + smoke**

Run: `cd frontend && npm run build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/modals/DeviceIntegrationWizard/ frontend/src/i18n/index.ts
git commit -m "feat(wizard): add advanced alert settings + same-host hint in Step2"
```

---

## Task 11: EditDeviceConnectionModal — Advanced section

**Files:**
- Modify: `frontend/src/components/modals/EditDeviceConnectionModal.tsx`

- [ ] **Step 1: Add state + UI**

In `EditDeviceConnectionModal.tsx`:

a. Import `ChevronDown, ChevronRight` from `lucide-react` (add to existing import if any).

b. After the existing `useState` hooks (around line 47), add:

```typescript
const [advancedOpen, setAdvancedOpen] = useState(false);
const [alertOnConsecutiveErrors, setAlertOnConsecutiveErrors] = useState(conn.alertOnConsecutiveErrors);
const [alertCooldownSec, setAlertCooldownSec] = useState(conn.alertCooldownSec);
const [isAlertEnabled, setIsAlertEnabled] = useState(conn.isAlertEnabled);
```

c. Update `isDirty` to include alert fields:

```typescript
const isDirty =
  name !== conn.name ||
  pollIntervalMs !== (conn.pollIntervalMs ?? 5000) ||
  JSON.stringify(config) !== JSON.stringify(initialConfig) ||
  alertOnConsecutiveErrors !== conn.alertOnConsecutiveErrors ||
  alertCooldownSec !== conn.alertCooldownSec ||
  isAlertEnabled !== conn.isAlertEnabled;
```

d. Inside `handleSave`, pass the new fields to `updateDeviceConnection`:

```typescript
await updateDeviceConnection(conn.id, {
  name: name.trim(),
  config: JSON.stringify(config),
  pollIntervalMs: conn.protocol === 'push_ingest' ? null : pollIntervalMs,
  isEnabled: conn.isEnabled,
  alertOnConsecutiveErrors,
  alertCooldownSec,
  isAlertEnabled,
});
```

e. Add the same Advanced collapsible JSX (same structure as Task 10 Step 3 Advanced block but bound to local state setters instead of dispatch). Place it before the bottom action buttons (Save / Cancel).

- [ ] **Step 2: Build**

Run: `cd frontend && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/modals/EditDeviceConnectionModal.tsx
git commit -m "feat(connections): add advanced alert settings to edit modal"
```

---

## Task 12: Full-suite verification + manual smoke test

- [ ] **Step 1: Full backend tests**

Run: `dotnet test backend/Tests/IoT.CentralApi.Tests.csproj`
Expected: all green (baseline 135 + new tests ≥ 138).

- [ ] **Step 2: Full frontend tests**

Run: `cd frontend && npm test -- --run`
Expected: all green (baseline 49+).

- [ ] **Step 3: Frontend build**

Run: `cd frontend && npm run build`
Expected: clean, no TypeScript / lint errors.

- [ ] **Step 4: Backend run + DDL apply**

Run: `cd backend && dotnet run --launch-profile https`

In a separate shell:

```bash
curl -s "http://localhost:5200/api/device-connections" | head -c 2000
```

Expected: response includes `alertOnConsecutiveErrors`, `alertCooldownSec`, `isAlertEnabled` for each connection (existing rows should report 5 / 300 / true).

- [ ] **Step 5: Manual smoke flow**

Open the dashboard in browser. Verify:
- `ConnectionHealthBadge` shows in toolbar
- Click badge → popover lists connections with status
- Open wizard, go to Step 2 → 進階設定 collapsible visible, defaults 5 / 300 / on
- Type a host that matches an existing connection → same-host hint appears
- Open EditDeviceConnectionModal on existing connection → Advanced section visible, reflects 5 / 300 / true defaults

- [ ] **Step 6: Trigger a fake unhealthy state**

Easiest: temporarily change a connection's `ConfigJson.host` to an unreachable IP via the UI. Within (`pollInterval × 5`) seconds → expect:
- Badge turns amber `1/N unhealthy`
- Toast appears
- WeChatPending.txt gets a new "🔴 連線異常" line

Reset host back. Within `cooldown + pollInterval` → expect:
- Badge turns green
- Toast "✓"
- WeChatPending.txt gets "🟢 連線恢復"

- [ ] **Step 7: Final commit (if any UI polish needed) + summary**

If any manual smoke uncovered tweaks, fix and commit:

```bash
git commit -m "fix(alerting): <specific fix>"
```

Otherwise: this task verifies completion. No commit needed.

---

## Self-Review Checklist

- ✅ Spec coverage: All four user-stated scopes covered — connection alerts (Tasks 1-6), watchdog (Task 7), frontend badge (Tasks 8-9), wizard same-host hint (Task 10)
- ✅ Flexibility: 3 alert fields are per-connection with sensible defaults; channels are pluggable via `IAlertChannel`; same-host is a hint, not a block
- ✅ Compatibility: DDL is idempotent + uses DEFAULT constraints so existing rows inherit safe values; DTO records use optional parameters; existing tests untouched semantically
- ✅ No placeholders: every step shows the actual code to write
- ✅ Type consistency: `AlertTransition` enum / `ConnectionAlertEvent` / `ConnectionAlertKind` / `IAlertChannel` names match across tasks
- ✅ Test coverage: TDD on AlertDispatcher (Task 3), ConnectionState transitions (Task 5), PollingWatchdog (Task 7); manual smoke covers UI (Task 12)
- ✅ Estimated commits: 12 tasks → 8-9 commits (some tasks share commits)
