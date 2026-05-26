// ─────────────────────────────────────────────────────────────────────────────
// apiPropertyTypes — PropertyType CRUD API helpers
// ─────────────────────────────────────────────────────────────────────────────
// Endpoints:
//   GET    /api/property-types       → PropertyType[]
//   GET    /api/property-types/:id   → PropertyType
//   POST   /api/property-types       → PropertyType (created)
//   PUT    /api/property-types/:id   → PropertyType (updated)
//   DELETE /api/property-types/:id   → 204 | 409 (builtin / in use)
// ─────────────────────────────────────────────────────────────────────────────

export interface PropertyTypeItem {
  id: number;
  key: string;
  name: string;
  icon: string;
  defaultUnit: string;
  defaultUcl: number | null;
  defaultLcl: number | null;
  behavior: 'normal' | 'material_detect' | 'asset_code' | 'state' | 'counter';
  isBuiltIn: boolean;
  sortOrder: number;
  createdAt: string;
}

export async function fetchPropertyTypes(): Promise<PropertyTypeItem[]> {
  const res = await fetch('/api/property-types');
  if (!res.ok) throw new Error(`GET /api/property-types → ${res.status}`);
  return res.json();
}

