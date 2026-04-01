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
}

export interface ProductionLine {
  id: string;
  name: string;
  equipments: Equipment[];
}
