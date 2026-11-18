'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Printer,
  RefreshCw,
  TicketCheck,
  Users,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorHandler from '@/components/ui/ErrorHandler';
import PageHeader from '@/components/ui/PageHeader';
import SeatMapBoard from '@/components/ui/SeatMapBoard';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';
import StatusBadge from '@/components/ui/StatusBadge';
import TabComponent from '@/components/ui/TabComponent';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import TicketPrintModal from '@/components/ui/TicketPrintModal';
import { useToast } from '@/components/ui/ToastProvider';
import { WebApiError } from '@/core/api/client';
import { bookingService, tripService } from '@/core/api/services';
import AuthGuard from '@/core/auth/AuthGuard';
import {
  formatPriceSyp,
  generateIdempotencyKey,
  isValidSyrianPhone,
  normalizeSyrianPhone,
} from '@/core/utils/formatters';
import { ArWeb } from '@/i18n/ar';
import {
  PaymentMethod,
  SeatDto,
  SeatMapResponse,
  TicketDto,
  TripDetailDto,
  TripManifestResponse,
} from '@/types/api.types';

interface PassengerDraft {
  seatNumber: string;
  passengerName: string;
  passengerPhone: string;
}

function TripDetailContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const tripId = Number(params.id);
  const initialTab = searchParams.get('tab') === 'manifest' ? 'manifest' : 'booking';

  const [activeTab, setActiveTab] = useState<'booking' | 'manifest'>(initialTab);
  const [trip, setTrip] = useState<TripDetailDto | null>(null);
  const [seatMap, setSeatMap] = useState<SeatMapResponse | null>(null);
  const [manifest, setManifest] = useState<TripManifestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Desk Booking State
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [passengers, setPassengers] = useState<Record<string, PassengerDraft>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH_OFFICE');
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [issuedTicket, setIssuedTicket] = useState<TicketDto | null>(null);

  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey('desk-book'));

  const loadData = useCallback(async () => {
    if (!Number.isFinite(tripId) || tripId <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const [detail, map] = await Promise.all([
        tripService.getById(tripId),
        tripService.getSeats(tripId),
      ]);
      setTrip(detail);
      setSeatMap(map);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  const refreshSeatMapQuietly = useCallback(async () => {
    if (!Number.isFinite(tripId) || tripId <= 0) return;
    try {
      const map = await tripService.getSeats(tripId);
      setSeatMap(map);
    } catch {
      // Quiet background refresh; skip overriding visible state on transient poll error
    }
  }, [tripId]);

  const loadManifest = useCallback(async () => {
    if (!Number.isFinite(tripId) || tripId <= 0) return;
    try {
      const data = await tripService.getManifest(tripId);
      setManifest(data);
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر تحميل كشف الركاب.',
        'error',
      );
    }
  }, [tripId, showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === 'manifest') {
      void loadManifest();
    }
  }, [activeTab, loadManifest]);

  // Real-time 10-second seat map polling
  useEffect(() => {
    if (!trip || trip.status === 'CANCELLED' || trip.status === 'COMPLETED') return;
    const timer = setInterval(() => {
      void refreshSeatMapQuietly();
    }, 10000);
    return () => clearInterval(timer);
  }, [trip, refreshSeatMapQuietly]);

  const isTripBookable = useMemo(() => {
    if (!trip) return false;
    return trip.status === 'OPEN' || trip.status === 'SCHEDULED';
  }, [trip]);

  function handleToggleSeat(seat: SeatDto) {
    if (!isTripBookable) return;
    if (seat.status === 'BOOKED' || seat.status === 'HELD') return;

    setSelectedSeats((prev) => {
      const exists = prev.includes(seat.seatNumber);
      const next = exists
        ? prev.filter((s) => s !== seat.seatNumber)
        : [...prev, seat.seatNumber];
      idempotencyKeyRef.current = generateIdempotencyKey('desk-book');
      setPassengers((curr) => {
        const updated = { ...curr };
        if (exists) {
          delete updated[seat.seatNumber];
        } else if (!updated[seat.seatNumber]) {
          updated[seat.seatNumber] = {
            seatNumber: seat.seatNumber,
            passengerName: '',
            passengerPhone: '',
          };
        }
        return updated;
      });
      return next;
    });
  }

  function copyFirstPassengerToAll() {
    if (selectedSeats.length < 2) return;
    const first = passengers[selectedSeats[0]];
    if (!first) return;
    setPassengers((prev) => {
      const next = { ...prev };
      for (const sn of selectedSeats) {
        next[sn] = {
          seatNumber: sn,
          passengerName: first.passengerName,
          passengerPhone: first.passengerPhone,
        };
      }
      return next;
    });
  }

  async function handleConfirmBooking(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selectedSeats.length === 0) {
      showToast('يرجى تحديد المقاعد أولاً.', 'error');
      return;
    }

    const passengerPayloads = [];
    for (const sn of selectedSeats) {
      const draft = passengers[sn];
      if (!draft || draft.passengerName.trim().length < 2) {
        showToast(`يرجى إدخال اسم الراكب للمقعد ${sn}.`, 'error');
        return;
      }
      if (!isValidSyrianPhone(draft.passengerPhone)) {
        showToast(
          `رقم هاتف الراكب للمقعد ${sn} غير صالح. استخدم صيغة سورية مثل 09XXXXXXXX.`,
          'error',
        );
        return;
      }
      const normalized = normalizeSyrianPhone(draft.passengerPhone);
      if (!normalized) return;
      passengerPayloads.push({
        seatNumber: sn,
        passengerName: draft.passengerName.trim(),
        passengerPhone: normalized,
      });
    }

    setSubmittingBooking(true);
    try {
      const res = await bookingService.create(
        {
          tripId,
          passengers: passengerPayloads,
          contactName: passengerPayloads[0]?.passengerName,
          contactPhone: passengerPayloads[0]?.passengerPhone,
          paymentMethod,
        },
        idempotencyKeyRef.current,
      );

      setSelectedSeats([]);
      setPassengers({});
      idempotencyKeyRef.current = generateIdempotencyKey('desk-book');
      setIssuedTicket(res.ticket);
      showToast(`تم إصدار التذكرة ${res.booking.code} بنجاح.`);
      await Promise.all([loadData(), loadManifest()]);
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر إتمام عملية الحجز.',
        'error',
      );
      await refreshSeatMapQuietly();
    } finally {
      setSubmittingBooking(false);
    }
  }

  const totalCost = (seatMap?.price ?? trip?.price ?? 0) * selectedSeats.length;

  return (
    <div className="space-y-6">
      <div className="no-print">
        <Link
          href="/trips"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:underline mb-3"
        >
          <ArrowRight className="h-4 w-4" />
          العودة إلى قائمة الرحلات
        </Link>

        <PageHeader
          title={
            trip
              ? `رحلة ${trip.origin.nameAr} ← ${trip.destination.nameAr} (#${trip.id})`
              : `تفاصيل الرحلة #${tripId}`
          }
          subtitle={
            trip
              ? `${trip.departDateArabic} · الساعة ${trip.departTimeDamascus} · ${trip.busType.nameAr}`
              : undefined
          }
          extraActions={
            <Button variant="outline" size="sm" onClick={() => void loadData()}>
              <RefreshCw className="h-4 w-4" />
              تحديث المخطط
            </Button>
          }
        />
      </div>

      {error ? <ErrorHandler error={error} onRetry={() => void loadData()} /> : null}
      {loading ? <TableSkeleton rows={6} /> : null}

      {!loading && !error && trip && seatMap ? (
        <>
          {/* Summary Strip */}
          <Card className="no-print p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <div>
                  <span className="text-xs text-fg-muted block">سعر المقعد</span>
                  <span className="font-extrabold text-brand-600 tabular-nums">
                    {formatPriceSyp(seatMap.price)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-fg-muted block">المقاعد المتاحة</span>
                  <span className="font-extrabold text-fg tabular-nums">
                    {trip.availableSeatsCount} / {trip.totalSeats}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-fg-muted block">رقم لوحة الباص</span>
                  <span className="font-bold text-fg">
                    {trip.bus?.plateNumber ?? 'غير محدد'}
                  </span>
                </div>
              </div>
              <StatusBadge
                status={
                  trip.status === 'OPEN'
                    ? 'success'
                    : trip.status === 'CANCELLED'
                      ? 'danger'
                      : 'warning'
                }
                label={ArWeb.tripStatus[trip.status]}
              />
            </div>
          </Card>

          <div className="no-print">
            <TabComponent
              activeTab={activeTab}
              onChange={(tab) => setActiveTab(tab as 'booking' | 'manifest')}
              tabs={[
                { id: 'booking', label: 'خريطة المقاعد والحجز الفوري' },
                {
                  id: 'manifest',
                  label: 'كشف الركاب للطباعة',
                  count: manifest?.passengers.length ?? trip.bookedSeatsCount,
                },
              ]}
            />
          </div>

          {/* Tab 1: Seat Map & Instant Desk Booking */}
          {activeTab === 'booking' ? (
            <div className="no-print grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7">
                <SeatMapBoard
                  seats={seatMap.seats}
                  busTypeName={seatMap.busType.nameAr}
                  layout={seatMap.busType.layout}
                  selectedSeatNumbers={selectedSeats}
                  disabled={!isTripBookable}
                  onToggleSeat={handleToggleSeat}
                />
              </div>

              <div className="lg:col-span-5 space-y-4">
                <Card className="p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <h2 className="text-base font-extrabold text-fg flex items-center gap-2">
                      <TicketCheck className="h-5 w-5 text-brand-600" />
                      ملخص الحجز الفوري
                    </h2>
                  </div>

                  {!isTripBookable ? (
                    <p className="text-sm text-rose-600 font-bold">
                      لا يمكن إجراء حجز جديد لأن حالة الرحلة الحالية هي (
                      {ArWeb.tripStatus[trip.status]}).
                    </p>
                  ) : selectedSeats.length === 0 ? (
                    <p className="text-sm text-fg-muted py-4 text-center">
                      انقر على المقاعد المتاحة في المخطط لاختيارها والبدء بالحجز.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {selectedSeats.map((sn) => (
                          <span
                            key={sn}
                            className="rounded-lg bg-brand-600 text-white px-2.5 py-1 text-xs font-extrabold"
                          >
                            مقعد {sn}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center justify-between rounded-xl bg-surface-muted p-3 border border-line text-sm">
                        <span className="font-bold text-fg-muted">المبلغ الإجمالي</span>
                        <span className="text-lg font-extrabold text-brand-600 tabular-nums">
                          {formatPriceSyp(totalCost)}
                        </span>
                      </div>

                      <form onSubmit={handleConfirmBooking} className="space-y-4 pt-2 border-t border-line">
                        {selectedSeats.length > 1 ? (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={copyFirstPassengerToAll}
                              className="text-xs font-bold text-brand-600 hover:underline cursor-pointer"
                            >
                              تعبئة بقية المقاعد ببيانات الراكب الأول
                            </button>
                          </div>
                        ) : null}

                        <div className="space-y-3 max-h-[340px] overflow-y-auto pl-1">
                          {selectedSeats.map((sn) => (
                            <div
                              key={sn}
                              className="rounded-xl border border-line bg-surface-muted p-3 space-y-2"
                            >
                              <p className="text-xs font-extrabold text-brand-600">
                                بيانات راكب المقعد {sn}
                              </p>
                              <input
                                type="text"
                                placeholder="الاسم الثلاثي للراكب"
                                value={passengers[sn]?.passengerName ?? ''}
                                onChange={(e) =>
                                  setPassengers((prev) => ({
                                    ...prev,
                                    [sn]: {
                                      seatNumber: sn,
                                      passengerName: e.target.value,
                                      passengerPhone: prev[sn]?.passengerPhone ?? '',
                                    },
                                  }))
                                }
                                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                                required
                              />
                              <input
                                type="tel"
                                dir="ltr"
                                placeholder="09XXXXXXXX"
                                value={passengers[sn]?.passengerPhone ?? ''}
                                onChange={(e) =>
                                  setPassengers((prev) => ({
                                    ...prev,
                                    [sn]: {
                                      seatNumber: sn,
                                      passengerName: prev[sn]?.passengerName ?? '',
                                      passengerPhone: e.target.value,
                                    },
                                  }))
                                }
                                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg tabular-nums text-left"
                                required
                              />
                            </div>
                          ))}
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-fg-muted">
                            طريقة الدفع المعتمدة
                          </label>
                          <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                            <button
                              type="button"
                              onClick={() => setPaymentMethod('CASH_OFFICE')}
                              className={`rounded-xl border px-3 py-2.5 cursor-pointer ${
                                paymentMethod === 'CASH_OFFICE'
                                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                                  : 'border-line bg-surface text-fg-muted'
                              }`}
                            >
                              نقداً في المكتب
                            </button>
                            <button
                              type="button"
                              onClick={() => setPaymentMethod('CASH_ON_BOARDING')}
                              className={`rounded-xl border px-3 py-2.5 cursor-pointer ${
                                paymentMethod === 'CASH_ON_BOARDING'
                                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                                  : 'border-line bg-surface text-fg-muted'
                              }`}
                            >
                              نقداً عند الصعود
                            </button>
                          </div>
                        </div>

                        <Button
                          type="submit"
                          size="lg"
                          loading={submittingBooking}
                          className="w-full"
                        >
                          تأكيد الحجز وإصدار التذكرة
                        </Button>
                      </form>
                    </>
                  )}
                </Card>
              </div>
            </div>
          ) : null}

          {/* Tab 2: Printable Trip Manifest */}
          {activeTab === 'manifest' ? (
            <div className="space-y-4">
              <div className="no-print flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-fg flex items-center gap-2">
                  <Users className="h-5 w-5 text-brand-600" />
                  كشف الركاب المعتمد للرحلة #{trip.id}
                </h2>
                <Button onClick={() => window.print()}>
                  <Printer className="h-4 w-4" />
                  طباعة كشف الركاب
                </Button>
              </div>

              {!manifest ? (
                <TableSkeleton rows={5} />
              ) : manifest.passengers.length === 0 ? (
                <EmptyState
                  title="لا يوجد ركاب مسجلون في هذه الرحلة حتى الآن"
                  subtitle="بمجرد تأكيد أي حجز سيظهر اسم الراكب ومقعده هنا مباشرة."
                />
              ) : (
                <div className="print-area rounded-2xl border border-line bg-surface p-5 print:p-2">
                  <div className="hidden print:block border-b border-slate-300 pb-3 mb-4">
                    <h1 className="text-lg font-extrabold">
                      شركة BusWay للنقل — كشف ركاب الرحلة #{manifest.trip.id}
                    </h1>
                    <p className="text-xs text-slate-600 mt-1">
                      {manifest.trip.origin.nameAr} ← {manifest.trip.destination.nameAr} |{' '}
                      {manifest.trip.departDateArabic} {manifest.trip.departTimeDamascus} |{' '}
                      لوحة الباص: {manifest.trip.bus?.plateNumber ?? 'غير محدد'}
                    </p>
                  </div>

                  <Table className="border-0 rounded-none shadow-none">
                    <TableHeader>
                      <TableRow>
                        <TableHead>المقعد</TableHead>
                        <TableHead>اسم الراكب</TableHead>
                        <TableHead>رقم الهاتف</TableHead>
                        <TableHead>رمز الحجز</TableHead>
                        <TableHead>طريقة الدفع</TableHead>
                        <TableHead>الحالة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {manifest.passengers.map((p) => (
                        <TableRow key={`${p.bookingCode}-${p.seatNumber}`}>
                          <TableCell className="font-extrabold text-brand-600">
                            {p.seatNumber}
                          </TableCell>
                          <TableCell className="font-bold text-fg">
                            {p.passengerName}
                          </TableCell>
                          <TableCell className="tabular-nums font-semibold" dir="ltr">
                            {p.passengerPhone}
                          </TableCell>
                          <TableCell className="tabular-nums font-bold">
                            {p.bookingCode}
                          </TableCell>
                          <TableCell>
                            {p.paymentMethod === 'CASH_OFFICE'
                              ? 'نقداً في المكتب'
                              : 'عند الصعود'}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              status={p.status === 'CONFIRMED' ? 'success' : 'warning'}
                              label={ArWeb.bookingStatus[p.status]}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      <TicketPrintModal ticket={issuedTicket} onClose={() => setIssuedTicket(null)} />
    </div>
  );
}

export default function TripDetailPage() {
  return (
    <AuthGuard>
      <AppLayout>
        <Suspense fallback={<TableSkeleton rows={6} />}>
          <TripDetailContent />
        </Suspense>
      </AppLayout>
    </AuthGuard>
  );
}
