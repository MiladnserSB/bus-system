import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, bookingsApi, SecureStorage } from '@/shared/api';
import {
  AppButton,
  AppHeader,
  AppInput,
  ConfirmModal,
  ErrorBanner,
  ScreenContainer,
  Toast,
} from '@/shared/components';
import {
  extractLocalSyrianDigits,
  formatDateSyrian,
  formatPrice,
  generateClientId,
  normalizeSyrianPhone,
  toWesternDigits,
} from '@/shared/constants/helpers';
import { useExpiresAtCountdown } from '@/shared/hooks/useCountdown';
import { ArStrings } from '@/shared/i18n/ar';
import { Colors, FontFamilies, FontSizes, Radii, Spacing, TouchTargets } from '@/shared/theme';
import { AuthUser, PaymentMethod } from '@/shared/types/api.types';

interface PassengerFormItem {
  seatNumber: string;
  passengerName: string;
  passengerPhone: string;
  nameError?: string;
  phoneError?: string;
}

export default function BookingPassengersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    tripId: string;
    seats: string;
    holdId?: string;
    holdExpiresAt?: string;
    unitPrice?: string;
    routeLabel?: string;
    departTime?: string;
    departDate?: string;
  }>();

  const tripId = Number(params.tripId);
  const seatList = React.useMemo(
    () =>
      (params.seats ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [params.seats],
  );
  const unitPrice = Number(params.unitPrice ?? '0') || 0;
  const totalPrice = unitPrice * seatList.length;

  const [passengers, setPassengers] = useState<PassengerFormItem[]>(() =>
    seatList.map((seat) => ({
      seatNumber: seat,
      passengerName: '',
      passengerPhone: '',
    })),
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH_ON_BOARDING');
  const [cachedUser, setCachedUser] = useState<AuthUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  // Stable Idempotency-Key per checkout attempt so retries never double-book
  const idempotencyKeyRef = useRef<string>(generateClientId('book'));

  const { formattedTime, isExpired } = useExpiresAtCountdown(params.holdExpiresAt || null);

  useEffect(() => {
    void SecureStorage.getUser().then((user) => {
      if (user) {
        setCachedUser(user);
        setPassengers((prev) =>
          prev.map((item, idx) =>
            idx === 0 && !item.passengerName && !item.passengerPhone
              ? {
                  ...item,
                  passengerName: user.name ?? '',
                  passengerPhone: extractLocalSyrianDigits(user.phone),
                }
              : item,
          ),
        );
      }
    });
  }, []);

  const updatePassengerField = (
    index: number,
    field: 'passengerName' | 'passengerPhone',
    value: string,
  ) => {
    setPassengers((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const cleanVal =
          field === 'passengerPhone'
            ? toWesternDigits(value).replace(/[^\d+]/g, '')
            : value;
        return {
          ...item,
          [field]: cleanVal,
          ...(field === 'passengerName' ? { nameError: undefined } : { phoneError: undefined }),
        };
      }),
    );
    if (apiError) setApiError(null);
  };

  const handleAutoFillMe = () => {
    if (!cachedUser) return;
    const phoneDigits = extractLocalSyrianDigits(cachedUser.phone);
    setPassengers((prev) =>
      prev.map((item, idx) =>
        idx === 0
          ? {
              ...item,
              passengerName: cachedUser.name || item.passengerName,
              passengerPhone: phoneDigits || item.passengerPhone,
              nameError: undefined,
              phoneError: undefined,
            }
          : {
              ...item,
              passengerPhone: item.passengerPhone || phoneDigits,
              phoneError: undefined,
            },
      ),
    );
    setToast('تمت تعبئة بياناتك تلقائياً');
  };

  const handleCopyFirstPhone = () => {
    const firstPhone = passengers[0]?.passengerPhone?.trim();
    if (!firstPhone) {
      setToast('أدخل رقم هاتف الراكب الأول أولاً.');
      return;
    }
    setPassengers((prev) =>
      prev.map((item) => ({
        ...item,
        passengerPhone: firstPhone,
        phoneError: undefined,
      })),
    );
    setToast('تم تعميم رقم هاتف التواصل على جميع المقاعد');
  };

  const handleSubmitBooking = async () => {
    setApiError(null);

    let hasError = false;
    const validated: PassengerFormItem[] = passengers.map((item) => {
      const nameClean = item.passengerName.trim();
      const normalizedPhone = normalizeSyrianPhone(item.passengerPhone);
      const nameError = nameClean.length < 2 ? ArStrings.passengers.invalidNameError : undefined;
      const phoneError = !normalizedPhone
        ? ArStrings.passengers.invalidPassengerPhoneError
        : undefined;
      if (nameError || phoneError) {
        hasError = true;
      }
      return {
        ...item,
        nameError,
        phoneError,
      };
    });

    setPassengers(validated);
    if (hasError) return;

    const normalizedPassengers = validated.map((item) => ({
      seatNumber: item.seatNumber,
      passengerName: item.passengerName.trim(),
      passengerPhone: normalizeSyrianPhone(item.passengerPhone) ?? item.passengerPhone,
    }));

    setSubmitting(true);
    try {
      const res = await bookingsApi.createBooking(
        {
          tripId,
          passengers: normalizedPassengers,
          holdId: params.holdId,
          contactName: normalizedPassengers[0]?.passengerName,
          contactPhone: normalizedPassengers[0]?.passengerPhone,
          paymentMethod,
        },
        idempotencyKeyRef.current,
      );

      router.replace(`/features/tickets/${encodeURIComponent(res.booking.code)}` as Href);
    } catch (err) {
      setApiError(
        err instanceof ApiError ? err.message : 'تعذر إتمام الحجز حالياً. أعد المحاولة.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer
      header={
        <AppHeader
          title={ArStrings.passengers.screenTitle}
          stepBadge={ArStrings.passengers.stepLabel}
          subtitle={
            params.routeLabel
              ? `${params.routeLabel} · ${params.departTime ?? ''}`
              : undefined
          }
        />
      }
      footer={
        <View style={styles.footerStack}>
          <View style={styles.footerSummary}>
            <Text style={styles.footerTotal}>{formatPrice(totalPrice)}</Text>
            <Text style={styles.footerSeats}>
              {seatList.length} مقعد ({seatList.join('، ')})
            </Text>
          </View>
          <AppButton
            title={ArStrings.passengers.confirmBookingCta}
            onPress={handleSubmitBooking}
            loading={submitting}
            disabled={seatList.length === 0 || isExpired}
          />
        </View>
      }
    >
      {/* Hold Countdown */}
      {params.holdExpiresAt ? (
        <View style={styles.timerBanner}>
          <Ionicons name="timer-outline" size={18} color="#92400E" />
          <Text style={styles.timerText}>
            {ArStrings.seats.holdTimerPrefix} {formattedTime}
          </Text>
        </View>
      ) : null}

      {/* Quick Actions */}
      <View style={styles.helperActions}>
        {cachedUser ? (
          <TouchableOpacity onPress={handleAutoFillMe} style={styles.helperChip} accessibilityRole="button">
            <Ionicons name="person-add-outline" size={16} color={Colors.primary} />
            <Text style={styles.helperChipText}>{ArStrings.passengers.autoFillMe}</Text>
          </TouchableOpacity>
        ) : null}
        {passengers.length > 1 ? (
          <TouchableOpacity onPress={handleCopyFirstPhone} style={styles.helperChip} accessibilityRole="button">
            <Ionicons name="copy-outline" size={16} color={Colors.primary} />
            <Text style={styles.helperChipText}>{ArStrings.passengers.copyFirstPassenger}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {apiError ? (
        <ErrorBanner
          message={apiError}
          retryText="العودة لاختيار المقاعد"
          onRetry={() => router.back()}
        />
      ) : null}

      {/* Passenger Forms */}
      {passengers.map((passenger, idx) => (
        <View key={passenger.seatNumber} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.seatBadge}>
              <Text style={styles.seatBadgeText}>{passenger.seatNumber}</Text>
            </View>
            <Text style={styles.cardHeading}>
              {ArStrings.passengers.passengerHeading} {passenger.seatNumber}
            </Text>
          </View>

          <AppInput
            label={ArStrings.passengers.fullNameLabel}
            placeholder={ArStrings.passengers.fullNamePlaceholder}
            value={passenger.passengerName}
            onChangeText={(val) => updatePassengerField(idx, 'passengerName', val)}
            error={passenger.nameError}
            maxLength={120}
          />

          <AppInput
            label={ArStrings.passengers.phoneLabel}
            prefixText="+963"
            placeholder={ArStrings.auth.phonePlaceholder}
            keyboardType="phone-pad"
            value={passenger.passengerPhone}
            onChangeText={(val) => updatePassengerField(idx, 'passengerPhone', val)}
            error={passenger.phoneError}
            maxLength={14}
            containerStyle={styles.noMarginBottom}
          />
        </View>
      ))}

      {/* Payment Method Notice (Cash Only per SRS) */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{ArStrings.passengers.paymentSectionTitle}</Text>
        {(
          [
            {
              key: 'CASH_ON_BOARDING' as const,
              title: ArStrings.passengers.paymentCashBoarding,
              desc: ArStrings.passengers.paymentCashBoardingDesc,
            },
            {
              key: 'CASH_OFFICE' as const,
              title: ArStrings.passengers.paymentCashOffice,
              desc: ArStrings.passengers.paymentCashOfficeDesc,
            },
          ] as const
        ).map((opt) => {
          const selected = paymentMethod === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setPaymentMethod(opt.key)}
              style={[styles.paymentOption, selected ? styles.paymentOptionSelected : null]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={selected ? Colors.primary : Colors.textMuted}
              />
              <View style={styles.paymentTextWrap}>
                <Text style={styles.paymentTitle}>{opt.title}</Text>
                <Text style={styles.paymentDesc}>{opt.desc}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Summary Notice */}
      {params.departDate ? (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryMeta}>
            موعد الرحلة: {formatDateSyrian(params.departDate)} · {params.departTime ?? ''}
          </Text>
          <Text style={styles.summaryMeta}>{ArStrings.ticket.cancelPolicyNotice}</Text>
        </View>
      ) : null}

      <ConfirmModal
        visible={isExpired}
        title={ArStrings.seats.holdExpiredTitle}
        message={ArStrings.seats.holdExpiredMessage}
        confirmTitle="العودة لاختيار المقاعد"
        cancelTitle={ArStrings.app.back}
        onConfirm={() => router.back()}
        onCancel={() => router.back()}
      />

      <Toast message={toast} visible={Boolean(toast)} onDismiss={() => setToast('')} type="info" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  timerBanner: {
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
  timerText: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.sm,
    color: '#92400E',
    fontVariant: ['tabular-nums'],
  },
  helperActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  helperChip: {
    minHeight: TouchTargets.minSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.md,
  },
  helperChipText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
    color: Colors.primary,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  seatBadge: {
    backgroundColor: Colors.primary,
    borderRadius: Radii.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  seatBadgeText: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.xs,
    color: Colors.textLight,
    fontVariant: ['tabular-nums'],
  },
  cardHeading: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.base,
    color: Colors.textMain,
  },
  noMarginBottom: {
    marginBottom: 0,
  },
  sectionTitle: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.base,
    color: Colors.textMain,
    textAlign: 'right',
    marginBottom: Spacing.sm,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  paymentOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  paymentTextWrap: {
    flex: 1,
  },
  paymentTitle: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.md,
    color: Colors.textMain,
    textAlign: 'right',
  },
  paymentDesc: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    lineHeight: 18,
    marginTop: 2,
  },
  summaryBox: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: 4,
  },
  summaryMeta: {
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  footerStack: {
    gap: Spacing.sm,
  },
  footerSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerTotal: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.lg,
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  footerSeats: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
});
