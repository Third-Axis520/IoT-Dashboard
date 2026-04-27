// ─────────────────────────────────────────────────────────────────────────────
// apiSensorGating — Sensor Gating Rule API helpers
// ─────────────────────────────────────────────────────────────────────────────
// Endpoints:
//   GET  /api/sensor-gating/{assetCode}            → SensorGatingRule[]
//   PUT  /api/sensor-gating/{assetCode}            → { updated: number }
//   GET  /api/sensor-gating/candidates             → GatingCandidate[]
// ─────────────────────────────────────────────────────────────────────────────

import type { SensorGatingRule, GatingCandidate, SaveGatingRuleItem } from '../types/gating';

const API_BASE = '/api/sensor-gating';

export async function fetchGatingRules(assetCode: string): Promise<SensorGatingRule[]> {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(assetCode)}`);
  if (!res.ok) throw new Error(`GET ${API_BASE}/${assetCode} → ${res.status}`);
  return res.json();
}

export async function saveGatingRules(
  assetCode: string,
  rules: SaveGatingRuleItem[],
): Promise<{ updated: number }> {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(assetCode)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `PUT ${API_BASE}/${assetCode} → ${res.status}`);
  }
  return res.json();
}

export async function fetchGatingCandidates(): Promise<GatingCandidate[]> {
  const res = await fetch(`${API_BASE}/candidates`);
  if (!res.ok) throw new Error(`GET ${API_BASE}/candidates → ${res.status}`);
  return res.json();
}
