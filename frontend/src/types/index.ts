export type PointStatus = 'normal' | 'warning' | 'danger' | 'offline';
export type PointType = 'temperature' | 'pressure';
export type VisType = 'molding_matrix' | 'four_rings' | 'dual_side_spark' | 'single_kpi' | 'custom_grid';

export interface PointTemplate {
  name: string;
  type: PointType;
  defaultUcl: number;
  defaultLcl: number;
  defaultBase: number;
}

export interface MachineTemplate {
  id: string;
  name: string;
  visType: VisType;
  points: PointTemplate[];
}

export interface Point {
  id: string;
  name: string;
  type: PointType;
  value: number;
  unit: string;
  status: PointStatus;
  history: { time: number; value: number }[];
  ucl: number;
  lcl: number;
  /** 對應後端 sensor.id（1-N）；undefined = 模擬設備，不參與即時路由 */
  sensorId?: number;
}

export interface AlertRecord {
  id: string;
  time: number;
  eqName: string;
  deviceId: string;
  pointName: string;
  value: number;
  limit: number;
  type: 'UCL' | 'LCL';
  status: 'warning' | 'danger';
}

export interface Equipment {
  id: string;
  deviceId: string;
  templateId: string;
  name: string;
  visType: VisType;
  points: Point[];
  /** SensorId for "material present" detection; undefined = always treat as has-material */
  materialDetectSensorId?: number;
}

export interface ProductionLine {
  id: string;
  name: string;
  equipments: Equipment[];
}

// ── Direction-C: API response types ──────────────────────────────────────────

export interface ApiEquipmentTypeSensor {
  id: number;
  sensorId: number;
  pointId: string;
  label: string;
  unit: string;
  propertyTypeId: number;
  propertyTypeBehavior: string;
  rawAddress: string | null;
  sortOrder: number;
}

export interface ApiEquipmentType {
  id: number;
  name: string;
  visType: string;
  description: string | null;
  createdAt: string;
  sensors: ApiEquipmentTypeSensor[];
}

export interface ApiLineEquipment {
  id: number;
  equipmentTypeId: number;
  equipmentType: ApiEquipmentType;
  assetCode: string | null;
  displayName: string | null;
  sortOrder: number;
}

export interface ApiLineConfig {
  id: number;
  lineId: string;
  name: string;
  updatedAt: string;
  equipments: ApiLineEquipment[];
}

// ── PLC Template Types ────────────────────────────────────────────────────────

export interface PlcZoneDefinition {
  id: number;
  zoneIndex: number;
  zoneName: string;
  assetCodeRegStart: number;
  assetCodeRegCount: number;
}

export interface PlcRegisterDefinition {
  id: number;
  registerAddress: number;
  defaultLabel: string;
  defaultUnit: string;
  defaultZoneIndex: number | null;
}

export interface PlcTemplate {
  id: number;
  modelName: string;
  description: string | null;
  createdAt: string;
  zones: PlcZoneDefinition[];
  registers: PlcRegisterDefinition[];
}

export interface PlcTemplateSummary {
  id: number;
  modelName: string;
  description: string | null;
  createdAt: string;
  zoneCount: number;
  registerCount: number;
}
