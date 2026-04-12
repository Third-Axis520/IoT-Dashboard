import { useEffect, useState } from 'react';
import { fetchPropertyTypes, type PropertyTypeItem } from '../../../lib/apiPropertyTypes';

interface PropertyTypePickerProps {
  value: number;
  onChange: (id: number, item: PropertyTypeItem) => void;
}

let cachedTypes: PropertyTypeItem[] | null = null;

export default function PropertyTypePicker({ value, onChange }: PropertyTypePickerProps) {
  const [types, setTypes] = useState<PropertyTypeItem[]>(cachedTypes ?? []);

  useEffect(() => {
    if (cachedTypes) return;
    fetchPropertyTypes().then((items) => {
      cachedTypes = items;
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
      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
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
