/**
 * Unified Typography Tokens using Cairo Arabic font & Western digits (0-9)
 */
export const FontFamilies = {
  regular: 'Cairo_400Regular',
  semiBold: 'Cairo_600SemiBold',
  bold: 'Cairo_700Bold',
  extraBold: 'Cairo_800ExtraBold',
} as const;

export const FontSizes = {
  xs: 11,
  sm: 12,
  md: 14,
  base: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  hero: 28,
} as const;

export const Typography = {
  heroTitle: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.hero,
    lineHeight: 38,
  },
  screenTitle: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.xl,
    lineHeight: 30,
  },
  sectionTitle: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.lg,
    lineHeight: 26,
  },
  cardTitle: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.base,
    lineHeight: 24,
  },
  body: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.md,
    lineHeight: 22,
  },
  bodyStrong: {
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.md,
    lineHeight: 22,
  },
  caption: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  label: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  numeric: {
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
} as const;
