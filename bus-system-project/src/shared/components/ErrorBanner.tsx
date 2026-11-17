import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamilies, FontSizes, Radii, Spacing, TouchTargets } from '../theme';
import { ArStrings } from '../i18n/ar';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  retryText?: string;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  message,
  onRetry,
  retryText = ArStrings.app.retry,
}) => {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <View style={styles.contentRow}>
        <Ionicons name="alert-circle" size={20} color={Colors.danger} />
        <Text style={styles.message}>{message}</Text>
      </View>
      {onRetry ? (
        <TouchableOpacity
          onPress={onRetry}
          style={styles.retryBtn}
          accessibilityRole="button"
          accessibilityLabel={retryText}
        >
          <Text style={styles.retryText}>{retryText}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dangerLight,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  message: {
    flex: 1,
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.sm,
    color: '#991B1B',
    textAlign: 'right',
    lineHeight: 20,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    minHeight: TouchTargets.minSize,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
  },
  retryText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.sm,
    color: Colors.danger,
  },
});
