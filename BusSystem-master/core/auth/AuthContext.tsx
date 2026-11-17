'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { subscribeWebAuthFailure, webSessionStorage, WebApiError } from '@/core/api/client';
import { authService, profileService } from '@/core/api/services';
import { AuthUser, UserRole } from '@/types/api.types';

interface LoginResult {
  success: boolean;
  user?: AuthUser;
  message?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<AuthUser | null>;
  hasRole: (allowedRoles?: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const storedUser = webSessionStorage.getUser();
    const token = webSessionStorage.getAccessToken();

    if (storedUser && token) {
      setUser(storedUser);
      void profileService
        .getMe()
        .then((freshUser) => {
          if (!active) return;
          webSessionStorage.saveUser(freshUser);
          setUser(freshUser);
        })
        .catch(() => {
          // Keep state handled by apiClient refresh/auth failure subscription
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      setLoading(false);
    }

    const unsubscribe = subscribeWebAuthFailure(() => {
      if (!active) return;
      setUser(null);
      router.replace('/login');
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  const login = useCallback(async (identifier: string, password: string): Promise<LoginResult> => {
    try {
      const res = await authService.login(identifier.trim(), password);
      if (res.user.role === 'CUSTOMER') {
        return {
          success: false,
          message: 'لوحة التحكم مخصصة للمدير وموظفي الاستقبال فقط.',
        };
      }
      webSessionStorage.saveSession(res);
      setUser(res.user);
      return { success: true, user: res.user };
    } catch (err) {
      return {
        success: false,
        message:
          err instanceof WebApiError
            ? err.message
            : 'تعذر الاتصال بخادم المصادقة.',
      };
    }
  }, []);

  const refreshProfile = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const fresh = await profileService.getMe();
      webSessionStorage.saveUser(fresh);
      setUser(fresh);
      return fresh;
    } catch {
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = webSessionStorage.getRefreshToken();
    try {
      if (refreshToken) {
        await authService.logout(refreshToken);
      }
    } catch {
      // Ignore network errors during logout
    } finally {
      webSessionStorage.clearSession();
      setUser(null);
      router.replace('/login');
    }
  }, [router]);

  const hasRole = useCallback(
    (allowedRoles: UserRole[] = []): boolean => {
      if (!user) return false;
      if (allowedRoles.length === 0) return true;
      return allowedRoles.includes(user.role);
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshProfile, hasRole }),
    [user, loading, login, logout, refreshProfile, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
