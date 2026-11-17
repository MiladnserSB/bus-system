import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Network from 'expo-network';

/**
 * Tracks real-time device network connectivity via `expo-network` (native)
 * and browser online/offline events (web).
 */
export function useNetwork() {
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean | null>(true);

  const checkNow = useCallback(async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
        const online = navigator.onLine !== false;
        setIsConnected(online);
        setIsInternetReachable(online);
        return online;
      }
      const state = await Network.getNetworkStateAsync();
      const connected = Boolean(state.isConnected);
      const reachable = state.isInternetReachable ?? connected;
      setIsConnected(connected);
      setIsInternetReachable(reachable);
      return connected && reachable !== false;
    } catch {
      return true;
    }
  }, []);

  useEffect(() => {
    let active = true;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleOnline = () => {
        if (!active) return;
        setIsConnected(true);
        setIsInternetReachable(true);
      };
      const handleOffline = () => {
        if (!active) return;
        setIsConnected(false);
        setIsInternetReachable(false);
      };
      const syncInitial = setTimeout(() => {
        if (!active) return;
        const online = navigator.onLine !== false;
        setIsConnected(online);
        setIsInternetReachable(online);
      }, 0);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        active = false;
        clearTimeout(syncInitial);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    void Network.getNetworkStateAsync()
      .then((state) => {
        if (!active) return;
        const connected = Boolean(state.isConnected);
        const reachable = state.isInternetReachable ?? connected;
        setIsConnected(connected);
        setIsInternetReachable(reachable);
      })
      .catch(() => {});

    const subscription = Network.addNetworkStateListener((state) => {
      if (!active) return;
      const connected = Boolean(state.isConnected);
      const reachable = state.isInternetReachable ?? connected;
      setIsConnected(connected);
      setIsInternetReachable(reachable);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const isOffline = !isConnected || isInternetReachable === false;

  return {
    isConnected,
    isInternetReachable,
    isOffline,
    checkNow,
  };
}
