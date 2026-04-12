import { apiCall } from './apiClient';

export interface ConfigFieldItem {
  name: string;
  type: 'string' | 'number' | 'enum' | 'boolean';
  label: string;
  required: boolean;
  defaultValue: string | null;
  placeholder: string | null;
  options: string[] | null;
  min: number | null;
  max: number | null;
}

export interface ProtocolItem {
  id: string;
  displayName: string;
  supportsDiscovery: boolean;
  supportsLivePolling: boolean;
  configSchema: { fields: ConfigFieldItem[] };
}

export function fetchProtocols(): Promise<ProtocolItem[]> {
  return apiCall<ProtocolItem[]>('/api/protocols');
}

export function fetchProtocol(id: string): Promise<ProtocolItem> {
  return apiCall<ProtocolItem>(`/api/protocols/${id}`);
}
