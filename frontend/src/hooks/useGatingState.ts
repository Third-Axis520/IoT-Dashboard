import { useEffect, useState } from 'react';
import type { SensorGatingRule, GatingState } from '../types/gating';

export function useGatingState(
  rule: SensorGatingRule | null,
  latestDi: { value: number; timestamp: string } | null,
): GatingState {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!rule) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [rule]);

  // tick is intentionally unused in the render path — its only purpose is to
  // force a re-render every second so age-based state transitions are detected.
  void tick;

  if (!rule) return null;
  if (!latestDi) return 'unhealthy';

  const ageMs = Date.now() - new Date(latestDi.timestamp).getTime();
  if (ageMs > rule.maxAgeMs) return 'unhealthy';
  if (latestDi.value < 0.5) return 'standby';
  return 'sampling';
}
