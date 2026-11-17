import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, holdsApi, tripsApi } from '@/shared/api';
import {
  AppButton,
  AppHeader,
  ConfirmModal,
  ErrorBanner,
  ScreenContainer,
  SeatMapGrid,
  SeatMapSkeleton,
  Toast,
} from '@/shared/components';
import { formatDateSyrian, formatPrice, formatTime24h } from '@/shared/constants/helpers';
import { useExpiresAtCountdown } from '@/shared/hooks/useCountdown';
import { useSeatPolling } from '@/shared/hooks/useSeatPolling';
import { ArStrings } from '@/shared/i18n/ar';
import { Colors, FontFamilies, FontSizes, Radii, Spacing, TouchTargets } from '@/shared/theme';
import { SeatDto, TripDetailDto } from '@/shared/types/api.types';

const MAX_SEATS = 6;

export default function TripSeatSelectionScreen() {
  const router = useRouter();
  const { tripId: tripIdRaw, passengers } = useLocalSearchParams<{
    tripId: string;
    passengers?: string;
  }>();
  const tripId = Number(tripIdRaw);
  const requestedPassengers = Math.max(1, Number(passengers ?? '1') || 1);

  const [tripDetail, setTripDetail] = useState<TripDetailDto | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [mutatingSeat, setMutatingSeat] = useState(false);
  const [expiredModalVisible, setExpiredModalVisible] = useState(false);
  const [toast, setToast] = useState('');

  const navigatingForwardRef = useRef(false);
  const activeHoldRef = useRef<string | null>(null);

  useEffect(() => {
    activeHoldRef.current = holdId;
  }, [holdId]);

  const handleHoldExpired = useCallback(() => {
    if (!activeHoldRef.current) return;
    setHoldId(null);
    setHoldExpiresAt(null);
    setSelectedSeats([]);
    setExpiredModalVisible(true);
  }, []);

  const { formattedTime } = useExpiresAtCountdown(holdExpiresAt, handleHoldExpired);

  useEffect(() => {
    if (!tripId || Number.isNaN(tripId)) return;
    void tripsApi
      .getTrip(tripId)
      .then(setTripDetail)
      .catch(() => {});
  }, [tripId]);

  const fetchSeats = useCallback(() => tripsApi.getSeatMap(tripId), [tripId]);
  const handleSeatMapData = useCallback((map: { seats: SeatDto[] }) => {
    const heldByMe = map.seats
      .filter((s) => s.status === 'HELD_BY_ME')
      .map((s) => s.seatNumber);

    if (heldByMe.length > 0) {
      setSelectedSeats((prev) => (prev.length === 0 ? heldByMe : prev));
      const earliestExpiry = map.seats.find(
        (s) => s.status === 'HELD_BY_ME' && s.holdExpiresAt,
      )?.holdExpiresAt;
      if (earliestExpiry) {
        setHoldExpiresAt((prev) => prev ?? earliestExpiry);
      }
    }
  }, []);

  const {
    seatMap,
    isLoading,
    isRefreshing,
    error,
    refreshNow,
  } = useSeatPolling(fetchSeats, Boolean(tripId && !Number.isNaN(tripId)), handleSeatMapData);

  // Release temporary Redis hold if user exits screen backward without proceeding
  useFocusEffect(
    useCallback(() => {
      navigatingForwardRef.current = false;
      return () => {
        if (!navigatingForwardRef.current && activeHoldRef.current) {
          void holdsApi.releaseHold(activeHoldRef.current).catch(() => {});
        }
      };
    }, []),
  );

  const handleToggleSeat = async (seat: SeatDto) => {
    if (mutatingSeat) return;

    const alreadySelected =
      selectedSeats.includes(seat.seatNumber) || seat.status === 'HELD_BY_ME';

    if (alreadySelected) {
      const nextSeats = selectedSeats.filter((s) => s !== seat.seatNumber);
      setMutatingSeat(true);
      try {
        if (holdId) {
          await holdsApi.releaseHold(holdId).catch(() => {});
        }
        if (nextSeats.length > 0) {
          const newHold = await holdsApi.createHold(tripId, nextSeats);
          setHoldId(newHold.holdId);
          setHoldExpiresAt(newHold.expiresAt);
          setSelectedSeats(newHold.seatNumbers);
        } else {
          setHoldId(null);
          setHoldExpiresAt(null);
          setSelectedSeats([]);
        }
        await refreshNow(true);
      } catch (err) {
        setToast(err instanceof ApiError ? err.message : 'تعذر تحديث اختيار المقعد.');
        await refreshNow(true);
      } finally {
        setMutatingSeat(false);
      }
      return;
    }

    if (selectedSeats.length >= MAX_SEATS) {
      setToast(ArStrings.seats.maxSeatsNotice);
      return;
    }

    const nextSeats = [...selectedSeats, seat.seatNumber];
    setMutatingSeat(true);
    try {
      const res = await holdsApi.createHold(tripId, nextSeats);
      setHoldId(res.holdId);
      setHoldExpiresAt(res.expiresAt);
      setSelectedSeats(res.seatNumbers);
      await refreshNow(true);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'تعذر حجز هذا المقعد مؤقتاً، قد يكون اختاره مسافر آخر.';
      setToast(msg);
      await refreshNow(true);
    } finally {
      setMutatingSeat(false);
    }
  };

  const handleContinue = () => {
    if (selectedSeats.length === 0 || !holdId) {
      setToast(ArStrings.seats.selectAtLeastOne);
      return;
    }
    navigatingForwardRef.current = true;
    router.push({
      pathname: `/features/trips/${tripId}/booking`,
      params: {
        seats: selectedSeats.join(','),
        holdId,
        holdExpiresAt: holdExpiresAt ?? '',
        unitPrice: String(seatMap?.price ?? tripDetail?.price ?? 0),
        routeLabel: tripDetail
          ? `${tripDetail.origin.nameAr} ← ${tripDetail.destination.nameAr}`
          : '',
        departTime: tripDetail?.departTimeDamascus ?? '',
        departDate: tripDetail?.departDateDamascus ?? '',
      },
    } as Href);
  };

  const unitPrice = seatMap?.price ?? tripDetail?.price ?? 0;
  const totalPrice = unitPrice * selectedSeats.length;

  return (
    <ScreenContainer
      header={
        <AppHeader
          title={ArStrings.seats.screenTitle}
          stepBadge={ArStrings.seats.stepLabel}
          subtitle={
            tripDetail
              ? `${tripDetail.origin.nameAr} ← ${tripDetail.destination.nameAr} · ${
                  tripDetail.departTimeDamascus || formatTime24h(tripDetail.departAt)
                }`
              : undefined
          }
          rightSlot={
            <TouchableOpacity
              onPress={() => void refreshNow(false)}
              style={styles.refreshBtn}
              accessibilityRole="button"
              accessibilityLabel="تحديث المقاعد"
            >
              <Ionicons name="refresh" size={20} color={Colors.primary} />
            </TouchableOpacity>
          }
        />
      }
      refreshing={isRefreshing}
      onRefresh={() => void refreshNow(false)}
      footer={
        <View style={styles.footerWrap}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryPriceBlock}>
              <Text style={styles.summaryLabel}>{ArStrings.seats.totalLabel}</Text>
              <Text style={styles.summaryPrice}>{formatPrice(totalPrice)}</Text>
            </View>
            <View style={styles.summarySeatsBlock}>
              <Text style={styles.summaryLabel}>
                {ArStrings.seats.selectedSeatsLabel} ({selectedSeats.length})
              </Text>
              <Text style={styles.summarySeats}>
                {selectedSeats.length > 0 ? selectedSeats.join('، ') : 'لم يتم الاختيار'}
              </Text>
            </View>
          </View>
          <AppButton
            title={ArStrings.seats.continueCta}
            onPress={handleContinue}
            disabled={selectedSeats.length === 0 || mutatingSeat}
            loading={mutatingSeat}
          />
        </View>
      }
    >
      {/* Active 5-Minute Redis Hold Countdown Banner */}
      {holdExpiresAt && selectedSeats.length > 0 ? (
        <View style={styles.holdTimerBanner}>
          <Ionicons name="timer-outline" size={18} color="#92400E" />
          <Text style={styles.holdTimerText}>
            {ArStrings.seats.holdTimerPrefix} {formattedTime}
          </Text>
        </View>
      ) : (
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            المطلوب: {requestedPassengers} مقعد · {ArStrings.seats.maxSeatsNotice}
          </Text>
          {tripDetail ? (
            <Text style={styles.infoBannerDate}>
              {formatDateSyrian(tripDetail.departDateDamascus)}
            </Text>
          ) : null}
        </View>
      )}

      {error ? <ErrorBanner message={error} onRetry={() => void refreshNow(false)} /> : null}

      {isLoading || !seatMap ? (
        <SeatMapSkeleton />
      ) : (
        <SeatMapGrid
          seats={seatMap.seats}
          selectedSeatNumbers={selectedSeats}
          busTypeName={seatMap.busType.nameAr}
          layout={seatMap.busType.layout}
          disabled={mutatingSeat}
          onToggleSeat={(seat) => void handleToggleSeat(seat)}
        />
      )}

      <ConfirmModal
        visible={expiredModalVisible}
        title={ArStrings.seats.holdExpiredTitle}
        message={ArStrings.seats.holdExpiredMessage}
        confirmTitle="حسناً"
        cancelTitle={ArStrings.app.close}
        onConfirm={() => {
          setExpiredModalVisible(false);
          void refreshNow(true);
        }}
        onCancel={() => {
          setExpiredModalVisible(false);
          void refreshNow(true);
        }}
      />

      <Toast message={toast} visible={Boolean(toast)} onDismiss={() => setToast('')} type="error" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  refreshBtn: {
    minWidth: TouchTargets.minSize,
    minHeight: TouchTargets.minSize,
    borderRadius: Radii.md,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdTimerBanner: {
    backgroundColor: Colors.warningLight,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  holdTimerText: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.sm,
    color: '#92400E',
    fontVariant: ['tabular-nums'],
  },
  infoBanner: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  infoBannerText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  infoBannerDate: {
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.xs,
    color: Colors.primary,
  },
  footerWrap: {
    gap: Spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryPriceBlock: {
    alignItems: 'flex-start',
  },
  summarySeatsBlock: {
    flex: 1,
    alignItems: 'flex-end',
  },
  summaryLabel: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  summaryPrice: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.lg,
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  summarySeats: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.md,
    color: Colors.textMain,
  },
});
