import { apiCall } from './apiClient';

export interface DiscoveredPoint {
  rawAddress: string;
  currentValue: number;
  dataType: string;
  suggestedLabel: string | null;
}

export interface ScanResponse {
  success: boolean;
  points: DiscoveredPoint[] | null;
  error: string | null;
}

export function scanDiscovery(protocol: string, config: string): Promise<ScanResponse> {
  return apiCall<ScanResponse>('/api/discovery/scan', {
    method: 'POST',
    body: JSON.stringify({ protocol, config }),
  });
}
