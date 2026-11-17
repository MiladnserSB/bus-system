import { ViewStyle } from 'react-native';

/**
 * Spacing, Radii, Touch Targets & Shadows — SRS 3.1.1 (>= 44x44 px targets)
 */
export const Spacing = {
  xxs: 4,
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
} as const;

export const Radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

export const TouchTargets = {
  minSize: 44,
  buttonHeight: 50,
  compactHeight: 44,
} as const;

export const Shadows: Record<'card' | 'floating', ViewStyle> = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  floating: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
};

export const Layout = {
  minTouchSize: TouchTargets.minSize,
  borderRadius: Radii,
  spacing: Spacing,
} as const;
