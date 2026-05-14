import type { DeviceConnectionItem } from './apiDeviceConnections';

export interface ProtocolConcurrencyHints {
  /** Number of siblings on the same host:port that triggers the recommendation. */
  threshold: number;
  /** Recommended poll interval (ms) to apply when threshold is met. */
  recommendedMs: number;
}

// Protocols whose recommendation values are calibrated against real concurrency
// limits. Protocols absent from this map deliberately produce no banner — we
// would rather be silent than wrong.
//
// modbus_tcp: most low-cost gateways cap concurrent Modbus sessions at 1-4
// (verified against 2026-05-13 LeanA incident on 192.168.62.74:502).
const PROTOCOL_HINTS: Record<string, ProtocolConcurrencyHints> = {
  modbus_tcp: { threshold: 3, recommendedMs: 10000 },
};

export function getGatewayConcurrencyHints(protocol: string | null | undefined): ProtocolConcurrencyHints | null {
  if (!protocol) return null;
  return PROTOCOL_HINTS[protocol] ?? null;
}

export function countSiblingsOnSameHost(
  connections: DeviceConnectionItem[],
  host: string,
  port: string,
  excludeId?: number,
): number {
  return connections.filter(c => {
    if (excludeId !== undefined && c.id === excludeId) return false;
    try {
      const cfg = JSON.parse(c.configJson) as { host?: string; port?: string | number };
      return cfg.host === host && String(cfg.port ?? '502') === port;
    } catch {
      return false;
    }
  }).length;
}
