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
