import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ArStrings } from '@/shared/i18n/ar';
import { Colors, FontFamilies, FontSizes, Spacing } from '@/shared/theme';

export default function GlobalLoading() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.text}>
        {ArStrings.app.brandName} · {ArStrings.app.loading}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPage,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  text: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
});
