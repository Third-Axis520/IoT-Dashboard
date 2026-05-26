import { apiCall } from './apiClient';

export interface EquipmentTypeSensorItem {
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

export interface EquipmentTypeDetail {
  id: number;
  name: string;
  visType: string;
  description: string | null;
  createdAt: string;
  sensors: EquipmentTypeSensorItem[];
}

export function fetchEquipmentTypeDetail(id: number): Promise<EquipmentTypeDetail> {
  return apiCall<EquipmentTypeDetail>(`/api/equipment-types/${id}`);
}
