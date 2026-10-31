import { createContext, useContext } from 'react';
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';
export interface AuthContextValue {
  status: AuthStatus;
  error: string | null;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  retry: () => void;
}
export const AuthContext = createContext<AuthContextValue | null>(null);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth membutuhkan AuthProvider');
  return value;
}
