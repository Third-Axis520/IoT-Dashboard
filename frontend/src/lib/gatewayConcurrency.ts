import type { DeviceConnectionItem } from './apiDeviceConnections';

// Some Modbus gateways limit concurrent sessions to as few as 1-4 and start
// dropping reads under contention; when this many siblings already share
// host:port we proactively suggest a longer poll interval.
export const SAME_HOST_RECOMMEND_THRESHOLD = 3;
export const RECOMMENDED_POLL_MS = 10000;

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
