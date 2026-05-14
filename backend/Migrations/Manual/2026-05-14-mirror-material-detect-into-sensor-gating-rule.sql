-- 2026-05-14 — Mirror material_detect setups into SensorGatingRule rows.
-- DO NOT RUN until Phase B of the gating-convergence cutover. This script
-- is parked in source control so it's reviewable; the Phase B runbook
-- executes it during a planned maintenance window.
--
-- Target: SQL Server only (uses T-SQL MERGE). SQLite/Postgres would need
-- a rewrite to INSERT ... ON CONFLICT — but the integration test DB is
-- SQLite, so this script intentionally never runs in tests.
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

-- Rollback strategy: RESTORE FROM DB SNAPSHOT, not the inverse DELETE below.
--
-- The Phase B runbook MUST take a fresh DB snapshot immediately before
-- executing this migration. If anything goes wrong post-cutover, restore
-- that snapshot rather than running the heuristic delete — a user could
-- have manually authored a gating rule with the same shape (same
-- AssetCode, DelayMs=0, MaxAgeMs=10000) and the inverse DELETE has no
-- way to tell the difference.
--
-- The heuristic delete is kept here only as a last-resort tool when a
-- snapshot isn't available. Read the WHERE clause carefully before you
-- run it, ideally after a row count check.
--
--     -- Sanity check first — how many rows match the heuristic?
--     SELECT COUNT(*) FROM SensorGatingRules
--     WHERE GatedAssetCode = GatingAssetCode
--       AND DelayMs = 0
--       AND MaxAgeMs = 10000;
--
--     -- Only if the count matches the migration's insert count:
--     DELETE FROM SensorGatingRules
--     WHERE GatedAssetCode = GatingAssetCode
--       AND DelayMs = 0
--       AND MaxAgeMs = 10000;
