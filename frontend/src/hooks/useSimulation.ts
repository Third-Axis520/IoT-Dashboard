import { useEffect, useRef } from 'react';
import type { AlertRecord, PointStatus, ProductionLine } from '../types';
import { generateId } from '../utils/simulation';

export function useSimulation(
  data: ProductionLine[],
  setData: React.Dispatch<React.SetStateAction<ProductionLine[]>>,
  setAlerts: React.Dispatch<React.SetStateAction<AlertRecord[]>>
) {
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    const interval = setInterval(() => {
      const prevData = dataRef.current;
      const newAlerts: AlertRecord[] = [];

      const nextData = prevData.map(line => ({
        ...line,
        equipments: line.equipments.map(eq => ({
          ...eq,
          points: eq.points.map(point => {
            const variance = point.type === 'temperature' ? 1.5 : 0.5;
            let newValue = point.value + (Math.random() * variance * 2 - variance);

            if (Math.random() > 0.9) newValue += (Math.random() > 0.5 ? 1 : -1) * variance * 3;

            const pValue = Number(newValue.toFixed(1));
            const newHistory = [...point.history.slice(1), { time: Date.now(), value: pValue }];

            let pStatus: PointStatus = 'normal';
            if (pValue > point.ucl || pValue < point.lcl) {
              pStatus = 'danger';
              if (point.status !== 'danger') {
                newAlerts.push({
                  id: generateId(),
                  time: Date.now(),
                  eqName: eq.name,
                  deviceId: eq.deviceId,
                  pointName: point.name,
                  value: pValue,
                  limit: pValue > point.ucl ? point.ucl : point.lcl,
                  type: pValue > point.ucl ? 'UCL' : 'LCL',
                  status: 'danger'
                });
              }
            } else if (pValue > point.ucl * 0.95 || pValue < point.lcl * 1.05) {
              pStatus = 'warning';
              if (point.status === 'normal') {
                newAlerts.push({
                  id: generateId(),
                  time: Date.now(),
                  eqName: eq.name,
                  deviceId: eq.deviceId,
                  pointName: point.name,
                  value: pValue,
                  limit: pValue > point.ucl * 0.95 ? point.ucl : point.lcl,
                  type: pValue > point.ucl * 0.95 ? 'UCL' : 'LCL',
                  status: 'warning'
                });
              }
            }

            return { ...point, value: pValue, history: newHistory, status: pStatus };
          })
        }))
      }));

      setData(nextData);
      if (newAlerts.length > 0) {
        setAlerts(prev => [...prev, ...newAlerts].slice(-1000));
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [setData, setAlerts]);
}
