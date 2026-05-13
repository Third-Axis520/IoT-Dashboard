import { apiCall } from './apiClient';

export interface HistoryPoint {
  time: number;
  value: number;
}

export async function fetchHistory(
  assetCode: string,
  sensorId: number,
  from: Date,
  to: Date,
  maxPoints = 300
): Promise<HistoryPoint[]> {
  const params = new URLSearchParams({
    sensorId: String(sensorId),
    from: from.toISOString(),
    to: to.toISOString(),
    maxPoints: String(maxPoints),
  });
  const data = await apiCall<Record<number, HistoryPoint[]>>(
    `/api/history/${encodeURIComponent(assetCode)}?${params}`
  );
  return data[sensorId] ?? [];
}

export async function fetchHistoryByAsset(
  assetCode: string,
  from: Date,
  to: Date,
  maxPoints = 60
): Promise<Record<number, HistoryPoint[]>> {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
    maxPoints: String(maxPoints),
  });
  return apiCall<Record<number, HistoryPoint[]>>(
    `/api/history/${encodeURIComponent(assetCode)}?${params}`
  );
}
