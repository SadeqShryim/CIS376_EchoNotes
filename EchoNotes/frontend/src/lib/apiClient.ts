import { getOrCreateSessionToken } from './sessionToken';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';

export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = getOrCreateSessionToken();
  const headers = new Headers(init.headers ?? {});
  headers.set('X-Session-Token', token);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res;
}

export async function initSession() {
  const res = await apiFetch('/session/init', { method: 'POST' });
  return res.json();
}