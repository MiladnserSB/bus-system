import { I18nManager, Platform } from 'react-native';

/**
 * Forces full Arabic RTL direction on native & web containers (SRS 3.1.1).
 */
export function ensureRTL(): void {
  if (Platform.OS !== 'web') {
    if (!I18nManager.isRTL) {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(true);
    }
  } else if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('dir', 'rtl');
    document.documentElement.setAttribute('lang', 'ar');
  }
}

export const isRTL = (): boolean => true;
