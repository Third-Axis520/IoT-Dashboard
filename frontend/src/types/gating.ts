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
}

export interface SaveGatingRuleItem {
  gatedSensorId: number;
  gatingAssetCode: string;
  gatingSensorId: number;
  delayMs: number;
  maxAgeMs: number;
}

export type GatingState = 'sampling' | 'standby' | 'unhealthy' | null;
