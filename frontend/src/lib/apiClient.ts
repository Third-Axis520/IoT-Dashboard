// ─────────────────────────────────────────────────────────────────────────────
// apiClient — Unified fetch wrapper
// ─────────────────────────────────────────────────────────────────────────────
// Usage:
//   const data = await apiCall<MyDto>('/api/whatever');
//   const data = await apiCall<MyDto>('/api/whatever', { method: 'POST', body: ... });
// ─────────────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    public response: { code: string; message: string; details?: unknown },
  ) {
    super(response.message);
    this.name = 'ApiError';
  }
}

export async function apiCall<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    let body: { code?: string; message?: string; error?: string } = {};
    try {
      body = await res.json();
    } catch {
      // non-JSON error response
    }

    throw new ApiError(res.status, {
      code: body.code ?? `http_${res.status}`,
      message: body.message ?? body.error ?? `Request failed: ${res.status} ${res.statusText}`,
      details: body,
    });
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}
