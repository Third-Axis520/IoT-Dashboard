import type { Equipment, MachineTemplate, PointStatus } from '../types';

export const generateId = () => Math.random().toString(36).substr(2, 9);

const generateHistory = (base: number, variance: number, length = 60) => {
  return Array.from({ length }, (_, i) => ({
    time: Date.now() - (length - i) * 60000,
    value: Number((base + (Math.random() * variance * 2 - variance)).toFixed(1))
  }));
};

export const createEquipmentFromTemplate = (
  template: MachineTemplate,
  name: string,
  deviceId: string,
  sensorMapping?: Record<number, number>,   // pointIndex → sensorId
  pointNames?: string[]                      // optional custom point names
): Equipment => ({
  id: `eq_${generateId()}`,
  deviceId,
  templateId: template.id,
  name,
  visType: template.visType,
  points: template.points.map((pt, idx) => {
    const hasSensor = sensorMapping?.[idx] !== undefined;
    return {
      id: `pt_${generateId()}`,
      name: pointNames?.[idx] ?? pt.name,
      type: pt.type,
      value: hasSensor ? 0 : pt.defaultBase,
      unit: pt.type === 'temperature' ? '℃' : 'MPa',
      status: (hasSensor ? 'offline' : 'normal') as PointStatus,
      history: hasSensor ? [] : generateHistory(pt.defaultBase, pt.type === 'temperature' ? 1 : 0.2),
      ucl: pt.defaultUcl,
      lcl: pt.defaultLcl,
      sensorId: sensorMapping?.[idx],
    };
  })
});
