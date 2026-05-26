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
  alertOnConsecutiveErrors: number;
  alertCooldownSec: number;
  isAlertEnabled: boolean;
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


export function testDeviceConnection(id: number) {
  return apiCall(`/api/device-connections/${id}/test`, {
    method: 'POST',
  });
}

export function fetchPollingDiagnostics(): Promise<PollingDiagnostics> {
  return apiCall<PollingDiagnostics>('/api/diagnostics/polling');
}
