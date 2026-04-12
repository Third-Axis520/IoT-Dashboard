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

export interface SavePropertyTypeRequest {
  key: string;
  name: string;
  icon: string;
  defaultUnit?: string;
  defaultUcl?: number | null;
  defaultLcl?: number | null;
  behavior: PropertyTypeItem['behavior'];
  sortOrder?: number;
}

export interface UpdatePropertyTypeRequest {
  name: string;
  icon: string;
  defaultUnit?: string;
  defaultUcl?: number | null;
  defaultLcl?: number | null;
  sortOrder?: number;
}

export async function fetchPropertyTypes(): Promise<PropertyTypeItem[]> {
  const res = await fetch('/api/property-types');
  if (!res.ok) throw new Error(`GET /api/property-types → ${res.status}`);
  return res.json();
}

export async function createPropertyType(req: SavePropertyTypeRequest): Promise<PropertyTypeItem> {
  const res = await fetch('/api/property-types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `POST /api/property-types → ${res.status}`);
  }
  return res.json();
}

export async function updatePropertyType(id: number, req: UpdatePropertyTypeRequest): Promise<PropertyTypeItem> {
  const res = await fetch(`/api/property-types/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`PUT /api/property-types/${id} → ${res.status}`);
  return res.json();
}

export async function deletePropertyType(id: number): Promise<void> {
  const res = await fetch(`/api/property-types/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `DELETE /api/property-types/${id} → ${res.status}`);
  }
}
