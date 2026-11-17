// Thin fetch wrapper: JSON in and out, Bearer token, one error type.
const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8787").replace(/\/$/, "");
export const API_BASE = BASE;

export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const TOKEN_KEY = "hanare.token";
export const token = {
  get(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(t: string | null) {
    try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
  },
};

export const authHeaders = (): Record<string, string> => {
  const t = token.get();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { ...(init.body === undefined ? {} : { "Content-Type": "application/json" }), ...authHeaders() },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token.get()) token.set(null); // expired session
    throw new ApiFailure(res.status, data?.error?.code ?? `http_${res.status}`, data?.error?.message ?? "The server did not answer. Try again.");
  }
  return data as T;
}
