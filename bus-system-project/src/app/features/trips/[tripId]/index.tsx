import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { tripsApi } from '@/shared/api';
import {
  AppButton,
  AppHeader,
  ErrorBanner,
  ScreenContainer,
  SeatMapGrid,
  SeatMapSkeleton,
  Toast,
} from '@/shared/components';
import { formatDateSyrian, formatPrice, formatTime24h } from '@/shared/constants/helpers';
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
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!tripId || Number.isNaN(tripId)) return;
    void tripsApi
      .getTrip(tripId)
      .then(setTripDetail)
      .catch(() => {});
  }, [tripId]);

  const fetchSeats = useCallback(() => tripsApi.getSeatMap(tripId), [tripId]);
  const handleSeatMapData = useCallback((map: { seats: SeatDto[] }) => {
    // Drop any locally selected seats if they were booked concurrently during polling
    setSelectedSeats((prev) =>
      prev.filter((sn) => {
        const match = map.seats.find((s) => s.seatNumber === sn);
        return !match || match.status === 'AVAILABLE' || match.status === 'HELD_BY_ME';
      }),
    );
  }, []);

  const {
    seatMap,
    isLoading,
    isRefreshing,
    error,
    refreshNow,
  } = useSeatPolling(fetchSeats, Boolean(tripId && !Number.isNaN(tripId)), handleSeatMapData);

  const handleToggleSeat = (seat: SeatDto) => {
    if (selectedSeats.includes(seat.seatNumber)) {
      setSelectedSeats((prev) => prev.filter((s) => s !== seat.seatNumber));
      return;
    }

    if (seat.status !== 'AVAILABLE' && seat.status !== 'HELD_BY_ME') {
      return;
    }

    if (selectedSeats.length >= MAX_SEATS) {
      setToast(ArStrings.seats.maxSeatsNotice);
      return;
    }

    setSelectedSeats((prev) => [...prev, seat.seatNumber]);
  };

  const handleContinue = () => {
    if (selectedSeats.length === 0) {
      setToast(ArStrings.seats.selectAtLeastOne);
      return;
    }
    router.push({
      pathname: `/features/trips/${tripId}/booking`,
      params: {
        seats: selectedSeats.join(','),
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
            disabled={selectedSeats.length === 0}
          />
        </View>
      }
    >
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

      {error ? <ErrorBanner message={error} onRetry={() => void refreshNow(false)} /> : null}

      {isLoading || !seatMap ? (
        <SeatMapSkeleton />
      ) : (
        <SeatMapGrid
          seats={seatMap.seats}
          selectedSeatNumbers={selectedSeats}
          busTypeName={seatMap.busType.nameAr}
          layout={seatMap.busType.layout}
          onToggleSeat={(seat) => handleToggleSeat(seat)}
        />
      )}

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
