import type {
  ApiEquipmentType,
  ApiLineConfig,
  Equipment,
  MachineTemplate,
  Point,
  ProductionLine,
  VisType,
} from '../types';

/** Convert API equipment type → MachineTemplate (for AddDeviceModal picker) */
export function apiTypeToTemplate(et: ApiEquipmentType): MachineTemplate {
  return {
    id: String(et.id),
    name: et.name,
    visType: et.visType as VisType,
    points: et.sensors
      .filter(s => s.propertyTypeBehavior !== 'material_detect')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(s => ({
        name: s.label,
        type: 'temperature' as const,
        defaultUcl: 200,
        defaultLcl: 0,
        defaultBase: 100,
      })),
  };
}

function apiLineEquipmentToEquipment(
  le: ApiLineConfig['equipments'][number]
): Equipment {
  const normalSensors = le.equipmentType.sensors
    .filter(s => s.propertyTypeBehavior !== 'material_detect')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const matDetect = le.equipmentType.sensors.find(s => s.propertyTypeBehavior === 'material_detect');

  const points: Point[] = normalSensors.map(s => ({
    id: s.pointId,
    name: s.label,
    type: 'temperature' as const,
    value: 0,
    unit: s.unit,
    status: 'offline' as const,
    history: [],
    ucl: 0,
    lcl: 0,
    sensorId: s.sensorId,
  }));

  return {
    id: `le_${le.id}`,
    deviceId: le.assetCode ?? '',
    templateId: String(le.equipmentTypeId),
    name: le.displayName ?? le.equipmentType.name,
    visType: le.equipmentType.visType as VisType,
    points,
    materialDetectSensorId: matDetect?.sensorId,
    isHidden: le.isHidden,
  };
}

/** Convert API LineConfig → frontend ProductionLine */
export function apiLineConfigToProductionLine(lc: ApiLineConfig): ProductionLine {
  return {
    id: lc.lineId,
    name: lc.name,
    equipments: lc.equipments
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(apiLineEquipmentToEquipment),
  };
}

// ── API calls ──────────────────────────────────────────────────────────────────

export async function fetchEquipmentTypes(): Promise<ApiEquipmentType[]> {
  const res = await fetch('/api/equipment-types');
  if (!res.ok) throw new Error(`GET /api/equipment-types → ${res.status}`);
  return res.json();
}

export async function fetchLineConfigs(): Promise<ApiLineConfig[]> {
  const res = await fetch('/api/line-configs');
  if (!res.ok) throw new Error(`GET /api/line-configs → ${res.status}`);
  return res.json();
}

export async function saveLineConfig(
  lineId: string,
  name: string,
  equipments: Array<{
    equipmentTypeId: number;
    assetCode?: string | null;
    displayName?: string | null;
    sortOrder: number;
    isHidden?: boolean;
  }>
): Promise<ApiLineConfig> {
  const res = await fetch(`/api/line-configs/${lineId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, equipments }),
  });
  if (!res.ok) throw new Error(`PUT /api/line-configs/${lineId} → ${res.status}`);
  return res.json();
}

export async function deleteLineConfig(lineId: string): Promise<void> {
  const res = await fetch(`/api/line-configs/${lineId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE /api/line-configs/${lineId} → ${res.status}`);
}
