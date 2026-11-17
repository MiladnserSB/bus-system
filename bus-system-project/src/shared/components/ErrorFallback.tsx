import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ArStrings } from '../i18n/ar';
import { Colors, FontFamilies, FontSizes, Radii, Spacing } from '../theme';
import { AppButton } from './AppButton';

interface ErrorFallbackProps {
  title?: string;
  message?: string;
  onAction?: () => void;
  actionText?: string;
  secondaryActionText?: string;
  onSecondaryAction?: () => void;
  iconName?: keyof typeof Ionicons.glyphMap;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  title = 'حدث خطأ غير متوقع',
  message = ArStrings.app.offlineBanner,
  onAction,
  actionText = ArStrings.app.retry,
  secondaryActionText,
  onSecondaryAction,
  iconName = 'warning-outline',
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name={iconName} size={40} color={Colors.danger} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.actions}>
        {onAction ? <AppButton title={actionText} onPress={onAction} variant="primary" /> : null}
        {secondaryActionText && onSecondaryAction ? (
          <AppButton
            title={secondaryActionText}
            onPress={onSecondaryAction}
            variant="outline"
          />
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPage,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: Radii.full,
    backgroundColor: Colors.dangerLight,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.xl,
    color: Colors.textMain,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  message: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  actions: {
    width: '100%',
    gap: Spacing.sm,
  },
});
