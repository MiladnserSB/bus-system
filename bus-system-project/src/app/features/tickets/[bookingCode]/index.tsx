import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, bookingsApi, SecureStorage, ticketsApi } from '@/shared/api';
import {
  AppButton,
  AppHeader,
  AppInput,
  ConfirmModal,
  ErrorBanner,
  ScreenContainer,
  TicketSkeleton,
  Toast,
} from '@/shared/components';
import {
  extractLocalSyrianDigits,
  formatBusCategoryAr,
  formatDateSyrian,
  formatPrice,
  formatTime24h,
  normalizeSyrianPhone,
  toWesternDigits,
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
import { TicketDto, TicketSeatDto } from '@/shared/types/api.types';

export default function DigitalTicketScreen() {
  const router = useRouter();
  const { bookingCode } = useLocalSearchParams<{ bookingCode: string }>();

  const [ticket, setTicket] = useState<TicketDto | null>(null);
  const [departPast, setDepartPast] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [seatToCancel, setSeatToCancel] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [savingFile, setSavingFile] = useState(false);

  const [editingSeat, setEditingSeat] = useState<TicketSeatDto | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhoneDigits, setEditPhoneDigits] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingPassenger, setSavingPassenger] = useState(false);

  const [toast, setToast] = useState('');

  const loadTicket = useCallback(async () => {
    if (!bookingCode) return;
    setError(null);
    try {
      const [data, token] = await Promise.all([
        ticketsApi.getTicket(bookingCode),
        SecureStorage.getAccessToken(),
      ]);
      setTicket(data);
      setIsAuthenticated(Boolean(token));
      setDepartPast(new Date(data.departAt).getTime() <= Date.now());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل التذكرة الرقمية حالياً.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingCode]);

  useEffect(() => {
    if (!bookingCode) return;
    let active = true;
    void Promise.all([
      ticketsApi.getTicket(bookingCode),
      SecureStorage.getAccessToken(),
    ])
      .then(([data, token]) => {
        if (!active) return;
        setTicket(data);
        setIsAuthenticated(Boolean(token));
        setDepartPast(new Date(data.departAt).getTime() <= Date.now());
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : 'تعذر تحميل التذكرة الرقمية حالياً.');
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
  }, [bookingCode]);

  const handleShareTicket = async () => {
    if (!ticket) return;
    const activeSeats = ticket.seats.filter((s) => s.isActive);
    const displaySeats = activeSeats.length > 0 ? activeSeats : ticket.seats;
    const message = [
      `تذكرة ${ArStrings.app.brandName}`,
      `رقم الحجز: ${ticket.bookingCode}`,
      `المسار: ${ticket.route.label}`,
      `التاريخ: ${formatDateSyrian(ticket.departDateDamascus)}`,
      `الساعة: ${ticket.departTimeDamascus || formatTime24h(ticket.departAt)} (توقيت دمشق)`,
      `المقاعد: ${displaySeats.map((s) => s.seatNumber).join('، ')}`,
      `الإجمالي: ${formatPrice(ticket.totalPrice)} (${ticket.paymentMethodLabel})`,
    ].join('\n');

    try {
      await Share.share({ message, title: `تذكرة ${ticket.bookingCode}` });
    } catch {
      setToast('تعذر فتح قائمة المشاركة على هذا الجهاز.');
    }
  };

  const handleSaveTicket = async () => {
    if (!ticket) return;
    setSavingFile(true);
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined' && ticket.qrCodeDataUrl) {
        const link = document.createElement('a');
        link.href = ticket.qrCodeDataUrl;
        link.download = `ticket-${ticket.bookingCode}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setToast(ArStrings.ticket.savedSuccess);
        return;
      }

      if (ticket.qrCodeDataUrl.startsWith('data:image/png;base64,')) {
        const base64Body = ticket.qrCodeDataUrl.replace('data:image/png;base64,', '');
        const file = new File(Paths.cache, `ticket-${ticket.bookingCode}.png`);
        file.create({ overwrite: true });
        await file.write(base64Body, { encoding: 'base64' });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'image/png',
            dialogTitle: `حفظ تذكرة ${ticket.bookingCode}`,
          });
        }
        setToast(ArStrings.ticket.savedSuccess);
        return;
      }

      await handleShareTicket();
    } catch {
      setToast('تعذر حفظ ملف التذكرة حالياً.');
    } finally {
      setSavingFile(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!ticket) return;
    setCancelling(true);
    try {
      if (seatToCancel) {
        await bookingsApi.cancelSeat(ticket.bookingCode, seatToCancel, 'إلغاء مقعد من قبل المسافر');
      } else {
        await bookingsApi.cancelBooking(ticket.bookingCode, 'إلغاء من قبل المسافر');
      }
      const refreshed = await ticketsApi.getTicket(ticket.bookingCode);
      setTicket(refreshed);
      setCancelModalOpen(false);
      setSeatToCancel(null);
      setToast(
        seatToCancel
          ? `تم إلغاء المقعد ${seatToCancel} وتحريره بنجاح`
          : 'تم إلغاء الحجز وتحرير المقاعد بنجاح',
      );
    } catch (err) {
      setCancelModalOpen(false);
      setSeatToCancel(null);
      setError(err instanceof ApiError ? err.message : 'تعذر إلغاء الحجز حالياً.');
    } finally {
      setCancelling(false);
    }
  };

  const openEditPassengerModal = (seat: TicketSeatDto) => {
    setEditingSeat(seat);
    setEditName(seat.passengerName);
    setEditPhoneDigits(extractLocalSyrianDigits(seat.passengerPhone));
    setEditError(null);
  };

  const handleSavePassenger = async () => {
    if (!ticket || !editingSeat) return;
    const cleanName = editName.trim();
    if (cleanName.length < 2) {
      setEditError(ArStrings.passengers.invalidNameError);
      return;
    }
    const normalizedPhone = normalizeSyrianPhone(editPhoneDigits);
    if (!normalizedPhone) {
      setEditError(ArStrings.passengers.invalidPassengerPhoneError);
      return;
    }

    setSavingPassenger(true);
    setEditError(null);
    try {
      await bookingsApi.updatePassengers(ticket.bookingCode, [
        {
          seatNumber: editingSeat.seatNumber,
          passengerName: cleanName,
          passengerPhone: normalizedPhone,
        },
      ]);
      const refreshed = await ticketsApi.getTicket(ticket.bookingCode);
      setTicket(refreshed);
      setEditingSeat(null);
      setToast(`تم تحديث بيانات راكب المقعد ${editingSeat.seatNumber}`);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'تعذر تحديث بيانات الراكب حالياً.');
    } finally {
      setSavingPassenger(false);
    }
  };

  const isCancelled = ticket?.status === 'CANCELLED';
  const activeSeatsCount = ticket?.seats.filter((s) => s.isActive).length ?? 0;
  const canCancel = Boolean(ticket && !isCancelled && !departPast);

  const badgeStyle =
    ticket?.status === 'CANCELLED'
      ? { label: ArStrings.ticket.statusCancelled, bg: Colors.dangerLight, color: Colors.danger }
      : ticket?.status === 'PARTIAL_CANCELLED'
        ? {
            label: ArStrings.ticket.statusPartialCancelled,
            bg: Colors.warningLight,
            color: Colors.warning,
          }
        : { label: ArStrings.ticket.statusConfirmed, bg: Colors.successLight, color: Colors.success };

  return (
    <ScreenContainer
      header={
        <AppHeader
          title={ArStrings.ticket.screenTitle}
          stepBadge={ArStrings.ticket.stepLabel}
          onBackPress={() => router.replace('/features/(tabs)/my-bookings' as Href)}
        />
      }
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void loadTicket();
      }}
      footer={
        <AppButton
          title={ArStrings.ticket.backHomeBtn}
          onPress={() => router.replace('/features/(tabs)' as Href)}
          variant="primary"
        />
      }
    >
      {error ? <ErrorBanner message={error} onRetry={loadTicket} /> : null}

      {loading && !ticket ? (
        <TicketSkeleton />
      ) : ticket ? (
        <View style={styles.stack}>
          {isCancelled ? (
            <View style={styles.cancelledBanner}>
              <Ionicons name="close-circle" size={20} color={Colors.danger} />
              <Text style={styles.cancelledText}>{ArStrings.ticket.cancelledBanner}</Text>
            </View>
          ) : null}

          <View style={styles.ticketCard}>
            {/* Top Code & Status */}
            <View style={styles.ticketTop}>
              <View style={[styles.statusBadge, { backgroundColor: badgeStyle.bg }]}>
                <Text style={[styles.statusText, { color: badgeStyle.color }]}>
                  {badgeStyle.label}
                </Text>
              </View>
              <View style={styles.codeBlock}>
                <Text style={styles.codeLabel}>{ArStrings.ticket.bookingCodeLabel}</Text>
                <Text style={styles.codeValue}>{ticket.bookingCode}</Text>
              </View>
            </View>

            {/* Real Backend QR Image */}
            <View style={styles.qrWrapper}>
              {ticket.qrCodeDataUrl ? (
                <Image
                  source={{ uri: ticket.qrCodeDataUrl }}
                  style={[styles.qrImage, isCancelled ? styles.qrDimmed : null]}
                  resizeMode="contain"
                  accessibilityLabel={`رمز الاستجابة السريعة للتذكرة ${ticket.bookingCode}`}
                />
              ) : (
                <View style={styles.qrFallback}>
                  <Text style={styles.codeValue}>{ticket.bookingCode}</Text>
                </View>
              )}
              <Text style={styles.qrHint}>{ArStrings.ticket.qrHint}</Text>
            </View>

            <View style={styles.perforatedDivider} />

            {/* Trip & Passenger Info */}
            <Text style={styles.routeLabel}>{ticket.route.label}</Text>

            <View style={styles.infoGrid}>
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>التاريخ (دمشق)</Text>
                <Text style={styles.infoValue}>{formatDateSyrian(ticket.departDateDamascus)}</Text>
              </View>
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>موعد الانطلاق</Text>
                <Text style={styles.infoValue}>
                  {ticket.departTimeDamascus || formatTime24h(ticket.departAt)}
                </Text>
              </View>
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>الحافلة</Text>
                <Text style={styles.infoValue}>
                  {formatBusCategoryAr(ticket.busType.category)} ({ticket.busType.layout})
                  {ticket.busPlateNumber ? ` · ${ticket.busPlateNumber}` : ''}
                </Text>
              </View>
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>الدفع والإجمالي</Text>
                <Text style={styles.infoValue}>
                  {formatPrice(ticket.totalPrice)} · {ticket.paymentMethodLabel}
                </Text>
              </View>
            </View>

            {/* Seats Breakdown + Edit / Per-Seat Cancel */}
            <View style={styles.seatsSection}>
              <Text style={styles.seatsHeading}>المقاعد والركاب</Text>
              {ticket.seats.map((s) => (
                <View key={s.seatNumber} style={styles.seatCard}>
                  <View style={styles.seatRow}>
                    <View style={styles.seatPill}>
                      <Text style={styles.seatPillText}>{s.seatNumber}</Text>
                    </View>
                    <View style={styles.passengerMeta}>
                      <Text style={styles.passengerName}>{s.passengerName}</Text>
                      <Text style={styles.passengerPhone}>{s.passengerPhone}</Text>
                    </View>
                    <Text
                      style={[
                        styles.seatStatusTag,
                        { color: s.isActive ? Colors.success : Colors.danger },
                      ]}
                    >
                      {s.isActive
                        ? ArStrings.ticket.statusConfirmed
                        : ArStrings.ticket.statusCancelled}
                    </Text>
                  </View>

                  {s.isActive && canCancel ? (
                    <View style={styles.seatActions}>
                      {isAuthenticated ? (
                        <TouchableOpacity
                          onPress={() => openEditPassengerModal(s)}
                          style={styles.seatActionBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`${ArStrings.ticket.editPassengerBtn} ${s.seatNumber}`}
                        >
                          <Ionicons name="create-outline" size={16} color={Colors.primary} />
                          <Text style={styles.seatEditText}>
                            {ArStrings.ticket.editPassengerBtn}
                          </Text>
                        </TouchableOpacity>
                      ) : null}

                      {activeSeatsCount > 1 ? (
                        <TouchableOpacity
                          onPress={() => {
                            setSeatToCancel(s.seatNumber);
                            setCancelModalOpen(true);
                          }}
                          style={[styles.seatActionBtn, styles.seatCancelBtn]}
                          accessibilityRole="button"
                          accessibilityLabel={`${ArStrings.ticket.cancelSeatBtn} ${s.seatNumber}`}
                        >
                          <Ionicons name="close-circle-outline" size={16} color={Colors.danger} />
                          <Text style={styles.seatCancelText}>{ArStrings.ticket.cancelSeatBtn}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>

            <View style={styles.noticeBox}>
              <Ionicons name="information-circle" size={18} color={Colors.primary} />
              <Text style={styles.noticeText}>
                {ticket.earlyArrivalNotice || ArStrings.ticket.earlyNoticeDefault}
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actionsRow}>
            <AppButton
              title={ArStrings.ticket.saveBtn}
              onPress={handleSaveTicket}
              loading={savingFile}
              variant="outline"
              style={styles.flexAction}
            />
            <AppButton
              title={ArStrings.ticket.shareBtn}
              onPress={handleShareTicket}
              variant="secondary"
              style={styles.flexAction}
            />
          </View>

          {canCancel ? (
            <View style={styles.cancelBox}>
              <Text style={styles.policyText}>{ArStrings.ticket.cancelPolicyNotice}</Text>
              <AppButton
                title={ArStrings.ticket.cancelBtn}
                onPress={() => {
                  setSeatToCancel(null);
                  setCancelModalOpen(true);
                }}
                variant="danger"
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Edit Passenger Modal */}
      <Modal
        visible={editingSeat !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingSeat(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {ArStrings.ticket.editPassengerTitle} ({editingSeat?.seatNumber ?? ''})
            </Text>
            {editError ? <ErrorBanner message={editError} /> : null}
            <AppInput
              label={ArStrings.passengers.fullNameLabel}
              value={editName}
              onChangeText={setEditName}
              maxLength={120}
            />
            <AppInput
              label={ArStrings.passengers.phoneLabel}
              prefixText="+963"
              keyboardType="phone-pad"
              value={editPhoneDigits}
              onChangeText={(val) =>
                setEditPhoneDigits(toWesternDigits(val).replace(/[^\d+]/g, ''))
              }
              maxLength={14}
            />
            <View style={styles.actionsRow}>
              <AppButton
                title={ArStrings.app.cancel}
                onPress={() => setEditingSeat(null)}
                variant="outline"
                style={styles.flexAction}
              />
              <AppButton
                title={ArStrings.app.save}
                onPress={handleSavePassenger}
                loading={savingPassenger}
                variant="primary"
                style={styles.flexAction}
              />
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={cancelModalOpen}
        title={
          seatToCancel
            ? `${ArStrings.ticket.cancelSeatConfirmTitle} (${seatToCancel})`
            : ArStrings.ticket.cancelConfirmTitle
        }
        message={
          seatToCancel
            ? ArStrings.ticket.cancelSeatConfirmBody
            : ArStrings.ticket.cancelConfirmBody
        }
        confirmTitle={ArStrings.ticket.cancelConfirmCta}
        cancelTitle={ArStrings.ticket.cancelKeepCta}
        isDestructive
        loading={cancelling}
        onConfirm={handleConfirmCancel}
        onCancel={() => {
          setCancelModalOpen(false);
          setSeatToCancel(null);
        }}
      />

      <Toast message={toast} visible={Boolean(toast)} onDismiss={() => setToast('')} type="success" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.md,
  },
  cancelledBanner: {
    backgroundColor: Colors.dangerLight,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    borderRadius: Radii.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  cancelledText: {
    flex: 1,
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.sm,
    color: Colors.danger,
    textAlign: 'right',
  },
  ticketCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    ...Shadows.card,
  },
  ticketTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radii.full,
  },
  statusText: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.xs,
  },
  codeBlock: {
    alignItems: 'flex-end',
  },
  codeLabel: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  codeValue: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.base,
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  qrWrapper: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  qrImage: {
    width: 210,
    height: 210,
    borderRadius: Radii.md,
    backgroundColor: Colors.surface,
  },
  qrDimmed: {
    opacity: 0.35,
  },
  qrFallback: {
    width: 200,
    height: 200,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrHint: {
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  perforatedDivider: {
    borderBottomWidth: 1.5,
    borderBottomColor: Colors.borderStrong,
    borderStyle: 'dashed',
    marginVertical: Spacing.md,
  },
  routeLabel: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.xl,
    color: Colors.textMain,
    textAlign: 'right',
    marginBottom: Spacing.md,
  },
  infoGrid: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  infoCell: {
    backgroundColor: Colors.bgPage,
    borderRadius: Radii.md,
    padding: Spacing.sm,
  },
  infoLabel: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'right',
  },
  infoValue: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.sm,
    color: Colors.textMain,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  seatsSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  seatsHeading: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    marginBottom: 4,
  },
  seatCard: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  seatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  seatPill: {
    minWidth: 40,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 4,
    borderRadius: Radii.sm,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  seatPillText: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.xs,
    color: Colors.textLight,
    fontVariant: ['tabular-nums'],
  },
  passengerMeta: {
    flex: 1,
  },
  passengerName: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.sm,
    color: Colors.textMain,
    textAlign: 'right',
  },
  passengerPhone: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'ltr',
    alignSelf: 'flex-end',
    fontVariant: ['tabular-nums'],
  },
  seatStatusTag: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
  },
  seatActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.xs,
  },
  seatActionBtn: {
    minHeight: TouchTargets.minSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.sm,
    backgroundColor: Colors.primaryLight,
  },
  seatCancelBtn: {
    backgroundColor: Colors.dangerLight,
  },
  seatEditText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
    color: Colors.primary,
  },
  seatCancelText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
    color: Colors.danger,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radii.md,
    padding: Spacing.sm,
  },
  noticeText: {
    flex: 1,
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
    color: Colors.primaryDark,
    textAlign: 'right',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  flexAction: {
    flex: 1,
  },
  cancelBox: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  policyText: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    lineHeight: 19,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  modalTitle: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.lg,
    color: Colors.textMain,
    textAlign: 'right',
    marginBottom: Spacing.md,
  },
});
