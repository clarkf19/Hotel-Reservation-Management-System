/**
 * REST client. Adds the JWT, turns error responses into ApiError with the server's
 * user-friendly message, and forwards every UML execution trace returned by the
 * server to the trace store (Viva Mode's live sequence diagram).
 */
import { traceStore } from './traceStore.js';

const TOKEN_KEY = 'hrms.token';

export const tokenStorage = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let onUnauthenticated = () => {};
export const setUnauthenticatedHandler = (fn) => { onUnauthenticated = fn; };

async function request(method, path, body, { raw, label } = {}) {
  const headers = { Accept: 'application/json' };
  const token = tokenStorage.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the HRMS server. Is it running on port 4000?');
  }
  if (raw && res.ok) return res;
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (data?.trace) traceStore.push({ ...data.trace, method, path, status: res.status, label });
  if (!res.ok) {
    const err = data?.error || {};
    if (res.status === 401 && token && ['SESSION_EXPIRED', 'SESSION_REVOKED', 'SESSION_INVALID', 'ACCOUNT_INACTIVE'].includes(err.code)) onUnauthenticated(err.message);
    throw new ApiError(res.status, err.code || 'ERROR', err.message || `Request failed (${res.status})`, err.details);
  }
  return data;
}

export const api = {
  get: (p, o) => request('GET', p, undefined, o),
  post: (p, b = {}, o) => request('POST', p, b, o),
  put: (p, b = {}, o) => request('PUT', p, b, o),
  patch: (p, b = {}, o) => request('PATCH', p, b, o),
  /** Download a binary/CSV response and save it (Dashboard.Export, invoices). */
  async download(path, fallbackName) {
    const res = await request('GET', path, undefined, { raw: true });
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const name = /filename="?([^";]+)"?/.exec(cd)?.[1] || fallbackName;
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
  async openPdf(path) {
    const res = await request('GET', path, undefined, { raw: true });
    const url = URL.createObjectURL(await res.blob());
    window.open(url, '_blank', 'noopener');
  },
};

export const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const str = s.toString();
  return str ? `?${str}` : '';
};
