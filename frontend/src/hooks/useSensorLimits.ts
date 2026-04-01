export interface PointLimit {
  sensorId: number;
  label: string;
  unit: string;
  ucl: number;
  lcl: number;
}

/**
 * 將 PointLimit 陣列 PUT 到 /api/limits/{assetCode}。
 * 後端做 Upsert，只傳要更新的 sensors 即可。
 */
export async function savePointLimits(assetCode: string, points: PointLimit[]): Promise<void> {
  if (!points.length) return;

  const limits = points.map(({ sensorId, label, unit, ucl, lcl }) => ({
    sensorId,
    sensorName: label,
    ucl,
    lcl,
    unit,
  }));

  const res = await fetch(`/api/limits/${assetCode}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limits }),
  });

  if (!res.ok) throw new Error(`儲存限值失敗（${res.status}）`);
}

/**
 * GET /api/limits/{assetCode}，回傳 sensorId → { ucl, lcl } 的 map。
 * 如果後端回傳空值或失敗，回傳空物件。
 */
export async function fetchPointLimits(assetCode: string): Promise<Record<number, { ucl: number; lcl: number }>> {
  const res = await fetch(`/api/limits/${assetCode}`);
  if (!res.ok) return {};

  const data: Array<{ sensorId: number; ucl: number; lcl: number }> = await res.json();
  const result: Record<number, { ucl: number; lcl: number }> = {};
  for (const item of data) {
    result[item.sensorId] = { ucl: item.ucl, lcl: item.lcl };
  }
  return result;
}
