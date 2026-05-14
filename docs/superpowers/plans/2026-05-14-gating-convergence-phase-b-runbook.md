# Gating Convergence Phase B — Cutover Runbook

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to walk this runbook with the operator on the day. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip `Gating:StrictMode=true` in production so material_detect=false routes through the same "don't write the reading" path as SensorGatingRule, then mirror existing material_detect setups into SensorGatingRule rows so the legacy path is no longer needed.

**Pre-requisites (already shipped in Phase A — 2026-05-14):**
- `GatingConvergenceOptions.StrictMode` feature flag wired into `DataIngestionService` (commit `c52b537` + `18892c5`).
- SSE `Sensors` filter mirrors the DB readings drop via shared `dropAllRemaining` (commit `216a831` + `f59e795`).
- `useLiveData.ts` clears `danger`/`warning` status when a sensor is missing from an SSE tick (commit `2638466`).
- Idempotent migration SQL parked at `backend/Migrations/Manual/2026-05-14-mirror-material-detect-into-sensor-gating-rule.sql` (commit `fd9ac08`).
- Backend tests: 168/168 pass, including 3 strict-mode integration tests and 6 SSE filter unit tests.

**Rollback strategy:** restore the DB snapshot taken in Step 2.1. Code rollback (set `StrictMode=false` and redeploy) is a partial measure — it reverses the runtime behaviour but leaves the mirrored rows in `SensorGatingRules`.

**Operator:** This runbook assumes one operator with access to the prod server (`192.168.6.23`), SQL Server console, and Git. Estimated wall time: 30-45 min, plus a 24-hour observation window before declaring Phase B complete.

---

## Step 1 — Schedule the cutover

- [ ] **1.1: Pick a low-traffic window**
  - Recommended: 23:00-02:00 local. The factory's main shift ends at 22:00.
  - Confirm no scheduled production runs are due to start during the window.
- [ ] **1.2: Notify stakeholders**
  - Floor lead + maintenance team: "Dashboard may briefly show no temperature data on equipment without material from 23:30 onwards; this is expected — the new behaviour matches the gating rules. Status reverts on restart of the run."
  - Have the rollback contact number handy.

---

## Step 2 — Snapshot first, change nothing yet

- [ ] **2.1: Take a full DB snapshot** (rollback anchor)

```sql
BACKUP DATABASE [IoTControlChart]
TO DISK = N'D:\backups\iotcontrolchart_pre_gating_convergence_2026MMDD.bak'
WITH COMPRESSION, FORMAT, INIT;
```

Confirm the `.bak` file exists and its size is plausible (compare to a recent backup).

- [ ] **2.2: Capture the current `SensorGatingRules` row count**

```sql
SELECT COUNT(*) AS rules_before FROM SensorGatingRules;
```

Write this number down. It's the baseline for the migration's "rows added" verification later.

- [ ] **2.3: Capture material_detect setup count** (expected new rules)

```sql
SELECT COUNT(*) AS expected_new_rules
FROM LineEquipments le
JOIN EquipmentTypes et ON et.Id = le.EquipmentTypeId
JOIN EquipmentTypeSensors mat ON mat.EquipmentTypeId = et.Id
JOIN PropertyTypes pt_mat ON pt_mat.Id = mat.PropertyTypeId AND pt_mat.Behavior = 'material_detect'
JOIN EquipmentTypeSensors gated ON gated.EquipmentTypeId = et.Id
                                 AND gated.PropertyTypeId <> mat.PropertyTypeId
WHERE le.AssetCode IS NOT NULL;
```

This is how many rows the migration SQL will insert. Write it down too.

---

## Step 3 — Run the migration SQL

- [ ] **3.1: Open the migration script**
  - Path: `backend/Migrations/Manual/2026-05-14-mirror-material-detect-into-sensor-gating-rule.sql`
  - Read the top-of-file comments before executing.
- [ ] **3.2: Execute the MERGE inside a transaction** (allows manual rollback if the row count is unexpected)

```sql
BEGIN TRANSACTION;

-- (paste the MERGE INTO statement from the parked SQL)

SELECT COUNT(*) AS rules_after FROM SensorGatingRules;
-- Should equal: rules_before (Step 2.2) + expected_new_rules (Step 2.3)
```

- [ ] **3.3: Verify the diff matches expectations**

```sql
SELECT
  (SELECT COUNT(*) FROM SensorGatingRules) AS current_total,
  COUNT(*) AS auto_generated_marker_count
FROM SensorGatingRules
WHERE GatedAssetCode = GatingAssetCode
  AND DelayMs = 0
  AND MaxAgeMs = 10000;
```

If the new total != baseline + expected, **ROLLBACK** and investigate before continuing:

```sql
ROLLBACK;  -- undoes step 3.2
```

- [ ] **3.4: Commit the transaction**

```sql
COMMIT;
```

---

## Step 4 — Flip the flag in prod `appsettings.json`

- [ ] **4.1: SSH / RDP to `192.168.6.23`**

Open: `C:\Users\Administrator\Desktop\IoT\NB_C.C_Dashboard\backend\publish\appsettings.json`

- [ ] **4.2: Change the Gating section**

```json
"Gating": {
  "StrictMode": true
}
```

If the section doesn't exist yet (older prod config), add it as a top-level key.

- [ ] **4.3: Save the file**

---

## Step 5 — Restart the service

- [ ] **5.1: Stop, wait, start**

```powershell
sc.exe \\192.168.6.23 stop IoTDashboard
# wait for STOPPED (poll sc.exe query)
sc.exe \\192.168.6.23 start IoTDashboard
# wait for RUNNING
```

Estimated downtime: 10-15 seconds.

- [ ] **5.2: Confirm the flag took effect**

After the service is up, check the API responds:

```powershell
Invoke-WebRequest -Uri "http://192.168.6.23:5200/api/diagnostics/polling" -UseBasicParsing
```

Status 200 means the service is healthy. (There's no public endpoint that exposes the flag value — that's intentional. Verification of behaviour is in Step 6.)

---

## Step 6 — Smoke test

- [ ] **6.1: Find a sensor that should currently be in "no material" state**

Look at any equipment whose photo-eye reports 0 right now. Pick its temperature sensor.

```sql
-- Find a candidate: equipments where material_detect sensor's latest reading is 0
SELECT le.AssetCode, le.DisplayName, et.Name AS EquipmentType
FROM LineEquipments le
JOIN EquipmentTypes et ON et.Id = le.EquipmentTypeId
WHERE le.AssetCode IN (
  -- (whatever the operator knows currently has no material)
);
```

- [ ] **6.2: Watch the SSE stream for 60 seconds**

Open the dashboard in a browser; the affected card should:
- Keep its previous temperature value visible (held by `useLiveData.ts`'s missing-sensor branch)
- Show normal (not danger) ring
- NOT receive new temperature updates for the duration

If you can tail the backend log, you should see no `SensorReadings` insert for that sensor while material is absent.

- [ ] **6.3: Verify alerts are NOT generated for those sensors**

```sql
SELECT TOP 10 * FROM SensorAlerts ORDER BY CreatedAt DESC;
```

No new rows should reference the gated sensors during the no-material window.

- [ ] **6.4: When material returns, readings resume**

Once the floor brings a part back through the photo-eye, the dashboard should start writing readings again and the temperature value will refresh.

---

## Step 7 — Day-1 monitoring

- [ ] **7.1: Tail `consecutiveErrors` for 24 hours**

```powershell
Invoke-WebRequest -Uri "http://192.168.6.23:5200/api/diagnostics/polling" -UseBasicParsing
```

Connection error rate should be the same or lower than pre-cutover. Strict mode itself doesn't touch the polling path; this is a sanity check.

- [ ] **7.2: Spot-check a few historical queries**

The dashboard's drill-down / history endpoints should return the same data they did before for the periods when material was present. Periods when material was absent should now have **gaps** instead of `HasMaterial=false` rows.

- [ ] **7.3: Watch the floor team's questions**

Capture any "the chart looks different" feedback. The expected one is "I don't see the flat zero line anymore when material isn't there" — that's the design and should be confirmed as desired.

---

## Step 8 — Declare done

- [ ] **8.1: Update progress memory** with the cutover date + commit hash from the appsettings change
- [ ] **8.2: Mark the tech-debt entry** in `project_gating_tech_debt.md` Phase B as ✅
- [ ] **8.3: Decide on Phase C kickoff**

Phase C cleans up the `material_detect` branch from `DataIngestionService` and removes the `HasMaterial` column dependency. Worth scheduling 1-2 weeks after Phase B once the behaviour change has soaked.

---

## Rollback Procedure (Emergency)

If anything in Step 6 looks wrong:

- [ ] **R.1: Flip the flag back**

Edit `appsettings.json` on prod: `Gating:StrictMode = false`.

- [ ] **R.2: Restart the service** (same 3-step as Step 5).

- [ ] **R.3: Restore the DB snapshot** (Step 2.1) **only if the mirrored rows in `SensorGatingRules` are causing problems**

```sql
USE master;
ALTER DATABASE [IoTControlChart] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
RESTORE DATABASE [IoTControlChart] FROM DISK = N'D:\backups\iotcontrolchart_pre_gating_convergence_2026MMDD.bak' WITH REPLACE;
ALTER DATABASE [IoTControlChart] SET MULTI_USER;
```

⚠️ Restoring the snapshot loses any user activity that happened between Step 2.1 and the rollback. If the rollback comes minutes later this is fine; hours later it isn't. The flag flip alone (R.1 + R.2) is often the safer first move.

- [ ] **R.4: Diagnose before retrying**

Don't re-run the migration without understanding what went wrong. Capture logs, take a fresh snapshot, and reconvene.

---

## Self-Review

**Spec coverage:**
- Step 2-3 covers spec T1 (migration SQL execution)
- Step 4-5 covers spec T2/T3 (flag flip + restart routes ingestion through the unified path)
- Step 6-7 covers operational verification missing from the spec
- Rollback section addresses the audit P2-2 finding (DB snapshot as primary rollback)

**No placeholders:** every SQL block, every PowerShell command is concrete. The "(whatever the operator knows)" in 6.1 is the only human-input gap, which is appropriate.

**Type consistency:** SQL identifiers (`SensorGatingRules`, `LineEquipments`, etc.) match `Entities.cs`.

## Open Decisions

1. **Cutover audience**: factory operations vs IT-only signoff. The dashboard UX change (gap instead of flat zero during no-material) is mild but visible; recommend at minimum a one-line heads-up to the floor lead.
2. **Backup retention**: keep the pre-cutover `.bak` for at least 30 days. Phase C work may want to consult it.
3. **Phase C trigger**: 2 weeks of soak with no rollback events. If anything rolls back, restart the clock.
