/**
 * Unified Design Tokens aligned between BusSystem-master (Web) and bus-system-project (Mobile)
 * Brand Palette: Deep Blue (#133883), Accent Amber (#E0A100) + SRS 3.1.1 Seat States.
 */
export const DesignTokens = {
  brand: {
    primary: '#133883',
    primaryDark: '#0D275C',
    primaryLight: '#EBF1FC',
    accent: '#E0A100',
    accentLight: '#FEF6E0',
  },
  semantic: {
    success: '#16A34A',
    successLight: '#DCFCE7',
    danger: '#DC2626',
    dangerLight: '#FEE2E2',
    warning: '#D97706',
    warningLight: '#FEF3C7',
    info: '#0284C7',
    infoLight: '#E0F2FE',
  },
  seatMap: {
    availableBg: '#EFF6FF',
    availableBorder: '#93C5FD',
    availableText: '#1E3A8A',
    bookedBg: '#FEE2E2',
    bookedBorder: '#FCA5A5',
    bookedText: '#991B1B',
    heldBg: '#FEF3C7',
    heldBorder: '#F59E0B',
    heldText: '#92400E',
    selectedBg: '#133883',
    selectedBorder: '#0D275C',
    selectedText: '#FFFFFF',
    extraBg: '#FFFBEB',
    extraBorder: '#E0A100',
  },
  toastDurationMs: 5000,
  seatPollingMs: 10_000,
} as const;
