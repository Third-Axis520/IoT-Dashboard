import { useEffect, useState } from 'react';
import { fetchPropertyTypes, type PropertyTypeItem } from '../../../lib/apiPropertyTypes';

interface PropertyTypePickerProps {
  value: number;
  onChange: (id: number, item: PropertyTypeItem) => void;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedTypes: PropertyTypeItem[] | null = null;
let cacheExpiresAt = 0;

export default function PropertyTypePicker({ value, onChange }: PropertyTypePickerProps) {
  const [types, setTypes] = useState<PropertyTypeItem[]>(cachedTypes ?? []);

  useEffect(() => {
    if (cachedTypes && Date.now() < cacheExpiresAt) return;
    fetchPropertyTypes().then((items) => {
      cachedTypes = items;
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      setTypes(items);
    });
  }, []);

  return (
    <select
      value={value || ''}
      onChange={(e) => {
        const id = Number(e.target.value);
        const item = types.find((t) => t.id === id);
        if (item) onChange(id, item);
      }}
      className="w-full px-3 py-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-panel)] text-[var(--text-main)] text-sm outline-none focus:border-[var(--accent-green)]"
    >
      <option value="">選擇屬性類型</option>
      {types.map((t) => (
        <option key={t.id} value={t.id}>
          {t.icon} {t.name} ({t.key})
        </option>
      ))}
    </select>
  );
}
