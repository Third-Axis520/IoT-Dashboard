import { apiCall } from './apiClient';

export interface DeviceConnectionItem {
  id: number;
  name: string;
  protocol: string;
  configJson: string;
  pollIntervalMs: number | null;
  isEnabled: boolean;
  lastPollAt: string | null;
  lastPollError: string | null;
  consecutiveErrors: number;
  equipmentTypeId: number | null;
  equipmentTypeName: string | null;
  createdAt: string;
}

export interface SaveDeviceConnectionRequest {
  name: string;
  protocol: string;
  config: string;
  pollIntervalMs: number | null;
  isEnabled: boolean;
  equipmentType?: {
    name: string;
    visType: string;
    description: string | null;
    sensors: Array<{
      sensorId: number;
      pointId: string;
      label: string;
      unit: string;
      propertyTypeId: number;
      rawAddress: string | null;
      sortOrder: number;
    }>;
  };
}

export interface UpdateDeviceConnectionRequest {
  name: string;
  config: string;
  pollIntervalMs: number | null;
  isEnabled: boolean;
}

export interface PollingDiagnostics {
  polling: {
    isRunning: boolean;
    activeConnections: number;
    lastTickAt: string | null;
  };
  connections: Array<{
    id: number;
    name: string;
    protocol: string;
    status: string;
    consecutiveErrors: number;
    lastPollAt: string | null;
    lastErrorMessage: string | null;
  }>;
}

export function fetchDeviceConnections(): Promise<DeviceConnectionItem[]> {
  return apiCall<DeviceConnectionItem[]>('/api/device-connections');
}

export interface DeviceConnectionCreatedDto {
  id: number;
  equipmentTypeId: number | null;
  assetCode: string | null;
}

export function createDeviceConnection(req: SaveDeviceConnectionRequest): Promise<DeviceConnectionCreatedDto> {
  return apiCall<DeviceConnectionCreatedDto>('/api/device-connections', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function updateDeviceConnection(id: number, req: UpdateDeviceConnectionRequest) {
  return apiCall(`/api/device-connections/${id}`, {
    method: 'PUT',
    body: JSON.stringify(req),
  });
}

export function deleteDeviceConnection(id: number, cascade = false) {
  return apiCall(`/api/device-connections/${id}?cascade=${cascade}`, {
    method: 'DELETE',
  });
}

export function testDeviceConnection(id: number) {
  return apiCall(`/api/device-connections/${id}/test`, {
    method: 'POST',
  });
}

export function fetchPollingDiagnostics(): Promise<PollingDiagnostics> {
  return apiCall<PollingDiagnostics>('/api/diagnostics/polling');
}
