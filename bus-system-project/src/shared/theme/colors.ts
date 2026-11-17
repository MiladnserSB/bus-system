/**
 * Unified Design System Colors — Step 2 & SRS 3.1.1
 * Note: Primary Deep Blue (#133883) & Accent Amber (#E0A100).
 */
export const Colors = {
  // Brand Palette
  primary: '#133883',
  primaryDark: '#0D275C',
  primaryLight: '#EBF1FC',
  accent: '#E0A100',
  accentLight: '#FEF6E0',

  // Backgrounds & Surfaces
  bgPage: '#F4F6FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',

  // Typography
  textMain: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',
  textLight: '#FFFFFF',

  // Semantic Status Colors
  success: '#16A34A',
  successLight: '#DCFCE7',
  successBorder: '#86EFAC',
  warning: '#D97706',
  warningLight: '#FEF3C7',
  warningBorder: '#FCD34D',
  danger: '#DC2626',
  dangerLight: '#FEE2E2',
  dangerBorder: '#FCA5A5',
  info: '#0284C7',
  infoLight: '#E0F2FE',
  infoBorder: '#7DD3FC',

  // Seat Map Accessible Palette — SRS 3.1.1 (Paired with icons & labels, never color alone)
  // متاح أزرق فاتح، محجوز أحمر فاتح، قيد الحجز أصفر، محدد أزرق داكن مع علامة ✓
  seatAvailable: '#EFF6FF',
  seatAvailableBorder: '#93C5FD',
  seatAvailableText: '#1E3A8A',

  seatBooked: '#FEE2E2',
  seatBookedBorder: '#FCA5A5',
  seatBookedText: '#991B1B',

  seatHeld: '#FEF3C7',
  seatHeldBorder: '#F59E0B',
  seatHeldText: '#92400E',

  seatSelected: '#133883',
  seatSelectedBorder: '#0D275C',
  seatSelectedText: '#FFFFFF',

  seatExtraBg: '#FFFBEB',
  seatExtraBorder: '#E0A100',
} as const;

export type ColorToken = keyof typeof Colors;
