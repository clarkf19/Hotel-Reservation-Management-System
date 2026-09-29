import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/** Load data from the API with loading / error state and a reload function. */
export function useApi(path, { deps = [], enabled = true, poll } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled && path));
  const alive = useRef(true);

  const load = useCallback(async ({ quiet } = {}) => {
    if (!enabled || !path) return;
    if (!quiet) setLoading(true);
    try {
      const d = await api.get(path);
      if (alive.current) { setData(d); setError(null); }
    } catch (e) {
      if (alive.current) setError(e);
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, enabled, ...deps]);

  useEffect(() => {
    alive.current = true;
    load();
    let t;
    if (poll) t = setInterval(() => load({ quiet: true }), poll);
    return () => { alive.current = false; clearInterval(t); };
  }, [load, poll]);

  return { data, error, loading, reload: load, setData };
}

/** Wrap an async action with a pending flag. */
export function useAction(fn) {
  const [pending, setPending] = useState(false);
  const run = useCallback(async (...args) => {
    setPending(true);
    try { return await fn(...args); } finally { setPending(false); }
  }, [fn]);
  return [run, pending];
}

export function useCountdown(until) {
  const [left, setLeft] = useState(() => (until ? new Date(until) - Date.now() : 0));
  useEffect(() => {
    if (!until) return undefined;
    const t = setInterval(() => setLeft(new Date(until) - Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return Math.max(0, left);
}
