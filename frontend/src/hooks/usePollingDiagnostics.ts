import { useEffect, useRef, useState } from 'react';
import { fetchPollingDiagnostics, type PollingDiagnostics } from '../lib/apiDeviceConnections';

const POLL_MS = 10_000;

/**
 * 每 10 秒拉一次 /api/diagnostics/polling，同時監聽 SSE connection-alert
 * 事件（若有提供 eventSource）來即時刷新。
 */
export function usePollingDiagnostics(eventSource?: EventSource | null) {
  const [data, setData] = useState<PollingDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const load = () => {
      fetchPollingDiagnostics()
        .then(d => { if (mountedRef.current) { setData(d); setError(null); } })
        .catch(e => { if (mountedRef.current) setError(e instanceof Error ? e.message : 'network'); });
    };
    load();
    const interval = setInterval(load, POLL_MS);
    return () => { mountedRef.current = false; clearInterval(interval); };
  }, []);

  // Optional SSE-triggered refresh
  useEffect(() => {
    if (!eventSource) return;
    const handler = () => fetchPollingDiagnostics()
      .then(d => { if (mountedRef.current) setData(d); })
      .catch(() => { /* swallow — polling fallback covers it */ });
    eventSource.addEventListener('connection-alert', handler);
    return () => eventSource.removeEventListener('connection-alert', handler);
  }, [eventSource]);

  return { data, error };
}
