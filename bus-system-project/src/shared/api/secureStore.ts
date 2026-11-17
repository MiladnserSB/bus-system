import { Platform } from 'react-native';
import * as ExpoSecureStore from 'expo-secure-store';
import { AuthUser, StoredGuestBookingRef } from '../types/api.types';
import { generateClientId } from '../constants/helpers';

const KEYS = {
  ACCESS_TOKEN: 'masar_access_token',
  REFRESH_TOKEN: 'masar_refresh_token',
  USER_PROFILE: 'masar_user_profile',
  GUEST_SESSION_ID: 'masar_guest_session_id',
  GUEST_BOOKINGS: 'masar_guest_bookings',
  FCM_TOKEN: 'masar_fcm_token',
} as const;

const memoryFallback = new Map<string, string>();

const isNativeSecureStoreSupported = (): boolean =>
  Platform.OS === 'ios' || Platform.OS === 'android';

async function setItem(key: string, value: string): Promise<void> {
  memoryFallback.set(key, value);
  try {
    if (isNativeSecureStoreSupported()) {
      await ExpoSecureStore.setItemAsync(key, value);
    } else if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Fallback remains in memoryFallback
  }
}

async function getItem(key: string): Promise<string | null> {
  try {
    if (isNativeSecureStoreSupported()) {
      const val = await ExpoSecureStore.getItemAsync(key);
      if (val !== null) {
        memoryFallback.set(key, val);
      }
      return val ?? memoryFallback.get(key) ?? null;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = window.localStorage.getItem(key);
      if (val !== null) {
        memoryFallback.set(key, val);
      }
      return val ?? memoryFallback.get(key) ?? null;
    }
  } catch {
    // Ignore storage read errors and read from memory fallback
  }
  return memoryFallback.get(key) ?? null;
}

async function removeItem(key: string): Promise<void> {
  memoryFallback.delete(key);
  try {
    if (isNativeSecureStoreSupported()) {
      await ExpoSecureStore.deleteItemAsync(key);
    } else if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore delete errors
  }
}

export const SecureStorage = {
  async saveAuthSession(params: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
  }): Promise<void> {
    await Promise.all([
      setItem(KEYS.ACCESS_TOKEN, params.accessToken),
      setItem(KEYS.REFRESH_TOKEN, params.refreshToken),
      setItem(KEYS.USER_PROFILE, JSON.stringify(params.user)),
    ]);
  },

  async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([
      setItem(KEYS.ACCESS_TOKEN, accessToken),
      setItem(KEYS.REFRESH_TOKEN, refreshToken),
    ]);
  },

  async getAccessToken(): Promise<string | null> {
    return getItem(KEYS.ACCESS_TOKEN);
  },

  async getRefreshToken(): Promise<string | null> {
    return getItem(KEYS.REFRESH_TOKEN);
  },

  async saveUser(user: AuthUser): Promise<void> {
    await setItem(KEYS.USER_PROFILE, JSON.stringify(user));
  },

  async getUser(): Promise<AuthUser | null> {
    const raw = await getItem(KEYS.USER_PROFILE);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  },

  async clearAuthSession(): Promise<void> {
    await Promise.all([
      removeItem(KEYS.ACCESS_TOKEN),
      removeItem(KEYS.REFRESH_TOKEN),
      removeItem(KEYS.USER_PROFILE),
    ]);
  },

  async getOrCreateGuestSessionId(): Promise<string> {
    const existing = await getItem(KEYS.GUEST_SESSION_ID);
    if (existing) return existing;
    const generated = generateClientId('guest');
    await setItem(KEYS.GUEST_SESSION_ID, generated);
    return generated;
  },

  async getGuestBookingRefs(): Promise<StoredGuestBookingRef[]> {
    const raw = await getItem(KEYS.GUEST_BOOKINGS);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  async saveGuestBookingRef(bookingCode: string, guestAccessToken: string): Promise<void> {
    const normalizedCode = bookingCode.trim().toUpperCase();
    const list = await SecureStorage.getGuestBookingRefs();
    const filtered = list.filter((item) => item.bookingCode !== normalizedCode);
    const updated: StoredGuestBookingRef[] = [
      {
        bookingCode: normalizedCode,
        guestAccessToken,
        createdAt: new Date().toISOString(),
      },
      ...filtered,
    ].slice(0, 20);
    await setItem(KEYS.GUEST_BOOKINGS, JSON.stringify(updated));
  },

  async getGuestTokenForBooking(bookingCode: string): Promise<string | null> {
    const normalizedCode = bookingCode.trim().toUpperCase();
    const list = await SecureStorage.getGuestBookingRefs();
    return list.find((item) => item.bookingCode === normalizedCode)?.guestAccessToken ?? null;
  },

  async saveFcmToken(token: string): Promise<void> {
    await setItem(KEYS.FCM_TOKEN, token);
  },

  async getFcmToken(): Promise<string | null> {
    return getItem(KEYS.FCM_TOKEN);
  },

  async clearFcmToken(): Promise<void> {
    await removeItem(KEYS.FCM_TOKEN);
  },
};
