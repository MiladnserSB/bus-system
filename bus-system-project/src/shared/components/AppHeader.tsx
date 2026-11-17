import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamilies, FontSizes, Radii, Spacing, TouchTargets } from '../theme';
import { ArStrings } from '../i18n/ar';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBackPress?: () => void;
  rightSlot?: React.ReactNode;
  stepBadge?: string;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  showBack = true,
  onBackPress,
  rightSlot,
  stepBadge,
}) => {
  const router = useRouter();

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/features/(tabs)' as Href);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {showBack ? (
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backBtn}
            accessibilityLabel={ArStrings.app.back}
            accessibilityRole="button"
            activeOpacity={0.75}
          >
            {/* RTL-mirrored back arrow pointing right */}
            <Ionicons name="arrow-forward" size={22} color={Colors.textMain} />
          </TouchableOpacity>
        ) : (
          <View style={styles.sideSpacer} />
        )}

        <View style={styles.center}>
          {stepBadge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{stepBadge}</Text>
            </View>
          ) : null}
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.rightSlot}>{rightSlot ?? <View style={styles.sideSpacer} />}</View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  backBtn: {
    minWidth: TouchTargets.minSize,
    minHeight: TouchTargets.minSize,
    borderRadius: Radii.md,
    backgroundColor: Colors.bgPage,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideSpacer: {
    width: TouchTargets.minSize,
    height: TouchTargets.minSize,
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  badge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.full,
    marginBottom: 2,
  },
  badgeText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
    color: Colors.primary,
  },
  title: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.lg,
    color: Colors.textMain,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 1,
  },
  rightSlot: {
    minWidth: TouchTargets.minSize,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
