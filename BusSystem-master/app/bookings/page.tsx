'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Ban,
  Calendar,
  Edit3,
  Printer,
  RotateCcw,
  Search,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DialogConfirm from '@/components/ui/DialogConfirm';
import EmptyState from '@/components/ui/EmptyState';
import ErrorHandler from '@/components/ui/ErrorHandler';
import ModalShell from '@/components/ui/ModalShell';
import PageHeader from '@/components/ui/PageHeader';
import Pagination from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';
import StatusBadge, { BadgeStatus } from '@/components/ui/StatusBadge';
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
import { bookingService } from '@/core/api/services';
import AuthGuard from '@/core/auth/AuthGuard';
import { useAuth } from '@/core/auth/AuthContext';
import {
  formatPriceSyp,
  getDamascusDateYmd,
  isValidSyrianPhone,
  normalizeSyrianPhone,
} from '@/core/utils/formatters';
import { ArWeb } from '@/i18n/ar';
import {
  BookingDto,
  BookingStatus,
  PaginationMeta,
  TicketDto,
} from '@/types/api.types';

function mapBookingBadge(status: BookingStatus): BadgeStatus {
  if (status === 'CANCELLED') return 'danger';
  if (status === 'PARTIAL_CANCELLED') return 'warning';
  return 'success';
}

function BookingsContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [codeFilter, setCodeFilter] = useState(searchParams.get('code') ?? '');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [bookings, setBookings] = useState<BookingDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Ticket modal
  const [ticketModal, setTicketModal] = useState<TicketDto | null>(null);

  // Edit passengers modal
  const [editingBooking, setEditingBooking] = useState<BookingDto | null>(null);
  const [passengerDrafts, setPassengerDrafts] = useState<
    { seatNumber: string; passengerName: string; passengerPhone: string }[]
  >([]);
  const [savingPassengers, setSavingPassengers] = useState(false);

  // Cancel booking / seat modal
  const [cancelTarget, setCancelTarget] = useState<BookingDto | null>(null);
  const [cancelMode, setCancelMode] = useState<'ALL' | string>('ALL');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await bookingService.findAll({
        code: codeFilter.trim() || undefined,
        phone: phoneFilter.trim() || undefined,
        date: dateFilter || undefined,
        status: (statusFilter || undefined) as BookingStatus | undefined,
        page,
        limit: 15,
      });
      setBookings(res.items);
      setMeta(res.meta);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [codeFilter, phoneFilter, dateFilter, statusFilter, page]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  async function handleOpenTicket(code: string) {
    try {
      const ticket = await bookingService.getTicket(code);
      setTicketModal(ticket);
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر جلب التذكرة للطباعة.',
        'error',
      );
    }
  }

  function openEditPassengers(booking: BookingDto) {
    setEditingBooking(booking);
    setPassengerDrafts(
      booking.seats
        .filter((s) => s.isActive)
        .map((s) => ({
          seatNumber: s.seatNumber,
          passengerName: s.passengerName,
          passengerPhone: s.passengerPhone,
        })),
    );
  }

  async function handleSavePassengers(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingBooking) return;

    const normalized = [];
    for (const p of passengerDrafts) {
      if (p.passengerName.trim().length < 2) {
        showToast(`أدخل اسماً صحيحاً للمقعد ${p.seatNumber}.`, 'error');
        return;
      }
      if (!isValidSyrianPhone(p.passengerPhone)) {
        showToast(`أدخل رقم هاتف سوري صحيح للمقعد ${p.seatNumber}.`, 'error');
        return;
      }
      const phone = normalizeSyrianPhone(p.passengerPhone);
      if (!phone) return;
      normalized.push({
        seatNumber: p.seatNumber,
        passengerName: p.passengerName.trim(),
        passengerPhone: phone,
      });
    }

    setSavingPassengers(true);
    try {
      await bookingService.updatePassengers(editingBooking.code, normalized);
      showToast('تم تحديث بيانات الركاب بنجاح.');
      setEditingBooking(null);
      await loadBookings();
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر تعديل بيانات الركاب.',
        'error',
      );
    } finally {
      setSavingPassengers(false);
    }
  }

  async function handleConfirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      if (cancelMode === 'ALL') {
        await bookingService.cancel(
          cancelTarget.code,
          cancelReason.trim() || undefined,
        );
        showToast(`تم إلغاء الحجز ${cancelTarget.code} بنجاح.`);
      } else {
        await bookingService.cancelSeat(
          cancelTarget.code,
          cancelMode,
          cancelReason.trim() || undefined,
        );
        showToast(`تم إلغاء المقعد ${cancelMode} من الحجز بنجاح.`);
      }
      setCancelTarget(null);
      setCancelReason('');
      await loadBookings();
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر إتمام الإلغاء.',
        'error',
      );
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل الحجوزات والتذاكر"
        subtitle="البحث برمز الحجز أو رقم الهاتف، طباعة التذاكر، تعديل بيانات الركاب، وإدارة الإلغاء"
        extraActions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDateFilter(getDamascusDateYmd());
              setPage(1);
            }}
          >
            <Calendar className="h-4 w-4" />
            حجوزات اليوم
          </Button>
        }
      />

      {/* Search & Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-bold text-fg-muted mb-1">
              رمز الحجز / قارئ الباركود
            </label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle pointer-events-none" />
              <input
                type="text"
                value={codeFilter}
                onChange={(e) => {
                  setCodeFilter(e.target.value);
                  setPage(1);
                }}
                placeholder="BK-2026-..."
                className="w-full rounded-xl border border-line bg-surface py-2 pr-9 pl-3 text-sm text-fg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-fg-muted mb-1">
              رقم الهاتف
            </label>
            <input
              type="tel"
              dir="ltr"
              value={phoneFilter}
              onChange={(e) => {
                setPhoneFilter(e.target.value);
                setPage(1);
              }}
              placeholder="09XXXXXXXX"
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg text-left"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-fg-muted mb-1">
              تاريخ الرحلة
            </label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-fg-muted mb-1">الحالة</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
            >
              <option value="">جميع الحالات</option>
              <option value="CONFIRMED">{ArWeb.bookingStatus.CONFIRMED}</option>
              <option value="PARTIAL_CANCELLED">
                {ArWeb.bookingStatus.PARTIAL_CANCELLED}
              </option>
              <option value="CANCELLED">{ArWeb.bookingStatus.CANCELLED}</option>
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCodeFilter('');
              setPhoneFilter('');
              setDateFilter('');
              setStatusFilter('');
              setPage(1);
            }}
          >
            <RotateCcw className="h-4 w-4" />
            مسح الفلاتر
          </Button>
        </div>
      </Card>

      {error ? <ErrorHandler error={error} onRetry={() => void loadBookings()} /> : null}
      {loading ? <TableSkeleton rows={6} /> : null}

      {!loading && !error && bookings.length === 0 ? (
        <EmptyState
          title="لا توجد حجوزات مطابقة لنتيجة البحث"
          subtitle="تحقق من رمز التذكرة أو رقم الهاتف أو التاريخ المحدد."
        />
      ) : null}

      {!loading && !error && bookings.length > 0 ? (
        <div className="rounded-2xl border border-line bg-surface overflow-hidden">
          <Table className="border-0 rounded-none shadow-none">
            <TableHeader>
              <TableRow>
                <TableHead>رمز الحجز</TableHead>
                <TableHead>الرحلة والموعد</TableHead>
                <TableHead>المقاعد والركاب</TableHead>
                <TableHead>الإجمالي</TableHead>
                <TableHead>القناة</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((b) => {
                const activeSeats = b.seats.filter((s) => s.isActive);
                const canModify = b.status !== 'CANCELLED' && activeSeats.length > 0;
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-extrabold text-brand-600 tabular-nums whitespace-nowrap">
                      {b.code}
                    </TableCell>
                    <TableCell>
                      <div className="font-extrabold text-fg">
                        {b.trip.origin.nameAr} ← {b.trip.destination.nameAr}
                      </div>
                      <div className="text-xs text-fg-subtle tabular-nums">
                        {b.trip.departDateArabic} · {b.trip.departTimeDamascus}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {b.seats.map((s) => (
                          <div
                            key={s.id}
                            className={`text-xs ${
                              s.isActive
                                ? 'text-fg font-semibold'
                                : 'text-fg-subtle line-through'
                            }`}
                          >
                            <span className="font-extrabold text-brand-600 ml-1">
                              {s.seatNumber}
                            </span>
                            {s.passengerName} ({s.passengerPhone})
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="font-extrabold text-fg tabular-nums whitespace-nowrap">
                      {formatPriceSyp(b.totalPrice)}
                    </TableCell>
                    <TableCell className="text-xs font-bold">
                      {b.channel === 'RECEPTIONIST'
                        ? 'مكتب الاستقبال'
                        : b.channel === 'MOBILE_APP'
                          ? 'التطبيق'
                          : 'الويب'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={mapBookingBadge(b.status)}
                        label={ArWeb.bookingStatus[b.status]}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleOpenTicket(b.code)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                          تذكرة
                        </Button>
                        {canModify ? (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openEditPassengers(b)}
                              aria-label={`تعديل ركاب ${b.code}`}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => {
                                setCancelTarget(b);
                                setCancelMode('ALL');
                                setCancelReason('');
                              }}
                              aria-label={`إلغاء ${b.code}`}
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            currentPage={meta.page}
            totalPages={meta.totalPages}
            onPageChange={(next) => setPage(next)}
          />
        </div>
      ) : null}

      {/* Edit Passengers Modal */}
      <ModalShell
        isOpen={Boolean(editingBooking)}
        onClose={() => setEditingBooking(null)}
        title={
          editingBooking
            ? `تعديل بيانات ركاب الحجز ${editingBooking.code}`
            : 'تعديل بيانات الركاب'
        }
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSavePassengers} className="space-y-4">
          <div className="space-y-3">
            {passengerDrafts.map((item, idx) => (
              <div
                key={item.seatNumber}
                className="rounded-xl border border-line bg-surface-muted p-3 space-y-2"
              >
                <p className="text-xs font-extrabold text-brand-600">
                  المقعد {item.seatNumber}
                </p>
                <input
                  type="text"
                  value={item.passengerName}
                  onChange={(e) =>
                    setPassengerDrafts((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, passengerName: e.target.value } : row,
                      ),
                    )
                  }
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                  required
                />
                <input
                  type="tel"
                  dir="ltr"
                  value={item.passengerPhone}
                  onChange={(e) =>
                    setPassengerDrafts((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, passengerPhone: e.target.value } : row,
                      ),
                    )
                  }
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg text-left tabular-nums"
                  required
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-line">
            <Button variant="outline" onClick={() => setEditingBooking(null)}>
              إلغاء
            </Button>
            <Button type="submit" loading={savingPassengers}>
              حفظ التعديلات
            </Button>
          </div>
        </form>
      </ModalShell>

      {/* Cancel Full / Partial Seat Confirmation Modal */}
      <DialogConfirm
        isOpen={Boolean(cancelTarget)}
        variant="danger"
        title={`إلغاء الحجز ${cancelTarget?.code ?? ''}`}
        message={
          user?.role === 'ADMIN'
            ? 'بصفتك مديراً يمكنك إلغاء الحجز بالكامل أو مقعد محدد حتى بعد انتهاء مهلة الإلغاء الافتراضية.'
            : 'سيتم إلغاء الحجز وفق المهلة المعتمدة في إعدادات النظام.'
        }
        confirmText={cancelMode === 'ALL' ? 'إلغاء الحجز بالكامل' : `إلغاء المقعد ${cancelMode}`}
        loading={cancelling}
        onConfirm={() => void handleConfirmCancel()}
        onClose={() => setCancelTarget(null)}
      >
        {cancelTarget ? (
          <div className="space-y-3">
            {cancelTarget.seats.filter((s) => s.isActive).length > 1 ? (
              <div>
                <label className="block text-xs font-bold text-fg-muted mb-1">
                  نطاق الإلغاء
                </label>
                <select
                  value={cancelMode}
                  onChange={(e) => setCancelMode(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                >
                  <option value="ALL">إلغاء جميع المقاعد (كامل الحجز)</option>
                  {cancelTarget.seats
                    .filter((s) => s.isActive)
                    .map((s) => (
                      <option key={s.id} value={s.seatNumber}>
                        إلغاء المقعد {s.seatNumber} فقط ({s.passengerName})
                      </option>
                    ))}
                </select>
              </div>
            ) : null}
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="سبب الإلغاء (اختياري)..."
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>
        ) : null}
      </DialogConfirm>

      <TicketPrintModal ticket={ticketModal} onClose={() => setTicketModal(null)} />
    </div>
  );
}

export default function BookingsPage() {
  return (
    <AuthGuard>
      <AppLayout>
        <Suspense fallback={<TableSkeleton rows={6} />}>
          <BookingsContent />
        </Suspense>
      </AppLayout>
    </AuthGuard>
  );
}
