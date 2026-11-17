import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { generateClientId } from '../constants/helpers';
import { devicesApi } from './services';
import { SecureStorage } from './secureStore';

function resolveDevicePlatform(): 'ANDROID' | 'IOS' | 'WEB' {
  if (Platform.OS === 'ios') return 'IOS';
  if (Platform.OS === 'android') return 'ANDROID';
  return 'WEB';
}

export const FcmService = {
  /**
   * Obtains or generates a stable device push registration token and registers
   * it against `POST /api/v1/devices` when an authenticated user exists.
   */
  async registerDevice(): Promise<string | null> {
    try {
      const accessToken = await SecureStorage.getAccessToken();
      if (!accessToken) return null;

      let fcmToken = await SecureStorage.getFcmToken();
      if (!fcmToken) {
        const appId = Constants.expoConfig?.slug ?? 'masar-mobile';
        fcmToken = generateClientId(`${appId}-${Platform.OS}`);
        await SecureStorage.saveFcmToken(fcmToken);
      }

      await devicesApi.registerDevice(fcmToken, resolveDevicePlatform());
      return fcmToken;
    } catch {
      return null;
    }
  },

  /**
   * Unregisters active device push token (`DELETE /api/v1/devices/:fcmToken`)
   * and clears local token record.
   */
  async unregisterDevice(): Promise<void> {
    try {
      const fcmToken = await SecureStorage.getFcmToken();
      if (fcmToken) {
        await devicesApi.unregisterDevice(fcmToken);
      }
    } catch {
      // Ignore network errors when unregistering device
    } finally {
      await SecureStorage.clearFcmToken();
    }
  },
};
