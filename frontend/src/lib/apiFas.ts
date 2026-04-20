export interface FasCategoryDto {
  id: number;
  categoryCode: string;
  categoryName: string;
  description: string | null;
}

export async function fetchFasCategories(): Promise<FasCategoryDto[]> {
  const res = await fetch('/api/fas/categories');
  if (!res.ok) throw new Error(`FAS error: ${res.status}`);
  return res.json();
}
