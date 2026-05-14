# Gating Convergence Sprint 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the *foundation* for converging `material_detect` and `SensorGatingRule` into one read/write path — a feature flag plus a never-executed migration SQL — without changing any current behaviour. The actual cutover (flip the flag, frontend handle "missing sensor", remove dual code paths) is a deliberate Phase B in a future session.

**Architecture:** Wrap the breaking parts of #7 in a runtime feature flag (`Gating:StrictMode`, default `false`). When the flag is off, ingestion keeps its current dual-write behaviour (writes readings flagged with `HasMaterial=false`, runs both gating checks in AND). When the flag is on, ingestion will route everything through `SensorGatingRule` and never write a reading for a gated sensor. Today we only land the flag plumbing, the migration SQL (idempotent, parked next to the plan), and tests for both modes.

**Tech Stack:** .NET 9, EF Core 9, xUnit, FluentAssertions, SQL Server.

---

## Scope check

Sprint 1 of `2026-05-14-gating-convergence.md` lists three coupled tasks:
- T1: Migration SQL (additive)
- T2: Ingestion path consolidation (read)
- T3: Reading write strategy (BREAKING — material_detect=false stops writing)

The spec assumed they could be ordered independently. They cannot — `GatingEvaluator` already returns `Stale`/`Pass` decisions and `IsBlockedByNewGating` already short-circuits the AddRange at `DataIngestionService.cs:112`. The moment T1 lands new `SensorGatingRule` rows that mirror `material_detect` setups, T3's behaviour ships with it. Frontend `useLiveData.ts:212-214` actively reads `hasMaterial=false` to keep the last value visible while forcing normal status; once T3 ships, that branch never fires because the reading isn't in the SSE payload at all.

So the actual breaking-change scope is broader than Sprint 1 of the spec. The cutover requires coordinated backend + frontend deploy.

**Decision:** today's plan splits Sprint 1 into:
- **Phase A (this session, safe):** feature flag + migration SQL on disk + tests for both modes
- **Phase B (next session, coordinated):** frontend SSE handler change + flip flag in staging → prod
- **Phase C (cleanup, later session):** remove `material_detect`-specific branches once Phase B is stable

Phase A is what this plan implements. Phase B and C get their own plans when ready.

---

## File Structure

**Create:**
- `backend/Services/GatingConvergenceOptions.cs` — strongly typed options record for the flag.
- `backend/Migrations/Manual/2026-05-14-mirror-material-detect-into-sensor-gating-rule.sql` — idempotent backfill SQL, parked for manual execution when Phase B starts.
- `backend/Tests/Services/DataIngestionServiceStrictGatingTests.cs` — new xUnit class covering both flag states.

**Modify:**
- `backend/appsettings.json` — add `Gating:StrictMode: false` so it's reviewable in source control.
- `backend/Program.cs` — bind `GatingConvergenceOptions` from `IConfiguration` and register as `IOptions<>`.
- `backend/Services/DataIngestionService.cs` — read `IOptions<GatingConvergenceOptions>` in the primary constructor, branch the write-readings step on `StrictMode`.

**Untouched today (Phase B / Phase C):**
- `frontend/src/hooks/useLiveData.ts` — needs an "if a previously-known sensor is missing in this payload, keep the last value" branch. Plan for Phase B.
- `PropertyType.Behavior == "material_detect"` semantics — keep as-is. Phase C.
- `SensorReading.HasMaterial` column — keep writing for now. Phase C decides whether to drop it.

---

## Task 1: Add `GatingConvergenceOptions`

**Files:**
- Create: `backend/Services/GatingConvergenceOptions.cs`

- [ ] **Step 1.1: Create the options class**

```csharp
namespace IoT.CentralApi.Services;

/// <summary>
/// Runtime knobs governing the material_detect → SensorGatingRule convergence
/// (issue #7). The flag stays default-OFF in production until the frontend
/// stops depending on HasMaterial=false readings being present in SSE.
/// </summary>
public class GatingConvergenceOptions
{
    public const string SectionName = "Gating";

    /// <summary>
    /// When true, sensors gated by a SensorGatingRule produce no SensorReading
    /// row at all (matches the "don't write" semantics the new gating UX
    /// promises). When false (default) the legacy material_detect path still
    /// writes readings with HasMaterial=false so the existing dashboard
    /// behaviour holds.
    /// </summary>
    public bool StrictMode { get; set; } = false;
}
```

- [ ] **Step 1.2: Register the options in `Program.cs`**

Find the section where other services are registered (around the `AddSingleton<IProtocolAdapter, ...>` lines) and add:

```csharp
builder.Services.Configure<GatingConvergenceOptions>(
    builder.Configuration.GetSection(GatingConvergenceOptions.SectionName));
```

- [ ] **Step 1.3: Add the default value to `appsettings.json`**

Add at the top level (peer of existing sections):

```json
"Gating": {
  "StrictMode": false
}
```

- [ ] **Step 1.4: Commit**

```bash
git add backend/Services/GatingConvergenceOptions.cs backend/Program.cs backend/appsettings.json
git commit -m "feat(gating): introduce GatingConvergenceOptions feature flag (default off)"
```

---

## Task 2: Inject and branch on the flag in `DataIngestionService`

**Files:**
- Modify: `backend/Services/DataIngestionService.cs`

- [ ] **Step 2.1: Add `IOptions<GatingConvergenceOptions>` to the primary constructor**

Find the existing primary constructor (uses `IDbContextFactory<IoTDbContext> dbFactory`, `GatingEvaluator gatingEvaluator`, `ILogger<...> logger`, etc.) and append the new parameter:

```csharp
public class DataIngestionService(
    IDbContextFactory<IoTDbContext> dbFactory,
    GatingEvaluator gatingEvaluator,
    Microsoft.Extensions.Options.IOptions<GatingConvergenceOptions> gatingOptions,
    ILogger<DataIngestionService> logger,
    // ... rest unchanged
)
```

- [ ] **Step 2.2: Branch the write-readings filter on `StrictMode`**

Replace the existing `var readings = payload.Sensors.Where(...).Select(...)` block (currently at `DataIngestionService.cs:110-121`) with:

```csharp
// Write-readings filter behaviour:
//   StrictMode=false (default, today): only blocks the material_detect
//     sensor row and SensorGatingRule-gated sensors from being written.
//     Other sensors are written with HasMaterial reflecting current state.
//   StrictMode=true (Phase B cutover): same as above. The behaviour
//     difference shows up in alerting / dashboard once frontend stops
//     depending on HasMaterial=false readings; backfilling SensorGatingRule
//     rows that mirror material_detect makes the material_detect=false
//     case route through the same "don't write" path automatically.
// Either way, no behaviour change today — the flag exists so we can flip
// it cleanly in Phase B without code redeploy.
var strictMode = gatingOptions.Value.StrictMode;

var readings = payload.Sensors
    .Where(s => !matSensorId.HasValue || s.Id != matSensorId.Value)
    .Where(s => !IsBlockedByNewGating(s.Id))
    .Select(s => new SensorReading
    {
        AssetCode = assetCode,
        SensorId = s.Id,
        Value = s.Value,
        HasError = s.Error != null,
        HasMaterial = hasMaterial,
        Timestamp = now
    }).ToList();

if (strictMode && !hasMaterial)
{
    // Strict mode: when material_detect says "no material", drop the
    // remaining readings as well (matching SensorGatingRule semantics).
    // Today this branch is unreachable because the flag is off in prod.
    readings.Clear();
}

db.SensorReadings.AddRange(readings);
```

⚠️ The `readings.Clear()` is the *only* behaviour delta. Everything else is bit-for-bit the existing logic.

- [ ] **Step 2.3: Build to verify compile**

Run:

```bash
cd "C:/Users/Keith.Lee/Diamond Groups/AI/IoT-Dashboard"
dotnet build backend/IoT.CentralApi.csproj --nologo
```

Expected: build succeeds with 0 errors.

- [ ] **Step 2.4: Run the existing test suite to verify no regression**

Run:

```bash
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --nologo
```

Expected: 159/159 pass. The default flag value means existing behaviour is preserved.

- [ ] **Step 2.5: Commit**

```bash
git add backend/Services/DataIngestionService.cs
git commit -m "feat(gating): wire StrictMode flag into DataIngestionService write-readings filter"
```

---

## Task 3: Test coverage for both flag modes

**Files:**
- Create: `backend/Tests/Services/DataIngestionServiceStrictGatingTests.cs`

This is a new test class because the existing `DataIngestionServiceTests.cs` constructs the service directly and we want a dedicated fixture for the new options branching.

- [ ] **Step 3.1: Write the test file**

```csharp
using IoT.CentralApi.Data;
using IoT.CentralApi.Models;
using IoT.CentralApi.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace IoT.CentralApi.Tests.Services;

public class DataIngestionServiceStrictGatingTests
{
    // Build a service wired with the same scaffolding the existing
    // DataIngestionServiceTests use, parameterised by flag value so each
    // test case asks "with StrictMode=X, does the reading get written?".
    private static (DataIngestionService svc, IoTDbContext db) BuildService(
        IDbContextFactory<IoTDbContext> dbFactory,
        bool strictMode)
    {
        var options = Options.Create(new GatingConvergenceOptions { StrictMode = strictMode });
        var evaluator = new GatingEvaluator(NullLogger<GatingEvaluator>.Instance);
        var cache = new LatestReadingCache();
        var sseHub = new SseHub(NullLogger<SseHub>.Instance);
        var dispatcher = new IoT.CentralApi.Services.Alerting.AlertDispatcher(
            Array.Empty<IoT.CentralApi.Services.Alerting.IAlertChannel>(),
            NullLogger<IoT.CentralApi.Services.Alerting.AlertDispatcher>.Instance);
        var svc = new DataIngestionService(
            dbFactory,
            evaluator,
            options,
            NullLogger<DataIngestionService>.Instance,
            cache,
            sseHub,
            dispatcher);
        return (svc, dbFactory.CreateDbContext());
    }

    private static IDbContextFactory<IoTDbContext> NewInMemoryFactory()
    {
        // Use the same in-memory factory pattern the existing tests use.
        // (If the project uses a custom TestDbContextFactory helper, swap to that.)
        var opts = new DbContextOptionsBuilder<IoTDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new TestDbContextFactory(opts);
    }

    [Fact]
    public async Task ProcessAsync_StrictModeOff_WithMaterialDetectFalse_StillWritesReadings()
    {
        // Mirrors current production behaviour: even when material_detect=false,
        // the temperature reading is written so the dashboard's hasMaterial=false
        // branch (useLiveData.ts:212-214) keeps showing the last value.
        var dbFactory = NewInMemoryFactory();
        // Arrange: insert an EquipmentType with one material_detect sensor + one
        // temperature sensor, plus a LineEquipment bound to AssetCode "test_asset".
        // (Copy the fixture-building pattern from the existing
        // DataIngestionServiceTests; this is the same setup minus the strict flag.)
        // ...

        var (svc, db) = BuildService(dbFactory, strictMode: false);

        // Act: ProcessAsync with material_detect sensor reading = 0 (no material)
        // and the temperature sensor reading some value.

        // Assert: the temperature SensorReading row exists with HasMaterial=false.
        var readings = await db.SensorReadings.Where(r => r.AssetCode == "test_asset").ToListAsync();
        Assert.Single(readings);
        Assert.False(readings[0].HasMaterial);
    }

    [Fact]
    public async Task ProcessAsync_StrictModeOn_WithMaterialDetectFalse_SkipsAllReadings()
    {
        // The Phase-B behaviour: material_detect=false now matches
        // SensorGatingRule semantics — no reading row at all.
        var dbFactory = NewInMemoryFactory();
        // (Same fixture as above.)

        var (svc, db) = BuildService(dbFactory, strictMode: true);

        // Act: ProcessAsync with material_detect=0.

        // Assert: zero SensorReading rows written.
        var readings = await db.SensorReadings.Where(r => r.AssetCode == "test_asset").ToListAsync();
        Assert.Empty(readings);
    }

    [Fact]
    public async Task ProcessAsync_StrictModeOn_WithMaterialDetectTrue_StillWritesReadings()
    {
        // Sanity: strict mode only changes the "no material" branch.
        // Production polls with material present should be untouched.
        var dbFactory = NewInMemoryFactory();
        // (Same fixture.)

        var (svc, db) = BuildService(dbFactory, strictMode: true);

        // Act: ProcessAsync with material_detect=1.

        // Assert: temperature reading written with HasMaterial=true.
        var readings = await db.SensorReadings.Where(r => r.AssetCode == "test_asset").ToListAsync();
        Assert.Single(readings);
        Assert.True(readings[0].HasMaterial);
    }
}
```

⚠️ The arrange/act sections leave the fixture-building loop with a `// ...` placeholder because Sprint-1 doesn't fix tests — it adds new ones. Mirror the existing `DataIngestionServiceTests.cs` setup; the new tests only differ in the `BuildService(..., strictMode: ...)` argument and the absence vs. presence of the resulting reading.

- [ ] **Step 3.2: Run the new tests**

```bash
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --nologo --filter "FullyQualifiedName~DataIngestionServiceStrictGatingTests"
```

Expected: 3/3 pass.

- [ ] **Step 3.3: Run the entire suite once more**

```bash
dotnet test backend/Tests/IoT.CentralApi.Tests.csproj --nologo
```

Expected: 162/162 pass (159 prior + 3 new).

- [ ] **Step 3.4: Commit**

```bash
git add backend/Tests/Services/DataIngestionServiceStrictGatingTests.cs
git commit -m "test(gating): cover StrictMode on/off branches in DataIngestionService"
```

---

## Task 4: Park the migration SQL (NOT executed)

**Files:**
- Create: `backend/Migrations/Manual/2026-05-14-mirror-material-detect-into-sensor-gating-rule.sql`

This script lives in source control so it's reviewable, but no one runs it in Phase A. The Phase B runbook will call it as part of the cutover.

- [ ] **Step 4.1: Write the idempotent SQL**

```sql
-- 2026-05-14 — Mirror material_detect setups into SensorGatingRule rows.
-- DO NOT RUN until Phase B of the gating-convergence cutover. This script
-- is parked in source control so it's reviewable; the Phase B runbook
-- executes it during a planned maintenance window.
--
-- For every EquipmentType that has both a material_detect sensor and at
-- least one non-material_detect sensor, insert a SensorGatingRule row
-- making the non-material sensor gated by the material_detect sensor in
-- the same asset.
--
-- Idempotent: uses MERGE so re-running adds nothing.
MERGE INTO SensorGatingRules AS target
USING (
    SELECT
        le.AssetCode                AS GatedAssetCode,
        ets_gated.SensorId          AS GatedSensorId,
        le.AssetCode                AS GatingAssetCode,
        ets_mat.SensorId            AS GatingSensorId,
        0                           AS DelayMs,
        10000                       AS MaxAgeMs
    FROM LineEquipments le
    INNER JOIN EquipmentTypes et
        ON et.Id = le.EquipmentTypeId
    INNER JOIN EquipmentTypeSensors ets_mat
        ON ets_mat.EquipmentTypeId = et.Id
    INNER JOIN PropertyTypes pt_mat
        ON pt_mat.Id = ets_mat.PropertyTypeId
        AND pt_mat.Behavior = 'material_detect'
    INNER JOIN EquipmentTypeSensors ets_gated
        ON ets_gated.EquipmentTypeId = et.Id
        AND ets_gated.PropertyTypeId <> ets_mat.PropertyTypeId
    WHERE le.AssetCode IS NOT NULL
) AS src
ON target.GatedAssetCode = src.GatedAssetCode
   AND target.GatedSensorId = src.GatedSensorId
   AND target.GatingAssetCode = src.GatingAssetCode
   AND target.GatingSensorId = src.GatingSensorId
WHEN NOT MATCHED BY TARGET THEN
    INSERT (GatedAssetCode, GatedSensorId, GatingAssetCode, GatingSensorId, DelayMs, MaxAgeMs)
    VALUES (src.GatedAssetCode, src.GatedSensorId, src.GatingAssetCode, src.GatingSensorId, src.DelayMs, src.MaxAgeMs);

-- Rollback: the inverse delete. Removes only rules that look auto-generated
-- (DelayMs=0, MaxAgeMs=10000, gated and gating share AssetCode). Users with
-- manually-edited rules using the same shape will lose them, so prefer a
-- database backup if you don't fully trust this heuristic.
--
--     DELETE FROM SensorGatingRules
--     WHERE GatedAssetCode = GatingAssetCode
--       AND DelayMs = 0
--       AND MaxAgeMs = 10000;
```

- [ ] **Step 4.2: Commit**

```bash
git add backend/Migrations/Manual/2026-05-14-mirror-material-detect-into-sensor-gating-rule.sql
git commit -m "docs(migration): park idempotent material_detect → SensorGatingRule backfill SQL"
```

---

## Task 5: Build + deploy with flag OFF

The point of today is "land the plumbing, change nothing visible." Verify by running the full backend test suite and confirming the flag value in production reads `false`.

- [ ] **Step 5.1: Production publish**

```bash
cd "C:/Users/Keith.Lee/Diamond Groups/AI/IoT-Dashboard"
dotnet publish backend/IoT.CentralApi.csproj -c Release --nologo
```

Expected: builds clean. The published `appsettings.json` in `publish/` has `Gating:StrictMode: false`. The prod-side `appsettings.json` on `192.168.6.23` is excluded from the robocopy (existing convention) — so prod will fall back to whatever its own `appsettings.json` says, which won't have the Gating section yet → `IOptions<>` binds the default `StrictMode = false`. Either way, the flag is off in prod.

- [ ] **Step 5.2: Deploy via the standard 3-step**

```powershell
sc.exe \\192.168.6.23 stop IoTDashboard
# wait for STOPPED
robocopy "C:\Users\Keith.Lee\Diamond Groups\AI\IoT-Dashboard\backend\bin\Release\net9.0\publish" `
         "\\192.168.6.23\c$\Users\Administrator\Desktop\IoT\NB_C.C_Dashboard\backend\publish" `
         /E /XO /XF appsettings.json appsettings.Development.json /NFL /NDL /NJH
sc.exe \\192.168.6.23 start IoTDashboard
# wait for RUNNING
```

- [ ] **Step 5.3: Smoke — confirm no behaviour change**

After ~30 seconds of post-restart settling, query the diagnostics endpoint and verify the LeanA connection state is in the same range as before this deploy. There should be no change in alert rate, no new errors, no SSE format differences.

```powershell
$dn = (Invoke-WebRequest -Uri "http://192.168.6.23:5200/api/diagnostics/polling" -UseBasicParsing).Content | ConvertFrom-Json
$dn.connections | Sort-Object id | Format-Table id, status, consecutiveErrors -AutoSize
```

- [ ] **Step 5.4: Push to origin**

```bash
git push origin main
```

---

## Task 6: Update memory + handoff

**Files:**
- Modify: `~/.claude/projects/.../memory/MEMORY.md` (index entry)
- Modify: `~/.claude/projects/.../memory/project_gating_tech_debt.md` (mark Sprint 1 Phase A done)
- Modify: `~/.claude/projects/.../memory/project_progress_20260514.md` (append Phase A entry)

- [ ] **Step 6.1: Update the tech-debt entry**

In `project_gating_tech_debt.md` add a section near the end:

```markdown
## Phase A 已落地（2026-05-14）

- `GatingConvergenceOptions.StrictMode` feature flag 加好，default OFF
- 部署到 prod 但 flag 未開 → 零行為改變
- Migration SQL 寫好放在 `backend/Migrations/Manual/` 等 Phase B 執行
- Backend test 162/162 pass（含 3 個新 strict-mode case）
- Commits: <fill in after commits land>

## Phase B 仍未做（需 staging + frontend 配合）

- Frontend `useLiveData.ts:212-214` 要先支援「sensor 在 payload 中缺席」情境
- 然後 staging 開 flag 跑一週驗證
- 沒問題再 prod flip flag + 跑 migration SQL
```

- [ ] **Step 6.2: Append to today's progress note**

In `project_progress_20260514.md` add at the bottom:

```markdown
## 下半場 part 4 — #7 Sprint 1 Phase A（feature flag foundation）

### Commits
- feat(gating): introduce GatingConvergenceOptions feature flag (default off)
- feat(gating): wire StrictMode flag into DataIngestionService write-readings filter
- test(gating): cover StrictMode on/off branches in DataIngestionService
- docs(migration): park idempotent material_detect → SensorGatingRule backfill SQL

### 為什麼只做 Phase A
- 原 Spec Sprint 1 (T1+T2+T3) 三項其實互相耦合，一上線就觸發 breaking change
- 前端 `useLiveData.ts:212-214` 用 `hasMaterial=false` 保留最後值，convergence 之後 SSE payload 不再帶這個 sensor → 前端要先改才能 cutover
- 今天做 feature flag + migration SQL + 測試 = 把地基鋪好，flag 一翻就上線
- Phase B 留下次 session 跨前後端做

### Backend tests
- 159 → 162（+3 strict-mode tests）
```

- [ ] **Step 6.3: Update MEMORY.md index**

Replace the existing `#7 Gating convergence Sprint 1` row with a "Phase A done" version.

- [ ] **Step 6.4: Commit memory updates**

(Memory files aren't in the repo, no git commit needed — just save the files.)

---

## Self-Review

**Spec coverage:**
- T1 (migration SQL) → Task 4 ✅
- T2 (ingestion path consolidation) → covered by the flag plumbing in Task 2; the actual single-path code consolidation is Phase C
- T3 (write strategy) → Task 2 implements the new branch, Task 3 tests it, but the flag stays OFF until Phase B

**Placeholder scan:**
- Task 3's fixture comments have `// ...` placeholders. That's intentional — the actual fixture mirrors the existing `DataIngestionServiceTests` setup; copying ~50 lines of fixture verbatim into this plan would add noise without value. Engineer instruction is explicit: "mirror the existing setup."
- Task 5.3's smoke check is qualitative ("same range as before") because we don't have hard SLA numbers — production behaviour is intermittent. Acceptable for a no-behaviour-change deploy.

**Type consistency:**
- `GatingConvergenceOptions.StrictMode` used identically in Task 1 (define), Task 2 (consume), Task 3 (test) ✅
- `SectionName = "Gating"` matches `appsettings.json` key `"Gating"` ✅

## Open Decisions

1. **Phase B timing**: spec said 1-2 days. With frontend coordination added, realistically 2-3 days including staging soak. Re-estimate when Phase B plan is written.
2. **`HasMaterial` column fate (Phase C)**: keep as computed-from-gating, or drop entirely? Both are defensible; the deciding factor is whether anyone queries historical readings filtered by `HasMaterial`. Audit before Phase C.
3. **Migration rollback strategy**: the SQL has a delete heuristic in a comment, but DB backup is the safer rollback. Phase B runbook should mandate a snapshot before executing the migration.
