import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { createApiClient, resolveApiBaseUrl } from './clientCore';
import { SecureStorage } from './secureStore';

export {
  ApiError,
  createApiClient,
  resolveApiBaseUrl,
  type ApiClientDeps,
  type ApiRequestOptions,
} from './clientCore';

function resolveRuntimeBaseUrl(): string {
  const explicit =
    typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_API_URL : undefined;
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim().replace(/\/+$/, '');
  }

  // On physical phones running Expo Go over Wi-Fi, automatically derive the
  // developer machine's LAN IP from Expo's hostUri so localhost doesn't loop back
  // to the mobile device itself.
  const manifestHost =
    Constants.expoConfig?.hostUri ??
    (
      Constants as unknown as {
        manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } };
      }
    ).manifest2?.extra?.expoGo?.debuggerHost;

  if (manifestHost) {
    const host = manifestHost.split(':')[0]?.trim();
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:3000/api/v1`;
    }
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    const webHost = window.location.hostname;
    if (webHost !== 'localhost' && webHost !== '127.0.0.1') {
      return `http://${webHost}:3000/api/v1`;
    }
  }

  return resolveApiBaseUrl();
}

export const apiClient = createApiClient({
  baseUrl: resolveRuntimeBaseUrl(),
  getAccessToken: SecureStorage.getAccessToken,
  getRefreshToken: SecureStorage.getRefreshToken,
  onTokensRefreshed: async (res) => {
    await SecureStorage.saveAuthSession({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      user: res.user,
    });
  },
  onAuthFailure: SecureStorage.clearAuthSession,
});
