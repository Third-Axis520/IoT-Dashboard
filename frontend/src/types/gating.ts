// ─────────────────────────────────────────────────────────────────────────────
// gating — Sensor Gating domain types
// ─────────────────────────────────────────────────────────────────────────────

export interface SensorGatingRule {
  id: number;
  gatedAssetCode: string;
  gatedSensorId: number;
  gatingAssetCode: string;
  gatingSensorId: number;
  gatingSensorLabel?: string;
  delayMs: number;
  maxAgeMs: number;
}

export interface GatingCandidate {
  assetCode: string;
  assetName: string;
  sensorId: number;
  sensorLabel: string;
  currentValue?: number;
  lastUpdate?: string;
  // Smallest enabled PollIntervalMs across DeviceConnections targeting this asset's
  // EquipmentType. Used by GatingRow to validate maxAgeMs ≥ source poll rate.
  pollIntervalMs?: number;
}

export interface SaveGatingRuleItem {
  gatedSensorId: number;
  gatingAssetCode: string;
  gatingSensorId: number;
  delayMs: number;
  maxAgeMs: number;
}

export type GatingState = 'sampling' | 'standby' | 'unhealthy' | null;
