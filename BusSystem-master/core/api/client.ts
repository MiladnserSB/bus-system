import { AuthTokensResponse, AuthUser } from '@/types/api.types';
import { createWebApiClient } from './clientCore';

export {
  createWebApiClient,
  resolveWebApiBaseUrl,
  WebApiError,
  type WebApiClientDeps,
  type WebRequestOptions,
} from './clientCore';

export const WEB_STORAGE_KEYS = {
  ACCESS_TOKEN: 'masar_access_token',
  REFRESH_TOKEN: 'masar_refresh_token',
  USER: 'masar_user',
} as const;

export const webSessionStorage = {
  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(WEB_STORAGE_KEYS.ACCESS_TOKEN);
    } catch {
      return null;
    }
  },

  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(WEB_STORAGE_KEYS.REFRESH_TOKEN);
    } catch {
      return null;
    }
  },

  getUser(): AuthUser | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(WEB_STORAGE_KEYS.USER);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  },

  saveSession(tokens: AuthTokensResponse): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(WEB_STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken);
      window.localStorage.setItem(WEB_STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
      window.localStorage.setItem(WEB_STORAGE_KEYS.USER, JSON.stringify(tokens.user));
    } catch {
      // Ignore storage quota errors
    }
  },

  saveUser(user: AuthUser): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(WEB_STORAGE_KEYS.USER, JSON.stringify(user));
    } catch {
      // Ignore
    }
  },

  clearSession(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(WEB_STORAGE_KEYS.ACCESS_TOKEN);
      window.localStorage.removeItem(WEB_STORAGE_KEYS.REFRESH_TOKEN);
      window.localStorage.removeItem(WEB_STORAGE_KEYS.USER);
    } catch {
      // Ignore
    }
  },
};

type AuthFailureListener = () => void;
const authFailureListeners = new Set<AuthFailureListener>();

export function subscribeWebAuthFailure(listener: AuthFailureListener): () => void {
  authFailureListeners.add(listener);
  return () => {
    authFailureListeners.delete(listener);
  };
}

export const apiClient = createWebApiClient({
  getAccessToken: webSessionStorage.getAccessToken,
  getRefreshToken: webSessionStorage.getRefreshToken,
  onTokensRefreshed: webSessionStorage.saveSession,
  onAuthFailure: () => {
    webSessionStorage.clearSession();
    authFailureListeners.forEach((fn) => fn());
  },
});
