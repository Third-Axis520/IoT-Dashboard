import { useEffect, useState } from 'react';
import { fetchGatingCandidates } from '../lib/apiSensorGating';
import type { GatingCandidate } from '../types/gating';

export function useGatingCandidates() {
  const [data, setData] = useState<GatingCandidate[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGatingCandidates()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error };
}
