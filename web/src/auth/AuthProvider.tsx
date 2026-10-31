import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError, UNAUTHORIZED_EVENT } from '../api/client';
import { AuthContext } from './context';
import type { AuthStatus } from './context';
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    const unauthorized = () => setStatus('anonymous');
    window.addEventListener(UNAUTHORIZED_EVENT, unauthorized);
    api
      .me(controller.signal)
      .then(() => {
        if (!controller.signal.aborted) setStatus('authenticated');
      })
      .catch((cause: unknown) => {
        if (disposed) return;
        if (
          controller.signal.aborted &&
          cause instanceof DOMException &&
          cause.name === 'AbortError'
        ) {
          setError('Server belum merespons. Silakan coba lagi.');
          setStatus('error');
          return;
        }
        if (cause instanceof ApiError && cause.status === 401)
          setStatus('anonymous');
        else {
          setError(
            cause instanceof Error ? cause.message : 'Pemeriksaan sesi gagal.',
          );
          setStatus('error');
        }
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
      window.removeEventListener(UNAUTHORIZED_EVENT, unauthorized);
    };
  }, [attempt]);
  const login = useCallback(async (password: string) => {
    await api.login(password);
    setError(null);
    setStatus('authenticated');
  }, []);
  const logout = useCallback(async () => {
    await api.logout();
    setStatus('anonymous');
  }, []);
  const retry = useCallback(() => {
    setStatus('loading');
    setError(null);
    setAttempt((value) => value + 1);
  }, []);
  return (
    <AuthContext.Provider value={{ status, error, login, logout, retry }}>
      {children}
    </AuthContext.Provider>
  );
}
