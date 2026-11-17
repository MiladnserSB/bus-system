import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArStrings } from '../i18n/ar';
import { Colors, FontFamilies, FontSizes, Radii, Spacing, TouchTargets } from '../theme';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmTitle?: string;
  cancelTitle?: string;
  isDestructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  visible,
  title,
  message,
  confirmTitle = ArStrings.app.confirm,
  cancelTitle = ArStrings.app.cancel,
  isDestructive = false,
  loading = false,
  onConfirm,
  onCancel,
  children,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {children}
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onCancel}
              disabled={loading}
              style={styles.cancelBtn}
              accessibilityRole="button"
              accessibilityLabel={cancelTitle}
            >
              <Text style={styles.cancelText}>{cancelTitle}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              disabled={loading}
              style={[
                styles.confirmBtn,
                { backgroundColor: isDestructive ? Colors.danger : Colors.primary },
              ]}
              accessibilityRole="button"
              accessibilityLabel={confirmTitle}
            >
              <Text style={styles.confirmText}>
                {loading ? ArStrings.app.loading : confirmTitle}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.lg,
    color: Colors.textMain,
    textAlign: 'right',
    marginBottom: Spacing.xs,
  },
  message: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'right',
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  cancelBtn: {
    minHeight: TouchTargets.minSize,
    minWidth: TouchTargets.minSize,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radii.md,
    backgroundColor: Colors.bgPage,
    borderWidth: 1,
    borderColor: Colors.border,
    flex: 1,
  },
  cancelText: {
    fontFamily: FontFamilies.bold,
    color: Colors.textSecondary,
    fontSize: FontSizes.md,
  },
  confirmBtn: {
    minHeight: TouchTargets.minSize,
    minWidth: TouchTargets.minSize,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radii.md,
    flex: 1,
  },
  confirmText: {
    fontFamily: FontFamilies.bold,
    color: Colors.textLight,
    fontSize: FontSizes.md,
  },
});
