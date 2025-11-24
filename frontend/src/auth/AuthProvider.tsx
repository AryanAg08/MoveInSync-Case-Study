import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokenService } from '../api/axios';

type User = { id: string; email: string; name?: string; role?: string } | null;
type AuthContextType = { user: User; login: (e: string, p: string) => Promise<void>; logout: () => Promise<void>; getAccessToken: () => string | null; };

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User>(null);
  useEffect(() => { tokenService.setLogoutHandler(() => setUser(null)); }, []);
  const login = useCallback(async (email: string, password: string) => {
    const resp = await api.post('/auth/login', { email, password });
    const { accessToken, user } = resp.data;
    tokenService.setAccessToken(accessToken);
    setUser(user);
  }, []);
  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch (e) {}
    tokenService.logout();
    setUser(null);
  }, []);
  const getAccessToken = useCallback(() => tokenService.getAccessToken(), []);
  return <AuthContext.Provider value={{ user, login, logout, getAccessToken }}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
