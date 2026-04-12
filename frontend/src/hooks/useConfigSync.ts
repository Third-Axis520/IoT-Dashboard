import { useEffect, useRef } from 'react';

type ConfigAction = 'created' | 'updated' | 'deleted';

export interface ConfigUpdateEvent {
  entity: string;
  id: number;
  action: ConfigAction;
}

/**
 * Listens to SSE config-updated events from /api/stream.
 * Calls the callback when a config change is detected.
 */
export function useConfigSync(
  callback: (event: ConfigUpdateEvent) => void,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const eventSource = new EventSource('/api/stream');

    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as ConfigUpdateEvent;
        callbackRef.current(data);
      } catch {
        // ignore malformed events
      }
    };

    eventSource.addEventListener('config-updated', handler);

    return () => {
      eventSource.removeEventListener('config-updated', handler);
      eventSource.close();
    };
  }, []);
}
