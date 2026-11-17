import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNetwork } from '../hooks/useNetwork';
import { ArStrings } from '../i18n/ar';
import { Colors, FontFamilies, FontSizes, Spacing } from '../theme';

interface OfflineBannerProps {
  forceOffline?: boolean;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ forceOffline }) => {
  const { isOffline } = useNetwork();
  const visible = forceOffline !== undefined ? forceOffline : isOffline;

  if (!visible) return null;

  return (
    <View style={styles.container} accessibilityLiveRegion="assertive">
      <Ionicons name="cloud-offline" size={16} color={Colors.textLight} />
      <Text style={styles.text}>{ArStrings.app.offlineBanner}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.danger,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  text: {
    color: Colors.textLight,
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
    textAlign: 'center',
  },
});
