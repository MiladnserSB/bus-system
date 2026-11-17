import React, { useCallback, useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, notificationsApi, SecureStorage } from '@/shared/api';
import {
  AppHeader,
  CardListSkeleton,
  EmptyState,
  ErrorBanner,
  ScreenContainer,
  Toast,
} from '@/shared/components';
import { formatDateSyrian, formatTime24h } from '@/shared/constants/helpers';
import { ArStrings } from '@/shared/i18n/ar';
import {
  Colors,
  FontFamilies,
  FontSizes,
  Radii,
  Spacing,
  TouchTargets,
} from '@/shared/theme';
import { NotificationDto } from '@/shared/types/api.types';

export default function NotificationsScreen() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nonCriticalEnabled, setNonCriticalEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const token = await SecureStorage.getAccessToken();
      setIsAuthenticated(Boolean(token));
      if (!token) {
        setNotifications([]);
        return;
      }

      const [listRes, prefRes] = await Promise.all([
        notificationsApi.getNotifications(1, 30),
        notificationsApi.getPreferences(),
      ]);
      setNotifications(listRes.items);
      setUnreadCount(listRes.unreadCount);
      setNonCriticalEnabled(prefRes.nonCriticalEnabled);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل الإشعارات حالياً.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadData();
    }, [loadData]),
  );

  const handleTogglePreference = async (value: boolean) => {
    const prev = nonCriticalEnabled;
    setNonCriticalEnabled(value);
    try {
      await notificationsApi.updatePreferences({
        nonCriticalEnabled: value,
        remindersEnabled: value,
      });
      setToast(value ? 'تم تفعيل التنبيهات التذكيرية' : 'تم إيقاف التنبيهات التذكيرية');
    } catch (err) {
      setNonCriticalEnabled(prev);
      setToast(err instanceof ApiError ? err.message : 'تعذر حفظ التفضيلات حالياً.');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'تعذر تعليم الإشعارات كمقروءة.');
    }
  };

  const handleNotificationPress = async (item: NotificationDto) => {
    if (!item.isRead) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      void notificationsApi.markAsRead(item.id).catch(() => {});
    }
    if (item.bookingId) {
      router.push('/features/(tabs)/my-bookings' as Href);
    }
  };

  const getIcon = (type: NotificationDto['type']): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'TRIP_CANCELLED':
      case 'BOOKING_CANCELLED':
        return 'close-circle';
      case 'TRIP_TIME_CHANGED':
        return 'time';
      case 'TRIP_REMINDER':
        return 'alarm';
      case 'BOOKING_CONFIRMED':
      default:
        return 'checkmark-circle';
    }
  };

  const getIconColor = (type: NotificationDto['type']) => {
    switch (type) {
      case 'TRIP_CANCELLED':
      case 'BOOKING_CANCELLED':
        return Colors.danger;
      case 'TRIP_TIME_CHANGED':
        return Colors.warning;
      case 'BOOKING_CONFIRMED':
        return Colors.success;
      default:
        return Colors.primary;
    }
  };

  return (
    <ScreenContainer
      header={
        <AppHeader
          title={ArStrings.notifications.title}
          showBack={false}
          rightSlot={
            isAuthenticated && unreadCount > 0 ? (
              <TouchableOpacity
                onPress={handleMarkAllRead}
                style={styles.markAllBtn}
                accessibilityRole="button"
              >
                <Text style={styles.markAllText}>{ArStrings.notifications.markAllRead}</Text>
              </TouchableOpacity>
            ) : undefined
          }
        />
      }
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void loadData();
      }}
    >
      {error ? <ErrorBanner message={error} onRetry={loadData} /> : null}

      {loading ? (
        <CardListSkeleton count={3} />
      ) : !isAuthenticated ? (
        <EmptyState
          iconName="notifications-outline"
          title={ArStrings.notifications.loginRequiredTitle}
          subtitle={ArStrings.notifications.loginRequiredSub}
          actionTitle={ArStrings.profile.loginCta}
          onAction={() => router.push('/features/(auth)' as Href)}
        />
      ) : (
        <View style={styles.stack}>
          {/* Notification Preferences Card */}
          <View style={styles.prefCard}>
            <View style={styles.prefRow}>
              <Switch
                value={nonCriticalEnabled}
                onValueChange={handleTogglePreference}
                trackColor={{ false: Colors.borderStrong, true: Colors.primary }}
                thumbColor={Colors.surface}
              />
              <View style={styles.prefTextWrap}>
                <Text style={styles.prefTitle}>{ArStrings.notifications.preferencesLabel}</Text>
                <Text style={styles.prefSub}>{ArStrings.notifications.preferencesHint}</Text>
              </View>
            </View>
          </View>

          {notifications.length === 0 ? (
            <EmptyState
              iconName="notifications-off-outline"
              title={ArStrings.notifications.emptyTitle}
              subtitle={ArStrings.notifications.emptySub}
            />
          ) : (
            notifications.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => void handleNotificationPress(item)}
                style={[styles.notifCard, !item.isRead ? styles.notifUnread : null]}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <View style={styles.notifHeader}>
                  <Ionicons name={getIcon(item.type)} size={20} color={getIconColor(item.type)} />
                  <Text style={styles.notifTitle}>{item.title}</Text>
                  {!item.isRead ? <View style={styles.unreadDot} /> : null}
                </View>
                <Text style={styles.notifBody}>{item.body}</Text>
                <Text style={styles.notifTime}>
                  {formatDateSyrian(item.createdAt)} · {formatTime24h(item.createdAt)}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      <Toast message={toast} visible={Boolean(toast)} onDismiss={() => setToast('')} type="info" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  markAllBtn: {
    minHeight: TouchTargets.minSize,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  markAllText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
    color: Colors.primary,
  },
  stack: {
    gap: Spacing.sm,
  },
  prefCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  prefTextWrap: {
    flex: 1,
  },
  prefTitle: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.md,
    color: Colors.textMain,
    textAlign: 'right',
  },
  prefSub: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    lineHeight: 18,
    marginTop: 2,
  },
  notifCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  notifUnread: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 4,
  },
  notifTitle: {
    flex: 1,
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.md,
    color: Colors.textMain,
    textAlign: 'right',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  notifBody: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  notifTime: {
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
