import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Colors, FontFamilies, FontSizes, Radii, Spacing, TouchTargets } from '../theme';

interface AppButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'accent' | 'secondary' | 'outline' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  accessibilityLabel?: string;
}

export const AppButton: React.FC<AppButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  textStyle,
  leftIcon,
  rightIcon,
  accessibilityLabel,
}) => {
  const isDisabled = disabled || loading;

  const getBgStyle = (): ViewStyle => {
    if (isDisabled && variant !== 'ghost' && variant !== 'outline') {
      return { backgroundColor: Colors.borderStrong };
    }
    switch (variant) {
      case 'accent':
        return { backgroundColor: Colors.accent };
      case 'secondary':
        return { backgroundColor: Colors.primaryLight };
      case 'outline':
        return {
          backgroundColor: Colors.surface,
          borderWidth: 1.5,
          borderColor: isDisabled ? Colors.border : Colors.primary,
        };
      case 'danger':
        return { backgroundColor: Colors.danger };
      case 'ghost':
        return { backgroundColor: 'transparent' };
      case 'primary':
      default:
        return { backgroundColor: Colors.primary };
    }
  };

  const getTextColor = (): string => {
    if (isDisabled) {
      return variant === 'outline' || variant === 'ghost'
        ? Colors.textMuted
        : Colors.surface;
    }
    switch (variant) {
      case 'secondary':
      case 'outline':
      case 'ghost':
        return Colors.primary;
      case 'accent':
        return Colors.textMain;
      case 'danger':
      case 'primary':
      default:
        return Colors.textLight;
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={[styles.button, getBgStyle(), style]}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <View style={styles.contentRow}>
          {rightIcon}
          <Text style={[styles.text, { color: getTextColor() }, textStyle]}>{title}</Text>
          {leftIcon}
        </View>
      )}
    </TouchableOpacity>
  );
};

export const PrimaryButton = AppButton;

const styles = StyleSheet.create({
  button: {
    minHeight: TouchTargets.buttonHeight,
    minWidth: TouchTargets.minSize,
    borderRadius: Radii.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  text: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.base,
    textAlign: 'center',
  },
});
