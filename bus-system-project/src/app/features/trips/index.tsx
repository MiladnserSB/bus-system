import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, catalogApi, tripsApi } from '@/shared/api';
import {
  AppButton,
  AppHeader,
  EmptyState,
  ErrorBanner,
  ScreenContainer,
  TripListSkeleton,
} from '@/shared/components';
import {
  formatBusCategoryAr,
  formatDateSyrian,
  formatPrice,
  formatTime24h,
} from '@/shared/constants/helpers';
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
import { BusTypeDto, TripSummaryDto } from '@/shared/types/api.types';

export default function TripResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    originId?: string;
    destinationId?: string;
    originName?: string;
    destinationName?: string;
    date?: string;
    passengers?: string;
  }>();

  const originId = params.originId ? Number(params.originId) : undefined;
  const destinationId = params.destinationId ? Number(params.destinationId) : undefined;
  const passengersCount = Math.max(1, Number(params.passengers ?? '1') || 1);

  const [selectedDate, setSelectedDate] = useState<string | undefined>(params.date);
  const [sortBy, setSortBy] = useState<'departAt' | 'price'>('departAt');
  const [selectedBusTypeId, setSelectedBusTypeId] = useState<number | undefined>(undefined);
  const [busTypes, setBusTypes] = useState<BusTypeDto[]>([]);

  const [trips, setTrips] = useState<TripSummaryDto[]>([]);
  const [suggestedDates, setSuggestedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    void catalogApi
      .getBusTypes()
      .then((list) => setBusTypes(list.filter((b) => b.isActive !== false)))
      .catch(() => {});
  }, []);

  const fetchTrips = useCallback(async () => {
    setError(null);
    try {
      const res = await tripsApi.searchTrips({
        originId,
        destinationId,
        date: selectedDate,
        busTypeId: selectedBusTypeId,
        sortBy,
        sortOrder: 'asc',
        limit: 50,
      });
      setTrips(res.items);
      setSuggestedDates(res.suggestedDates ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر جلب قائمة الرحلات حالياً.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [originId, destinationId, selectedDate, selectedBusTypeId, sortBy]);

  useEffect(() => {
    let active = true;
    void tripsApi
      .searchTrips({
        originId,
        destinationId,
        date: selectedDate,
        busTypeId: selectedBusTypeId,
        sortBy,
        sortOrder: 'asc',
        limit: 50,
      })
      .then((res) => {
        if (!active) return;
        setTrips(res.items);
        setSuggestedDates(res.suggestedDates ?? []);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : 'تعذر جلب قائمة الرحلات حالياً.');
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      active = false;
    };
  }, [originId, destinationId, selectedDate, selectedBusTypeId, sortBy]);

  const routeTitle =
    params.originName && params.destinationName
      ? `${params.originName} ← ${params.destinationName}`
      : ArStrings.trips.resultsTitle;

  const routeSubtitle = selectedDate
    ? `${formatDateSyrian(selectedDate)} · ${passengersCount} مسافر`
    : undefined;

  return (
    <ScreenContainer
      header={
        <AppHeader
          title={routeTitle}
          subtitle={routeSubtitle}
          rightSlot={
            <TouchableOpacity
              onPress={() => setFilterOpen(true)}
              style={styles.filterHeaderBtn}
              accessibilityRole="button"
              accessibilityLabel={ArStrings.trips.filterBtn}
            >
              <Ionicons name="options-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
          }
        />
      }
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void fetchTrips();
      }}
    >
      {/* Quick Sort & Filter Strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterBar}
      >
        <TouchableOpacity
          onPress={() => setSortBy('departAt')}
          style={[styles.chip, sortBy === 'departAt' ? styles.chipActive : null]}
          accessibilityRole="button"
        >
          <Text style={[styles.chipText, sortBy === 'departAt' ? styles.chipTextActive : null]}>
            {ArStrings.trips.sortByTime}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setSortBy('price')}
          style={[styles.chip, sortBy === 'price' ? styles.chipActive : null]}
          accessibilityRole="button"
        >
          <Text style={[styles.chipText, sortBy === 'price' ? styles.chipTextActive : null]}>
            {ArStrings.trips.sortByPrice}
          </Text>
        </TouchableOpacity>
        {selectedBusTypeId ? (
          <TouchableOpacity
            onPress={() => setSelectedBusTypeId(undefined)}
            style={[styles.chip, styles.chipActive]}
            accessibilityRole="button"
          >
            <Text style={styles.chipTextActive}>
              {busTypes.find((b) => b.id === selectedBusTypeId)?.nameAr ?? 'فئة محددة'} ×
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {error ? <ErrorBanner message={error} onRetry={fetchTrips} /> : null}

      {loading ? (
        <TripListSkeleton count={4} />
      ) : trips.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            iconName="bus-outline"
            title={ArStrings.trips.noTripsTitle}
            subtitle={ArStrings.trips.noTripsSubtitle}
            actionTitle={selectedBusTypeId ? ArStrings.trips.resetFilter : 'تعديل البحث'}
            onAction={() => {
              if (selectedBusTypeId) {
                setSelectedBusTypeId(undefined);
              } else {
                router.back();
              }
            }}
          />

          {suggestedDates.length > 0 ? (
            <View style={styles.suggestedBox}>
              <Text style={styles.suggestedTitle}>{ArStrings.trips.suggestedDatesTitle}</Text>
              <View style={styles.suggestedRow}>
                {suggestedDates.map((d) => (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setSelectedDate(d)}
                    style={styles.suggestedChip}
                    accessibilityRole="button"
                  >
                    <Text style={styles.suggestedChipText}>{formatDateSyrian(d)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.listGap}>
          {trips.map((trip) => {
            const isFull = trip.status === 'FULL' || trip.availableSeatsCount <= 0;
            const notEnoughSeats = !isFull && trip.availableSeatsCount < passengersCount;

            return (
              <TouchableOpacity
                key={trip.id}
                disabled={isFull}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({
                    pathname: `/features/trips/${trip.id}`,
                    params: { passengers: String(passengersCount) },
                  } as Href)
                }
                style={[styles.tripCard, isFull ? styles.tripCardDisabled : null]}
                accessibilityRole="button"
                accessibilityState={{ disabled: isFull }}
              >
                <View style={styles.cardTopRow}>
                  <View
                    style={[
                      styles.classBadge,
                      trip.busType.category === 'BUSINESS' ? styles.vipBadge : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.classBadgeText,
                        trip.busType.category === 'BUSINESS' ? styles.vipBadgeText : null,
                      ]}
                    >
                      {trip.busType.nameAr}
                    </Text>
                  </View>
                  <Text style={styles.timeText}>
                    {trip.departTimeDamascus || formatTime24h(trip.departAt)}
                  </Text>
                </View>

                <Text style={styles.routeLine}>
                  {trip.origin.nameAr} ← {trip.destination.nameAr}
                </Text>

                <View style={styles.metaLine}>
                  <Text style={styles.metaItem}>{formatBusCategoryAr(trip.busType.category)}</Text>
                  <Text style={styles.metaDot}>•</Text>
                  <Text style={styles.metaItem}>{trip.busType.layout}</Text>
                  {trip.bus?.plateNumber ? (
                    <>
                      <Text style={styles.metaDot}>•</Text>
                      <Text style={styles.metaItem}>حافلة {trip.bus.plateNumber}</Text>
                    </>
                  ) : null}
                </View>

                <View style={styles.cardBottomRow}>
                  <View>
                    <Text style={styles.priceText}>{formatPrice(trip.price)}</Text>
                    <Text
                      style={[
                        styles.seatsCountText,
                        isFull || notEnoughSeats ? styles.seatsWarningText : null,
                      ]}
                    >
                      {isFull
                        ? ArStrings.trips.fullBadge
                        : `${trip.availableSeatsCount} ${ArStrings.trips.seatsRemainingSuffix}`}
                    </Text>
                  </View>

                  <View style={[styles.selectPill, isFull ? styles.fullPill : null]}>
                    <Text style={[styles.selectPillText, isFull ? styles.fullPillText : null]}>
                      {isFull ? ArStrings.trips.fullBadge : ArStrings.trips.selectSeatsCta}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Filter Modal */}
      <Modal
        visible={filterOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{ArStrings.trips.filterModalTitle}</Text>

            <Text style={styles.modalSectionLabel}>{ArStrings.trips.sortTitle}</Text>
            <View style={styles.modalChipsRow}>
              <TouchableOpacity
                onPress={() => setSortBy('departAt')}
                style={[styles.chip, sortBy === 'departAt' ? styles.chipActive : null]}
              >
                <Text
                  style={[styles.chipText, sortBy === 'departAt' ? styles.chipTextActive : null]}
                >
                  {ArStrings.trips.sortByTime}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSortBy('price')}
                style={[styles.chip, sortBy === 'price' ? styles.chipActive : null]}
              >
                <Text style={[styles.chipText, sortBy === 'price' ? styles.chipTextActive : null]}>
                  {ArStrings.trips.sortByPrice}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSectionLabel}>{ArStrings.trips.busClassTitle}</Text>
            <View style={styles.modalChipsRow}>
              <TouchableOpacity
                onPress={() => setSelectedBusTypeId(undefined)}
                style={[styles.chip, selectedBusTypeId === undefined ? styles.chipActive : null]}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedBusTypeId === undefined ? styles.chipTextActive : null,
                  ]}
                >
                  {ArStrings.trips.allBusTypes}
                </Text>
              </TouchableOpacity>
              {busTypes.map((bt) => {
                const active = selectedBusTypeId === bt.id;
                return (
                  <TouchableOpacity
                    key={bt.id}
                    onPress={() => setSelectedBusTypeId(bt.id)}
                    style={[styles.chip, active ? styles.chipActive : null]}
                  >
                    <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                      {bt.nameAr}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalFooter}>
              <AppButton
                title={ArStrings.trips.resetFilter}
                onPress={() => {
                  setSortBy('departAt');
                  setSelectedBusTypeId(undefined);
                  setFilterOpen(false);
                }}
                variant="outline"
                style={styles.flexBtn}
              />
              <AppButton
                title={ArStrings.trips.applyFilter}
                onPress={() => setFilterOpen(false)}
                variant="primary"
                style={styles.flexBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  filterHeaderBtn: {
    minWidth: TouchTargets.minSize,
    minHeight: TouchTargets.minSize,
    borderRadius: Radii.md,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBar: {
    gap: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  chip: {
    minHeight: TouchTargets.minSize,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  chipTextActive: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
    color: Colors.textLight,
  },
  listGap: {
    gap: Spacing.md,
  },
  tripCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    ...Shadows.card,
  },
  tripCardDisabled: {
    opacity: 0.65,
    backgroundColor: Colors.surfaceAlt,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  classBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radii.full,
  },
  vipBadge: {
    backgroundColor: Colors.accentLight,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  classBadgeText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
    color: Colors.primary,
  },
  vipBadgeText: {
    color: '#92400E',
  },
  timeText: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.xl,
    color: Colors.textMain,
    fontVariant: ['tabular-nums'],
  },
  routeLine: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.base,
    color: Colors.textMain,
    textAlign: 'right',
    marginBottom: 4,
  },
  metaLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.md,
  },
  metaItem: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  metaDot: {
    color: Colors.borderStrong,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  priceText: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.lg,
    color: Colors.primary,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  seatsCountText: {
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.xs,
    color: Colors.success,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  seatsWarningText: {
    color: Colors.danger,
  },
  selectPill: {
    minHeight: TouchTargets.minSize,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullPill: {
    backgroundColor: Colors.border,
  },
  selectPillText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.sm,
    color: Colors.textLight,
  },
  fullPillText: {
    color: Colors.textMuted,
  },
  emptyWrap: {
    gap: Spacing.md,
  },
  suggestedBox: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  suggestedTitle: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.md,
    color: Colors.textMain,
    textAlign: 'right',
    marginBottom: Spacing.sm,
  },
  suggestedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  suggestedChip: {
    minHeight: TouchTargets.minSize,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.md,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
    justifyContent: 'center',
  },
  suggestedChipText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
    color: Colors.primary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    padding: Spacing.lg,
  },
  modalTitle: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.lg,
    color: Colors.textMain,
    textAlign: 'right',
    marginBottom: Spacing.md,
  },
  modalSectionLabel: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    marginBottom: Spacing.xs,
  },
  modalChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  flexBtn: {
    flex: 1,
  },
});
