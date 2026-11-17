import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, bookingsApi, SecureStorage } from '@/shared/api';
import {
  AppButton,
  AppHeader,
  AppInput,
  CardListSkeleton,
  EmptyState,
  ErrorBanner,
  ScreenContainer,
} from '@/shared/components';
import { formatDateSyrian, formatPrice, formatTime24h } from '@/shared/constants/helpers';
import { ArStrings } from '@/shared/i18n/ar';
import {
  Colors,
  FontFamilies,
  FontSizes,
  Radii,
  Shadows,
  Spacing,
  TouchTargets,
} from '@/shared/theme';
import { BookingDto } from '@/shared/types/api.types';

type TabFilter = 'upcoming' | 'past' | 'cancelled';

export default function MyBookingsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabFilter>('upcoming');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [bookings, setBookings] = useState<BookingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lookupCode, setLookupCode] = useState('');
  const [lookupError, setLookupError] = useState('');

  const loadBookings = useCallback(
    async (tab: TabFilter) => {
      setError(null);
      try {
        const token = await SecureStorage.getAccessToken();
        setIsAuthenticated(Boolean(token));

        if (token) {
          const list = await bookingsApi.getMyBookings(tab);
          setBookings(list);
          return;
        }

        // Guest mode: load any locally persisted guest booking references
        const refs = await SecureStorage.getGuestBookingRefs();
        const settled = await Promise.all(
          refs.map((ref) =>
            bookingsApi.getBookingByCode(ref.bookingCode, ref.guestAccessToken).catch(() => null),
          ),
        );
        const now = Date.now();
        const valid = settled.filter((b): b is BookingDto => b !== null);
        const filtered = valid.filter((b) => {
          const departMs = new Date(b.trip.departAt).getTime();
          if (tab === 'cancelled') return b.status === 'CANCELLED';
          if (tab === 'past') return b.status !== 'CANCELLED' && departMs < now;
          return b.status !== 'CANCELLED' && departMs >= now;
        });
        setBookings(filtered);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'تعذر تحميل الحجوزات حالياً.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadBookings(activeTab);
    }, [activeTab, loadBookings]),
  );

  const handleTabPress = (tab: TabFilter) => {
    setActiveTab(tab);
    setLoading(true);
    void loadBookings(tab);
  };

  const handleLookup = () => {
    const clean = lookupCode.trim().toUpperCase();
    if (!clean) {
      setLookupError('أدخل رقم الحجز مثل BK-20261117-0001');
      return;
    }
    setLookupError('');
    router.push(`/features/tickets/${encodeURIComponent(clean)}` as Href);
  };

  const getStatusBadge = (status: BookingDto['status']) => {
    if (status === 'CANCELLED') {
      return {
        label: ArStrings.ticket.statusCancelled,
        bg: Colors.dangerLight,
        color: Colors.danger,
      };
    }
    if (status === 'PARTIAL_CANCELLED') {
      return {
        label: ArStrings.ticket.statusPartialCancelled,
        bg: Colors.warningLight,
        color: Colors.warning,
      };
    }
    return {
      label: ArStrings.ticket.statusConfirmed,
      bg: Colors.successLight,
      color: Colors.success,
    };
  };

  const emptyCopy =
    activeTab === 'upcoming'
      ? { title: ArStrings.myBookings.emptyUpcomingTitle, sub: ArStrings.myBookings.emptyUpcomingSub }
      : activeTab === 'past'
        ? { title: ArStrings.myBookings.emptyPastTitle, sub: ArStrings.myBookings.emptyPastSub }
        : { title: ArStrings.myBookings.emptyCancelledTitle, sub: ArStrings.myBookings.emptyCancelledSub };

  return (
    <ScreenContainer
      header={<AppHeader title={ArStrings.myBookings.title} showBack={false} />}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void loadBookings(activeTab);
      }}
    >
      {/* Segmented Tabs */}
      <View style={styles.segmentContainer}>
        {(
          [
            { key: 'upcoming', label: ArStrings.myBookings.tabUpcoming },
            { key: 'past', label: ArStrings.myBookings.tabPast },
            { key: 'cancelled', label: ArStrings.myBookings.tabCancelled },
          ] as const
        ).map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => handleTabPress(tab.key)}
              style={[styles.segmentBtn, active ? styles.segmentBtnActive : null]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!isAuthenticated ? (
        <View style={styles.guestCard}>
          <Text style={styles.guestTitle}>{ArStrings.myBookings.guestHeading}</Text>
          <Text style={styles.guestSub}>{ArStrings.myBookings.guestLoginHint}</Text>
          <View style={styles.lookupRow}>
            <View style={styles.lookupInputWrap}>
              <AppInput
                placeholder={ArStrings.myBookings.lookupPlaceholder}
                value={lookupCode}
                onChangeText={(t) => {
                  setLookupCode(t);
                  if (lookupError) setLookupError('');
                }}
                error={lookupError}
                containerStyle={styles.noBottomMargin}
              />
            </View>
            <AppButton
              title={ArStrings.myBookings.lookupBtn}
              onPress={handleLookup}
              variant="outline"
              style={styles.lookupBtn}
            />
          </View>
          <AppButton
            title={ArStrings.profile.loginCta}
            onPress={() => router.push('/features/(auth)' as Href)}
            variant="primary"
            style={styles.mtSm}
          />
        </View>
      ) : null}

      {error ? (
        <ErrorBanner message={error} onRetry={() => void loadBookings(activeTab)} />
      ) : null}

      {loading ? (
        <CardListSkeleton count={3} />
      ) : bookings.length === 0 ? (
        <EmptyState
          iconName="ticket-outline"
          title={emptyCopy.title}
          subtitle={emptyCopy.sub}
          actionTitle={activeTab === 'upcoming' ? 'استكشاف الرحلات' : undefined}
          onAction={activeTab === 'upcoming' ? () => router.push('/features/(tabs)' as Href) : undefined}
        />
      ) : (
        <View style={styles.listGap}>
          {bookings.map((booking) => {
            const badge = getStatusBadge(booking.status);
            const activeSeats = booking.seats.filter((s) => s.isActive);
            const displaySeats = activeSeats.length > 0 ? activeSeats : booking.seats;
            return (
              <TouchableOpacity
                key={booking.code}
                activeOpacity={0.85}
                onPress={() => router.push(`/features/tickets/${booking.code}` as Href)}
                style={styles.bookingCard}
                accessibilityRole="button"
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                  </View>
                  <Text style={styles.bookingCode}>{booking.code}</Text>
                </View>

                <Text style={styles.routeText}>
                  {booking.trip.origin.nameAr} ← {booking.trip.destination.nameAr}
                </Text>

                <View style={styles.metaRow}>
                  <Ionicons name="calendar-outline" size={15} color={Colors.textMuted} />
                  <Text style={styles.metaText}>
                    {formatDateSyrian(booking.trip.departDateDamascus)} ·{' '}
                    {booking.trip.departTimeDamascus || formatTime24h(booking.trip.departAt)}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <Ionicons name="bus-outline" size={15} color={Colors.textMuted} />
                  <Text style={styles.metaText}>
                    {booking.trip.busType.nameAr} · المقاعد:{' '}
                    {displaySeats.map((s) => s.seatNumber).join('، ')}
                  </Text>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.priceText}>{formatPrice(booking.totalPrice)}</Text>
                  <Text style={styles.viewTicketLink}>{ArStrings.search.viewTicketCta} ‹</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
    marginBottom: Spacing.md,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    minHeight: TouchTargets.minSize,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: Colors.primary,
  },
  segmentText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  segmentTextActive: {
    color: Colors.textLight,
  },
  guestCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  guestTitle: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.base,
    color: Colors.textMain,
    textAlign: 'right',
    marginBottom: 4,
  },
  guestSub: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    marginBottom: Spacing.sm,
  },
  lookupRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  lookupInputWrap: {
    flex: 1,
  },
  noBottomMargin: {
    marginBottom: 0,
  },
  lookupBtn: {
    paddingHorizontal: Spacing.md,
  },
  mtSm: {
    marginTop: Spacing.sm,
  },
  listGap: {
    gap: Spacing.md,
  },
  bookingCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    ...Shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radii.full,
  },
  badgeText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
  },
  bookingCode: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  routeText: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.lg,
    color: Colors.textMain,
    textAlign: 'right',
    marginBottom: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 4,
  },
  metaText: {
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
  },
  priceText: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.base,
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  viewTicketLink: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.sm,
    color: Colors.primary,
  },
});
