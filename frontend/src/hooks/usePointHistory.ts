import { useState, useEffect } from 'react';
import type { Equipment } from '../types';
import { fetchHistory, type HistoryPoint } from '../lib/apiHistory';

export type TimeRange = '1h' | '4h' | '24h';

const RANGE_HOURS: Record<TimeRange, number> = { '1h': 1, '4h': 4, '24h': 24 };

/** Fetches DB history for all points with sensorId. Falls back to empty map if no assetCode. */
export function usePointHistory(
  assetCode: string | null | undefined,
  points: Equipment['points'],
  timeRange: TimeRange
): { historyMap: Record<string, HistoryPoint[]>; loading: boolean } {
  const [historyMap, setHistoryMap] = useState<Record<string, HistoryPoint[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!assetCode) return;

    const sensored = points.filter(p => p.sensorId !== undefined);
    if (sensored.length === 0) return;

    let stale = false;
    const to = new Date();
    const from = new Date(to.getTime() - RANGE_HOURS[timeRange] * 3_600_000);

    setHistoryMap({});
    setLoading(true);

    Promise.allSettled(
      sensored.map(p =>
        fetchHistory(assetCode, p.sensorId!, from, to).then(data => ({ id: p.id, data }))
      )
    ).then(results => {
      if (stale) return;
      const map: Record<string, HistoryPoint[]> = {};
      for (const r of results) {
        if (r.status === 'fulfilled') map[r.value.id] = r.value.data;
      }
      setHistoryMap(map);
      setLoading(false);
    });

    return () => {
      stale = true;
      setLoading(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetCode, timeRange, points.map(p => p.id).join(',')]);

  return { historyMap, loading };
}
