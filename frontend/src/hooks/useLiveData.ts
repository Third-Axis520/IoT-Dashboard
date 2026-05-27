import { useEffect, useRef, useState } from 'react';
import type { AlertRecord, PointStatus, ProductionLine } from '../types';
import { generateId } from '../utils/simulation';

export type ConnectionStatus = 'connecting' | 'connected' | 'error' | 'offline';

interface SseSensorItem {
  id: number;
  value: number;
  ucl: number;
  lcl: number;
  error: string | null;
}

interface SseDataUpdate {
  assetCode: string;
  assetName?: string;
  timestamp: number;
  isConnected: boolean;
  sensors: SseSensorItem[];
}

const SSE_URL = '/api/stream';
const HISTORY_MAX = 60;
const RECONNECT_DELAYS = [5000, 10000, 30000];

export function useLiveData(
  data: ProductionLine[],
  setData: React.Dispatch<React.SetStateAction<ProductionLine[]>>,
  setAlerts: React.Dispatch<React.SetStateAction<AlertRecord[]>>,
  onConfigChanged?: () => void
): {
  status: ConnectionStatus;
  error: string | null;
  assetCode: string | null;
  latestRawSensors: Map<string, Map<number, number>>;
  latestRawTimestamps: Map<string, string>;
} {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [assetCode, setAssetCode] = useState<string | null>(null);
  const [latestRawSensors, setLatestRawSensors] = useState<Map<string, Map<number, number>>>(new Map());
  const [latestRawTimestamps, setLatestRawTimestamps] = useState<Map<string, string>>(new Map());

  const dataRef = useRef(data);
  dataRef.current = data;

  const onConfigChangedRef = useRef(onConfigChanged);
  onConfigChangedRef.current = onConfigChanged;

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const loadedAssetsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // 以 assetCode 為單位載入 UCL/LCL 設定（每個 assetCode 只載入一次）
    async function loadLimitsForLine(ac: string) {
      if (loadedAssetsRef.current.has(ac)) return;
      loadedAssetsRef.current.add(ac);

      try {
        const res = await fetch(`/api/limits/${ac}`);
        if (!res.ok) return;
        const limits: Array<{ sensorId: number; ucl: number; lcl: number }> = await res.json();
        if (!limits.length) return;

        setData(prev =>
          prev.map(line => ({
            ...line,
            equipments: line.equipments.map(eq => {
              // 只更新綁定此 assetCode 的設備卡片
              if (eq.deviceId !== ac) return eq;
              return {
                ...eq,
                points: eq.points.map(point => {
                  if (point.sensorId === undefined) return point;
                  const lim = limits.find(l => l.sensorId === point.sensorId);
                  if (!lim) return point;
                  return { ...point, ucl: lim.ucl, lcl: lim.lcl };
                }),
              };
            }),
          }))
        );
      } catch {
        // 靜默失敗，使用前端預設值
      }
    }

    function connect() {
      if (esRef.current) {
        esRef.current.close();
      }

      setStatus('connecting');
      const es = new EventSource(SSE_URL);
      esRef.current = es;

      es.onopen = () => {
        setStatus('connected');
        setError(null);
        reconnectAttemptRef.current = 0;
      };

      es.addEventListener('data-update', (event: MessageEvent) => {
        try {
          const payload: SseDataUpdate = JSON.parse(event.data);

          // 更新即時感測器快照（給 AddDeviceModal / SensorMappingModal 即時預覽用）
          const sensorValueMap = new Map<number, number>();
          payload.sensors.forEach(s => {
            if (!s.error) sensorValueMap.set(s.id, s.value);
          });
          const isoTimestamp = new Date(payload.timestamp).toISOString();
          setLatestRawSensors(prev => {
            const next = new Map(prev);
            next.set(payload.assetCode, sensorValueMap);
            return next;
          });
          setLatestRawTimestamps(prev => {
            const next = new Map(prev);
            next.set(payload.assetCode, isoTimestamp);
            return next;
          });

          setAssetCode(payload.assetCode);
          loadLimitsForLine(payload.assetCode);
          updateData(payload);
        } catch {
          // JSON parse error, skip
        }
      });

      // heartbeat: keep-alive，不處理
      es.addEventListener('heartbeat', () => {});

      // config-updated: 後端 config 變更，通知 App reload（debounce 防批次操作高頻觸發）
      let configDebounce: ReturnType<typeof setTimeout> | null = null;
      es.addEventListener('config-updated', () => {
        if (configDebounce) clearTimeout(configDebounce);
        configDebounce = setTimeout(() => onConfigChangedRef.current?.(), 500);
      });

      es.onerror = () => {
        setStatus('error');
        setError('與伺服器的連線已中斷');
        es.close();
        esRef.current = null;

        // 指數退避重連
        const delay = RECONNECT_DELAYS[
          Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)
        ];
        reconnectAttemptRef.current++;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [setData, setAlerts]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateData(payload: SseDataUpdate) {
    const prevData = dataRef.current;
    const newAlerts: AlertRecord[] = [];

    // 建立 sensorId → 感測器資料的快速查找
    const sensorMap = new Map(payload.sensors.map(s => [s.id, s]));

    const nextData = prevData.map(line => ({
      ...line,
      equipments: line.equipments.map(eq => {
        // 只更新 deviceId 與 payload.assetCode 相符的設備卡片
        if (eq.deviceId !== payload.assetCode) return eq;

        return {
          ...eq,
          points: eq.points.map(point => {
            // 沒有 sensorId 的 point（模擬設備）不參與即時路由
            if (point.sensorId === undefined) return point;

            const sensor = sensorMap.get(point.sensorId);
            if (!sensor) {
              // Sensor missing from SSE = SensorGatingRule blocked it (post
              // #7 Phase C this is the only path that drops a sensor mid-stream).
              // Force status normal so cards don't keep glowing danger when
              // the upstream DI says material is gone.
              return point.status === 'normal' ? point : { ...point, status: 'normal' as PointStatus };
            }

            // Sensor has an error (sentinel value, comms failure, etc.) — mark
            // offline AND scrub the value to 0 so a stale bad number doesn't
            // keep rendering in the tile. Tiles also check status='offline'
            // to render "—" rather than 0.0; the value reset is the
            // last-line-of-defense for components that miss that check.
            if (sensor.error) {
              return { ...point, value: 0, status: 'offline' as PointStatus };
            }

            const pValue = Number(sensor.value.toFixed(1));
            const ucl = sensor.ucl > 0 ? sensor.ucl : point.ucl;
            const lcl = sensor.lcl > 0 ? sensor.lcl : point.lcl;

            // 更新 history（rolling 60 筆）
            const newHistory = [
              ...point.history.slice(-(HISTORY_MAX - 1)),
              { time: payload.timestamp, value: pValue },
            ];

            // 計算 status — danger if value is outside the configured band.
            // `limitsSet` (UCL>0 OR LCL>0) means the user has configured at
            // least one bound; once that's true, LCL=0 is treated as a real
            // inclusive lower bound (so e.g. a 冷凍機 sensor reading -15°C
            // when LCL=0 correctly triggers danger).
            const limitsSet = ucl > 0 || lcl > 0;
            let pStatus: PointStatus = 'normal';
            if ((ucl > 0 && pValue > ucl) || (limitsSet && pValue < lcl)) {
              pStatus = 'danger';
              if (point.status !== 'danger') {
                newAlerts.push({
                  id: generateId(),
                  time: payload.timestamp,
                  eqName: eq.name,
                  deviceId: eq.deviceId,
                  pointName: point.name,
                  value: pValue,
                  limit: pValue > ucl ? ucl : lcl,
                  type: pValue > ucl ? 'UCL' : 'LCL',
                  status: 'danger',
                });
              }
            } else if ((ucl > 0 && pValue > ucl * 0.95) || (lcl > 0 && pValue < lcl * 1.05)) {
              // Warning still requires LCL > 0 (the 5% band is only meaningful
              // with a positive lower bound — for LCL=0 the danger boundary is
              // sharp and there's no "approaching" zone to warn about).
              pStatus = 'warning';
              if (point.status === 'normal') {
                newAlerts.push({
                  id: generateId(),
                  time: payload.timestamp,
                  eqName: eq.name,
                  deviceId: eq.deviceId,
                  pointName: point.name,
                  value: pValue,
                  limit: pValue > ucl * 0.95 ? ucl : lcl,
                  type: pValue > ucl * 0.95 ? 'UCL' : 'LCL',
                  status: 'warning',
                });
              }
            }

            return { ...point, value: pValue, history: newHistory, status: pStatus, ucl, lcl };
          }),
        };
      }),
    }));

    setData(nextData);
    if (newAlerts.length > 0) {
      setAlerts(prev => [...prev, ...newAlerts].slice(-1000));
    }
  }

  return { status, error, assetCode, latestRawSensors, latestRawTimestamps };
}
