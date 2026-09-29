/**
 * Authentication context (SRS 4.2). The token is kept in localStorage purely as a
 * per-browser convenience; the server remains the authority for every permission.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, setUnauthenticatedHandler, tokenStorage } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokenStorage.get()) { setUser(null); setLoading(false); return null; }
    try {
      const { user: u } = await api.get('/auth/me');
      setUser(u);
      return u;
    } catch {
      tokenStorage.set(null);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    setUnauthenticatedHandler((message) => {
      tokenStorage.set(null);
      setUser(null);
      toast.error(message || 'Your session has ended. Please sign in again.');
    });
  }, [refresh]);

  const acceptSession = useCallback((result) => {
    tokenStorage.set(result.token);
    setUser(result.user);
    return result;
  }, []);

  const login = useCallback(async (email, password) => {
    const result = await api.post('/auth/login', { email, password });
    if (result.mfaRequired) return result;
    return acceptSession(result);
  }, [acceptSession]);

  const verifyMfa = useCallback(async (challengeId, code) => acceptSession(await api.post('/auth/mfa/verify', { challengeId, code })), [acceptSession]);
  const register = useCallback(async (data) => acceptSession(await api.post('/auth/register', data)), [acceptSession]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* session may already be gone */ }
    tokenStorage.set(null);
    setUser(null);
  }, []);

  const can = useCallback((...perms) => Boolean(user && perms.some((p) => user.permissions.includes(p))), [user]);

  const value = useMemo(() => ({ user, loading, login, verifyMfa, register, logout, refresh, can, setUser }), [user, loading, login, verifyMfa, register, logout, refresh, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
