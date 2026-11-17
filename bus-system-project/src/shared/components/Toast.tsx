import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamilies, FontSizes, Radii, Spacing } from '../theme';

interface ToastProps {
  message: string;
  visible: boolean;
  type?: 'success' | 'error' | 'info';
  onDismiss: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  visible,
  type = 'success',
  onDismiss,
  duration = 5000,
}) => {
  const [opacity] = useState(() => new Animated.Value(0));
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!visible) return;

    Animated.timing(opacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => onDismissRef.current());
    }, duration);

    return () => clearTimeout(timer);
  }, [visible, duration, opacity]);

  if (!visible || !message) return null;

  const getBg = () => {
    if (type === 'error') return Colors.danger;
    if (type === 'info') return Colors.primary;
    return Colors.success;
  };

  const getIconName = (): keyof typeof Ionicons.glyphMap => {
    if (type === 'error') return 'alert-circle';
    if (type === 'info') return 'information-circle';
    return 'checkmark-circle';
  };

  return (
    <Animated.View
      style={[styles.container, { opacity, backgroundColor: getBg() }]}
      accessibilityLiveRegion="polite"
    >
      <Ionicons name={getIconName()} size={20} color={Colors.textLight} />
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 28,
    left: Spacing.lg,
    right: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    zIndex: 9999,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  text: {
    color: Colors.textLight,
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.sm,
    textAlign: 'center',
    flexShrink: 1,
  },
});
