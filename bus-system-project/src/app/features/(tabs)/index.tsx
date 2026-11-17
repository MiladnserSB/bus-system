import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, bookingsApi, catalogApi, SecureStorage } from '@/shared/api';
import {
  AppButton,
  CardListSkeleton,
  ErrorBanner,
  ScreenContainer,
  Toast,
} from '@/shared/components';
import {
  formatDateSyrian,
  formatPrice,
  formatShortDateChip,
  formatTime24h,
  getDamascusDateYmd,
  getUpcomingDamascusDates,
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
import { BookingDto, CityDto } from '@/shared/types/api.types';

export default function SearchHomeScreen() {
  const router = useRouter();
  const [cities, setCities] = useState<CityDto[]>([]);
  const [loadingCities, setLoadingCities] = useState(true);
  const [citiesError, setCitiesError] = useState<string | null>(null);

  const [originId, setOriginId] = useState<number | null>(null);
  const [destinationId, setDestinationId] = useState<number | null>(null);
  const [pickerTarget, setPickerTarget] = useState<'origin' | 'destination' | null>(null);

  const dates = useMemo(() => getUpcomingDamascusDates(14), []);
  const [selectedDate, setSelectedDate] = useState<string>(() => getDamascusDateYmd());
  const [passengers, setPassengers] = useState(1);

  const [nextBooking, setNextBooking] = useState<BookingDto | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState('');

  const loadCities = useCallback(async () => {
    setCitiesError(null);
    try {
      const list = await catalogApi.getCities();
      const active = list.filter((c) => c.isActive);
      setCities(active);
      setOriginId((prev) => {
        if (prev && active.some((c) => c.id === prev)) return prev;
        return active[0]?.id ?? null;
      });
      setDestinationId((prev) => {
        if (prev && active.some((c) => c.id === prev)) return prev;
        return active[1]?.id ?? active[0]?.id ?? null;
      });
    } catch (err) {
      setCitiesError(err instanceof ApiError ? err.message : ArStrings.search.citiesLoadError);
    } finally {
      setLoadingCities(false);
    }
  }, []);

  const loadSessionAndNextBooking = useCallback(async () => {
    try {
      const [token, user] = await Promise.all([
        SecureStorage.getAccessToken(),
        SecureStorage.getUser(),
      ]);
      setUserName(token && user?.name ? user.name : null);

      if (token) {
        const upcoming = await bookingsApi.getMyBookings('upcoming').catch(() => []);
        setNextBooking(upcoming[0] ?? null);
        return;
      }

      const guestRefs = await SecureStorage.getGuestBookingRefs();
      if (guestRefs.length > 0) {
        const latest = await bookingsApi
          .getBookingByCode(guestRefs[0].bookingCode, guestRefs[0].guestAccessToken)
          .catch(() => null);
        if (
          latest &&
          latest.status === 'CONFIRMED' &&
          new Date(latest.trip.departAt).getTime() >= Date.now()
        ) {
          setNextBooking(latest);
          return;
        }
      }
      setNextBooking(null);
    } catch {
      setNextBooking(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void catalogApi
      .getCities()
      .then((list) => {
        if (!active) return;
        const citiesOnly = list.filter((c) => c.isActive);
        setCities(citiesOnly);
        setCitiesError(null);
        setOriginId((prev) => {
          if (prev && citiesOnly.some((c) => c.id === prev)) return prev;
          return citiesOnly[0]?.id ?? null;
        });
        setDestinationId((prev) => {
          if (prev && citiesOnly.some((c) => c.id === prev)) return prev;
          return citiesOnly[1]?.id ?? citiesOnly[0]?.id ?? null;
        });
      })
      .catch((err) => {
        if (!active) return;
        setCitiesError(err instanceof ApiError ? err.message : ArStrings.search.citiesLoadError);
      })
      .finally(() => {
        if (active) setLoadingCities(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSessionAndNextBooking();
    }, [loadSessionAndNextBooking]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadCities(), loadSessionAndNextBooking()]);
    setRefreshing(false);
  };

  const originCity = useMemo(() => cities.find((c) => c.id === originId) ?? null, [cities, originId]);
  const destinationCity = useMemo(
    () => cities.find((c) => c.id === destinationId) ?? null,
    [cities, destinationId],
  );

  const handleSwapCities = () => {
    if (!originId && !destinationId) return;
    setOriginId(destinationId);
    setDestinationId(originId);
  };

  const handleSearch = () => {
    if (!originId || !destinationId) {
      setToast(ArStrings.search.missingCitiesError);
      return;
    }
    if (originId === destinationId) {
      setToast(ArStrings.search.sameCityError);
      return;
    }

    router.push({
      pathname: '/features/trips',
      params: {
        originId: String(originId),
        destinationId: String(destinationId),
        originName: originCity?.nameAr ?? '',
        destinationName: destinationCity?.nameAr ?? '',
        date: selectedDate,
        passengers: String(passengers),
      },
    } as Href);
  };

  const popularRoutes = useMemo(() => {
    if (cities.length < 2) return [];
    const routes: { from: CityDto; to: CityDto }[] = [];
    const primary = cities[0];
    for (let i = 1; i < Math.min(cities.length, 5); i += 1) {
      routes.push({ from: primary, to: cities[i] });
    }
    return routes;
  }, [cities]);

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh} contentStyle={styles.pagePad}>
      {/* Hero Banner */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.heroGreeting}>
              {userName ? `أهلاً ${userName}` : ArStrings.search.heroGreeting}
            </Text>
            <Text style={styles.heroBrand}>{ArStrings.app.brandName}</Text>
          </View>
          <View style={styles.timezonePill}>
            <Ionicons name="time-outline" size={14} color={Colors.accentLight} />
            <Text style={styles.timezoneText}>{ArStrings.app.timezoneHint}</Text>
          </View>
        </View>
      </View>

      {/* Next Upcoming Booking Shortcut */}
      {nextBooking ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push(`/features/tickets/${nextBooking.code}` as Href)}
          style={styles.nextBookingCard}
          accessibilityRole="button"
        >
          <View style={styles.nextBookingHeader}>
            <View style={styles.nextBadge}>
              <Text style={styles.nextBadgeText}>{ArStrings.search.nextBookingHeading}</Text>
            </View>
            <Text style={styles.nextCode}>{nextBooking.code}</Text>
          </View>
          <Text style={styles.nextRoute}>
            {nextBooking.trip.origin.nameAr} ← {nextBooking.trip.destination.nameAr}
          </Text>
          <View style={styles.nextFooter}>
            <Text style={styles.nextMeta}>
              {formatDateSyrian(nextBooking.trip.departDateDamascus)} ·{' '}
              {nextBooking.trip.departTimeDamascus || formatTime24h(nextBooking.trip.departAt)}
            </Text>
            <Text style={styles.nextCta}>{ArStrings.search.viewTicketCta} ‹</Text>
          </View>
        </TouchableOpacity>
      ) : null}

      {/* Main Search Card */}
      {citiesError ? <ErrorBanner message={citiesError} onRetry={loadCities} /> : null}

      {loadingCities ? (
        <CardListSkeleton count={2} />
      ) : (
        <View style={styles.searchCard}>
          <View style={styles.routeSelectorsWrap}>
            <TouchableOpacity
              onPress={() => setPickerTarget('origin')}
              style={styles.cityField}
              accessibilityRole="button"
              accessibilityLabel={ArStrings.search.fromLabel}
            >
              <Text style={styles.fieldLabel}>{ArStrings.search.fromLabel}</Text>
              <View style={styles.fieldValueRow}>
                <Ionicons name="location-outline" size={18} color={Colors.primary} />
                <Text style={styles.fieldValue}>
                  {originCity?.nameAr ?? ArStrings.search.selectOriginPlaceholder}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSwapCities}
              style={styles.swapButton}
              accessibilityRole="button"
              accessibilityLabel={ArStrings.search.swapLabel}
            >
              <Ionicons name="swap-vertical" size={20} color={Colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setPickerTarget('destination')}
              style={styles.cityField}
              accessibilityRole="button"
              accessibilityLabel={ArStrings.search.toLabel}
            >
              <Text style={styles.fieldLabel}>{ArStrings.search.toLabel}</Text>
              <View style={styles.fieldValueRow}>
                <Ionicons name="navigate-outline" size={18} color={Colors.accent} />
                <Text style={styles.fieldValue}>
                  {destinationCity?.nameAr ?? ArStrings.search.selectDestinationPlaceholder}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Date Chips */}
          <Text style={styles.sectionLabel}>{ArStrings.search.dateLabel}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateList}
          >
            {dates.map((ymd) => {
              const active = ymd === selectedDate;
              const chip = formatShortDateChip(ymd);
              return (
                <TouchableOpacity
                  key={ymd}
                  onPress={() => setSelectedDate(ymd)}
                  style={[styles.dateChip, active ? styles.dateChipActive : null]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.dateChipPrimary, active ? styles.dateChipTextActive : null]}>
                    {chip.primary}
                  </Text>
                  <Text
                    style={[styles.dateChipSecondary, active ? styles.dateChipTextActive : null]}
                  >
                    {chip.secondary}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Passenger Stepper */}
          <View style={styles.stepperRow}>
            <Text style={styles.stepperLabel}>{ArStrings.search.passengersLabel}</Text>
            <View style={styles.stepperControls}>
              <TouchableOpacity
                onPress={() => setPassengers((p) => Math.max(1, p - 1))}
                disabled={passengers <= 1}
                style={[styles.stepperBtn, passengers <= 1 ? styles.stepperBtnDisabled : null]}
                accessibilityLabel="إنقاص عدد المسافرين"
                accessibilityRole="button"
              >
                <Ionicons
                  name="remove"
                  size={20}
                  color={passengers <= 1 ? Colors.textMuted : Colors.primary}
                />
              </TouchableOpacity>
              <Text style={styles.stepperCount}>{passengers}</Text>
              <TouchableOpacity
                onPress={() => setPassengers((p) => Math.min(6, p + 1))}
                disabled={passengers >= 6}
                style={[styles.stepperBtn, passengers >= 6 ? styles.stepperBtnDisabled : null]}
                accessibilityLabel="زيادة عدد المسافرين"
                accessibilityRole="button"
              >
                <Ionicons
                  name="add"
                  size={20}
                  color={passengers >= 6 ? Colors.textMuted : Colors.primary}
                />
              </TouchableOpacity>
            </View>
          </View>

          <AppButton title={ArStrings.search.searchCta} onPress={handleSearch} variant="primary" />
        </View>
      )}

      {/* Popular Routes */}
      {popularRoutes.length > 0 ? (
        <View style={styles.popularSection}>
          <Text style={styles.popularHeading}>{ArStrings.search.popularRoutesHeading}</Text>
          <View style={styles.popularGrid}>
            {popularRoutes.map((route) => (
              <TouchableOpacity
                key={`${route.from.id}-${route.to.id}`}
                style={styles.popularChip}
                onPress={() => {
                  setOriginId(route.from.id);
                  setDestinationId(route.to.id);
                  router.push({
                    pathname: '/features/trips',
                    params: {
                      originId: String(route.from.id),
                      destinationId: String(route.to.id),
                      originName: route.from.nameAr,
                      destinationName: route.to.nameAr,
                      date: selectedDate,
                      passengers: String(passengers),
                    },
                  } as Href);
                }}
                accessibilityRole="button"
              >
                <Ionicons name="bus-outline" size={16} color={Colors.primary} />
                <Text style={styles.popularText}>
                  {route.from.nameAr} ← {route.to.nameAr}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {/* City Picker Modal */}
      <Modal
        visible={pickerTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => setPickerTarget(null)}
                style={styles.modalCloseBtn}
                accessibilityRole="button"
                accessibilityLabel={ArStrings.app.close}
              >
                <Ionicons name="close" size={22} color={Colors.textMain} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{ArStrings.search.selectCityTitle}</Text>
              <View style={styles.modalSpacer} />
            </View>
            <FlatList
              data={cities}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => {
                const isSelected =
                  (pickerTarget === 'origin' && item.id === originId) ||
                  (pickerTarget === 'destination' && item.id === destinationId);
                return (
                  <TouchableOpacity
                    style={[styles.cityOption, isSelected ? styles.cityOptionSelected : null]}
                    onPress={() => {
                      if (pickerTarget === 'origin') {
                        setOriginId(item.id);
                      } else if (pickerTarget === 'destination') {
                        setDestinationId(item.id);
                      }
                      setPickerTarget(null);
                    }}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name={isSelected ? 'checkmark-circle' : 'location-outline'}
                      size={20}
                      color={isSelected ? Colors.primary : Colors.textMuted}
                    />
                    <Text
                      style={[styles.cityOptionText, isSelected ? styles.cityOptionTextActive : null]}
                    >
                      {item.nameAr}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      <Toast message={toast} visible={Boolean(toast)} onDismiss={() => setToast('')} type="error" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  pagePad: {
    paddingBottom: Spacing.xxl,
  },
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroGreeting: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.sm,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'right',
  },
  heroBrand: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.xxl,
    color: Colors.textLight,
    textAlign: 'right',
  },
  timezonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radii.full,
  },
  timezoneText: {
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.xs,
    color: Colors.accentLight,
  },
  nextBookingCard: {
    backgroundColor: Colors.accentLight,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  nextBookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nextBadge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.full,
  },
  nextBadgeText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
    color: Colors.textMain,
  },
  nextCode: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.xs,
    color: Colors.primaryDark,
    fontVariant: ['tabular-nums'],
  },
  nextRoute: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.base,
    color: Colors.textMain,
    textAlign: 'right',
    marginBottom: 4,
  },
  nextFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nextMeta: {
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  nextCta: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
    color: Colors.primary,
  },
  searchCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows.card,
  },
  routeSelectorsWrap: {
    position: 'relative',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  cityField: {
    minHeight: 62,
    backgroundColor: Colors.bgPage,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    justifyContent: 'center',
  },
  fieldLabel: {
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    marginBottom: 2,
  },
  fieldValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  fieldValue: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.base,
    color: Colors.textMain,
  },
  swapButton: {
    position: 'absolute',
    left: Spacing.md,
    top: 42,
    zIndex: 10,
    minWidth: TouchTargets.minSize,
    minHeight: TouchTargets.minSize,
    borderRadius: Radii.full,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
  sectionLabel: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    marginBottom: Spacing.xs,
  },
  dateList: {
    gap: Spacing.xs,
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.md,
  },
  dateChip: {
    minWidth: 88,
    minHeight: 54,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgPage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dateChipPrimary: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.sm,
    color: Colors.textMain,
  },
  dateChipSecondary: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  dateChipTextActive: {
    color: Colors.textLight,
  },
  stepperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.bgPage,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  stepperLabel: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.md,
    color: Colors.textMain,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stepperBtn: {
    minWidth: TouchTargets.minSize,
    minHeight: TouchTargets.minSize,
    borderRadius: Radii.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: {
    backgroundColor: Colors.bgPage,
    borderColor: Colors.border,
  },
  stepperCount: {
    minWidth: 28,
    textAlign: 'center',
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.lg,
    color: Colors.textMain,
    fontVariant: ['tabular-nums'],
  },
  popularSection: {
    gap: Spacing.sm,
  },
  popularHeading: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.md,
    color: Colors.textMain,
    textAlign: 'right',
  },
  popularGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  popularChip: {
    minHeight: TouchTargets.minSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  popularText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
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
    maxHeight: '75%',
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  modalCloseBtn: {
    minWidth: TouchTargets.minSize,
    minHeight: TouchTargets.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.lg,
    color: Colors.textMain,
  },
  modalSpacer: {
    width: TouchTargets.minSize,
  },
  cityOption: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.md,
    marginBottom: Spacing.xs,
  },
  cityOptionSelected: {
    backgroundColor: Colors.primaryLight,
  },
  cityOptionText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.base,
    color: Colors.textMain,
  },
  cityOptionTextActive: {
    color: Colors.primary,
  },
});

export { formatPrice };
