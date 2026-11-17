import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { Colors, FontFamilies, FontSizes, Radii, Spacing, TouchTargets } from '../theme';

interface AppInputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  prefixText?: string;
  leftAdornment?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export const AppInput: React.FC<AppInputProps> = ({
  label,
  error,
  hint,
  prefixText,
  leftAdornment,
  containerStyle,
  style,
  ...props
}) => {
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrapper,
          error ? styles.inputError : null,
          props.editable === false ? styles.inputDisabled : null,
        ]}
      >
        {prefixText ? (
          <View style={styles.prefixBadge}>
            <Text style={styles.prefixText}>{prefixText}</Text>
          </View>
        ) : null}
        <TextInput
          placeholderTextColor={Colors.textMuted}
          textAlign="right"
          style={[styles.input, style]}
          {...props}
        />
        {leftAdornment ? <View style={styles.adornment}>{leftAdornment}</View> : null}
      </View>
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hintText}>{hint}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
    width: '100%',
  },
  label: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    textAlign: 'right',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    minHeight: TouchTargets.buttonHeight,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.xs,
  },
  inputError: {
    borderColor: Colors.danger,
    backgroundColor: '#FFFDFD',
  },
  inputDisabled: {
    backgroundColor: Colors.surfaceAlt,
  },
  prefixBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: '#C7D7F6',
  },
  prefixText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.md,
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  input: {
    flex: 1,
    minHeight: TouchTargets.minSize,
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.base,
    color: Colors.textMain,
    paddingVertical: Spacing.xs,
  },
  adornment: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontFamily: FontFamilies.semiBold,
    color: Colors.danger,
    fontSize: FontSizes.xs,
    marginTop: Spacing.xxs,
    textAlign: 'right',
  },
  hintText: {
    fontFamily: FontFamilies.regular,
    color: Colors.textMuted,
    fontSize: FontSizes.xs,
    marginTop: Spacing.xxs,
    textAlign: 'right',
  },
});
