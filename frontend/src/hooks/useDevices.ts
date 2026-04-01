import { useCallback, useEffect, useState } from 'react';

export interface DeviceDto {
  id: number;
  serialNumber: string;
  ipAddress: string | null;
  assetCode: string | null;
  friendlyName: string | null;
  assetName: string | null;
  departmentName: string | null;
  firstSeen: string;
  lastSeen: string;
  isBound: boolean;
}

export function useDevices() {
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/devices');
      if (res.ok) setDevices(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Poll every 10s to detect new devices
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  const bindDevice = useCallback(
    async (serialNumber: string, assetCode: string, friendlyName?: string) => {
      const res = await fetch(`/api/devices/${encodeURIComponent(serialNumber)}/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetCode, friendlyName }),
      });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
    },
    [refresh],
  );

  const unbindDevice = useCallback(
    async (serialNumber: string) => {
      const res = await fetch(`/api/devices/${encodeURIComponent(serialNumber)}/bind`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
    },
    [refresh],
  );

  const validateAsset = useCallback(async (assetCode: string) => {
    const res = await fetch(`/api/fas/validate/${encodeURIComponent(assetCode)}`);
    if (!res.ok) return null;
    return res.json();
  }, []);

  const registerDevice = useCallback(
    async (serialNumber: string, friendlyName?: string) => {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serialNumber, friendlyName }),
      });
      if (res.status === 409) throw new Error('DUPLICATE');
      if (!res.ok) throw new Error(await res.text());
      await refresh();
    },
    [refresh],
  );

  const unboundCount = devices.filter((d) => !d.isBound).length;

  return { devices, loading, refresh, bindDevice, unbindDevice, validateAsset, registerDevice, unboundCount };
}
