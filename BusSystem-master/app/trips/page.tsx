'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Ban,
  ClipboardList,
  Edit3,
  Plus,
  RotateCcw,
  Ticket,
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
import { useToast } from '@/components/ui/ToastProvider';
import { WebApiError } from '@/core/api/client';
import {
  busService,
  busTypeService,
  cityService,
  tripService,
} from '@/core/api/services';
import AuthGuard from '@/core/auth/AuthGuard';
import { useAuth } from '@/core/auth/AuthContext';
import { formatPriceSyp, getDamascusDateYmd } from '@/core/utils/formatters';
import { ArWeb } from '@/i18n/ar';
import {
  BusDto,
  BusTypeDto,
  CityDto,
  PaginationMeta,
  TripStatus,
  TripSummaryDto,
} from '@/types/api.types';

function mapTripBadge(status: TripStatus): BadgeStatus {
  switch (status) {
    case 'OPEN':
      return 'success';
    case 'SCHEDULED':
      return 'info';
    case 'FULL':
    case 'CLOSED':
      return 'warning';
    case 'CANCELLED':
      return 'danger';
    default:
      return 'neutral';
  }
}

interface TripFormState {
  originId: string;
  destinationId: string;
  busTypeId: string;
  busId: string;
  departDate: string;
  departTime: string;
  price: string;
  status: TripStatus;
}

const INITIAL_META: PaginationMeta = { page: 1, limit: 15, total: 0, totalPages: 1 };

export default function TripsManagementPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'ADMIN';

  const [cities, setCities] = useState<CityDto[]>([]);
  const [busTypes, setBusTypes] = useState<BusTypeDto[]>([]);
  const [buses, setBuses] = useState<BusDto[]>([]);

  const [originFilter, setOriginFilter] = useState('');
  const [destFilter, setDestFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [includePast, setIncludePast] = useState(false);
  const [page, setPage] = useState(1);

  const [trips, setTrips] = useState<TripSummaryDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>(INITIAL_META);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Create / Edit modal state (ADMIN only)
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<TripSummaryDto | null>(null);
  const [form, setForm] = useState<TripFormState>({
    originId: '',
    destinationId: '',
    busTypeId: '',
    busId: '',
    departDate: getDamascusDateYmd(),
    departTime: '08:00',
    price: '45000',
    status: 'OPEN',
  });
  const [savingForm, setSavingForm] = useState(false);

  // Duplicate trip confirmation modal (`409 DUPLICATE_TRIP_CONFIRMATION_REQUIRED`)
  const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState(false);

  // Cancel trip dialog state (ADMIN only)
  const [cancelTarget, setCancelTarget] = useState<TripSummaryDto | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [cityList, busTypeList, busList] = await Promise.all([
          cityService.getAll(false),
          busTypeService.getAll(false),
          busService.getAll({ includeInactive: false }),
        ]);
        setCities(cityList);
        setBusTypes(busTypeList);
        setBuses(busList);
      } catch {
        // Non-blocking lookup preload; table handles its own error UI
      }
    })();
  }, []);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tripService.search({
        originId: originFilter ? Number(originFilter) : undefined,
        destinationId: destFilter ? Number(destFilter) : undefined,
        date: dateFilter || undefined,
        status: (statusFilter || undefined) as TripStatus | undefined,
        includePast,
        page,
        limit: 15,
        sortBy: 'departAt',
        sortOrder: 'asc',
      });
      setTrips(res.items);
      setMeta(res.meta);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [originFilter, destFilter, dateFilter, statusFilter, includePast, page]);

  useEffect(() => {
    void loadTrips();
  }, [loadTrips]);

  const matchingBuses = useMemo(() => {
    if (!form.busTypeId) return [];
    const btId = Number(form.busTypeId);
    return buses.filter((b) => b.isActive && b.busTypeId === btId);
  }, [buses, form.busTypeId]);

  function openCreateModal() {
    const firstOrigin = cities[0]?.id ? String(cities[0].id) : '';
    const secondCity = cities[1]?.id ? String(cities[1].id) : '';
    const firstBusType = busTypes[0]?.id ? String(busTypes[0].id) : '';
    setEditingTrip(null);
    setForm({
      originId: firstOrigin,
      destinationId: secondCity,
      busTypeId: firstBusType,
      busId: '',
      departDate: getDamascusDateYmd(),
      departTime: '09:00',
      price: '45000',
      status: 'OPEN',
    });
    setFormModalOpen(true);
  }

  function openEditModal(trip: TripSummaryDto) {
    setEditingTrip(trip);
    setForm({
      originId: String(trip.origin.id),
      destinationId: String(trip.destination.id),
      busTypeId: String(trip.busType.id),
      busId: trip.bus?.id ? String(trip.bus.id) : '',
      departDate: trip.departDateDamascus,
      departTime: trip.departTimeDamascus,
      price: String(trip.price),
      status: trip.status,
    });
    setFormModalOpen(true);
  }

  async function submitTripForm(confirmDuplicate = false) {
    if (!form.originId || !form.destinationId || !form.busTypeId) {
      showToast('يرجى اختيار مدينة الانطلاق والوجهة ونوع الباص.', 'error');
      return;
    }
    if (form.originId === form.destinationId) {
      showToast('مدينة الانطلاق يجب أن تختلف عن مدينة الوجهة.', 'error');
      return;
    }
    const priceNum = Number(form.price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      showToast('يرجى إدخال سعر تذكرة صحيح أكبر من الصفر.', 'error');
      return;
    }

    setSavingForm(true);
    try {
      if (editingTrip) {
        await tripService.update(editingTrip.id, {
          originId: Number(form.originId),
          destinationId: Number(form.destinationId),
          busTypeId:
            editingTrip.bookedSeatsCount > 0 ? undefined : Number(form.busTypeId),
          busId: form.busId ? Number(form.busId) : undefined,
          departDate: form.departDate,
          departTime: form.departTime,
          price: priceNum,
          status: form.status,
        });
        showToast('تم تحديث بيانات الرحلة بنجاح.');
      } else {
        await tripService.create({
          originId: Number(form.originId),
          destinationId: Number(form.destinationId),
          busTypeId: Number(form.busTypeId),
          busId: form.busId ? Number(form.busId) : undefined,
          departDate: form.departDate,
          departTime: form.departTime,
          price: priceNum,
          status: form.status,
          confirmDuplicate,
        });
        showToast('تم إنشاء الرحلة بنجاح.');
      }
      setDuplicateConfirmOpen(false);
      setFormModalOpen(false);
      await loadTrips();
    } catch (err) {
      if (
        !editingTrip &&
        err instanceof WebApiError &&
        err.code === 'DUPLICATE_TRIP_CONFIRMATION_REQUIRED'
      ) {
        setDuplicateConfirmOpen(true);
        return;
      }
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر حفظ بيانات الرحلة.',
        'error',
      );
    } finally {
      setSavingForm(false);
    }
  }

  async function handleConfirmCancelTrip() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await tripService.cancel(cancelTarget.id, cancelReason.trim() || undefined);
      showToast('تم إلغاء الرحلة وإشعار الحجوزات المرتبطة.');
      setCancelTarget(null);
      setCancelReason('');
      await loadTrips();
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر إلغاء الرحلة.',
        'error',
      );
    } finally {
      setCancelling(false);
    }
  }

  return (
    <AuthGuard>
      <AppLayout>
        <div className="space-y-6">
          <PageHeader
            title="إدارة الرحلات والمقاعد"
            subtitle={
              isAdmin
                ? 'استعراض وجدولة وتعديل الرحلات وفتح خرائط المقاعد وكشف الركاب'
                : 'بحث سريع عن الرحلات وفتح خريطة المقاعد لإصدار الحجوزات وكشف الركاب'
            }
            actionLabel={isAdmin ? 'إضافة رحلة جديدة' : undefined}
            onAction={isAdmin ? openCreateModal : undefined}
          />

          {/* Filters */}
          <Card className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
              <div>
                <label className="block text-xs font-bold text-fg-muted mb-1">
                  من مدينة
                </label>
                <select
                  value={originFilter}
                  onChange={(e) => {
                    setOriginFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-brand-600 focus:outline-none"
                >
                  <option value="">الكل</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameAr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-fg-muted mb-1">
                  إلى مدينة
                </label>
                <select
                  value={destFilter}
                  onChange={(e) => {
                    setDestFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-brand-600 focus:outline-none"
                >
                  <option value="">الكل</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameAr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-fg-muted mb-1">
                  تاريخ الانطلاق
                </label>
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => {
                    setDateFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-brand-600 focus:outline-none"
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
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-brand-600 focus:outline-none"
                >
                  <option value="">جميع الحالات</option>
                  {(Object.keys(ArWeb.tripStatus) as TripStatus[]).map((st) => (
                    <option key={st} value={st}>
                      {ArWeb.tripStatus[st]}
                    </option>
                  ))}
                </select>
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-bold text-fg py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePast}
                  onChange={(e) => {
                    setIncludePast(e.target.checked);
                    setPage(1);
                  }}
                  className="h-4 w-4 accent-brand-600"
                />
                تضمين الرحلات السابقة
              </label>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOriginFilter('');
                  setDestFilter('');
                  setDateFilter('');
                  setStatusFilter('');
                  setIncludePast(false);
                  setPage(1);
                }}
              >
                <RotateCcw className="h-4 w-4" />
                إعادة ضبط
              </Button>
            </div>
          </Card>

          {error ? <ErrorHandler error={error} onRetry={() => void loadTrips()} /> : null}

          {loading ? <TableSkeleton rows={6} /> : null}

          {!loading && !error && trips.length === 0 ? (
            <EmptyState
              title="لا توجد رحلات مطابقة لمعايير البحث"
              subtitle="جرّب تغيير الفلاتر أو إضافة رحلة جديدة."
              actionLabel={isAdmin ? 'إضافة رحلة جديدة' : undefined}
              onAction={isAdmin ? openCreateModal : undefined}
            />
          ) : null}

          {!loading && !error && trips.length > 0 ? (
            <div className="rounded-2xl border border-line bg-surface overflow-hidden">
              <Table className="border-0 rounded-none shadow-none">
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>المسار</TableHead>
                    <TableHead>التاريخ والوقت</TableHead>
                    <TableHead>الباص والمخطط</TableHead>
                    <TableHead>السعر</TableHead>
                    <TableHead>الإشغال</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trips.map((trip) => {
                    const isLocked =
                      trip.status === 'CANCELLED' || trip.status === 'COMPLETED';
                    return (
                      <TableRow key={trip.id}>
                        <TableCell className="tabular-nums font-bold text-fg-muted">
                          #{trip.id}
                        </TableCell>
                        <TableCell className="font-extrabold text-fg">
                          {trip.origin.nameAr} ← {trip.destination.nameAr}
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-fg">{trip.departDateArabic}</div>
                          <div className="text-xs text-fg-subtle tabular-nums">
                            {trip.departTimeDamascus}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-fg">{trip.busType.nameAr}</div>
                          <div className="text-xs text-fg-subtle">
                            {trip.busType.layout}
                            {trip.bus ? ` · لوحة ${trip.bus.plateNumber}` : ''}
                          </div>
                        </TableCell>
                        <TableCell className="font-extrabold text-brand-600 tabular-nums">
                          {formatPriceSyp(trip.price)}
                        </TableCell>
                        <TableCell>
                          <div className="tabular-nums font-bold text-fg">
                            {trip.bookedSeatsCount} / {trip.totalSeats}
                          </div>
                          <div className="text-xs text-emerald-600 tabular-nums">
                            متاح {trip.availableSeatsCount}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={mapTripBadge(trip.status)}
                            label={ArWeb.tripStatus[trip.status]}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link
                              href={`/trips/${trip.id}`}
                              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
                            >
                              <Ticket className="h-3.5 w-3.5" />
                              المقاعد والحجز
                            </Link>
                            <Link
                              href={`/trips/${trip.id}?tab=manifest`}
                              className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-bold text-fg hover:bg-surface-muted"
                            >
                              <ClipboardList className="h-3.5 w-3.5" />
                              كشف الركاب
                            </Link>
                            {isAdmin && !isLocked ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openEditModal(trip)}
                                  aria-label={`تعديل الرحلة ${trip.id}`}
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => {
                                    setCancelTarget(trip);
                                    setCancelReason('');
                                  }}
                                  aria-label={`إلغاء الرحلة ${trip.id}`}
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
        </div>

        {/* Admin Create/Edit Modal */}
        <ModalShell
          isOpen={Boolean(formModalOpen && isAdmin)}
          onClose={() => setFormModalOpen(false)}
          title={
            <span className="inline-flex items-center gap-2">
              <Plus className="h-5 w-5 text-brand-600" />
              {editingTrip ? `تعديل الرحلة #${editingTrip.id}` : 'إنشاء رحلة جديدة'}
            </span>
          }
          maxWidthClass="max-w-xl"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-fg mb-1">
                    مدينة الانطلاق
                  </label>
                  <select
                    value={form.originId}
                    onChange={(e) => setForm((f) => ({ ...f, originId: e.target.value }))}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                  >
                    <option value="">اختر مدينة...</option>
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameAr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg mb-1">
                    مدينة الوجهة
                  </label>
                  <select
                    value={form.destinationId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, destinationId: e.target.value }))
                    }
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                  >
                    <option value="">اختر مدينة...</option>
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameAr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg mb-1">
                    نوع الباص (الفئة والمخطط)
                  </label>
                  <select
                    value={form.busTypeId}
                    disabled={Boolean(editingTrip && editingTrip.bookedSeatsCount > 0)}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, busTypeId: e.target.value, busId: '' }))
                    }
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg disabled:opacity-60"
                  >
                    <option value="">اختر نوع الباص...</option>
                    {busTypes.map((bt) => (
                      <option key={bt.id} value={bt.id}>
                        {bt.nameAr} ({bt.layout} · {bt.totalSeats} مقعد)
                      </option>
                    ))}
                  </select>
                  {editingTrip && editingTrip.bookedSeatsCount > 0 ? (
                    <span className="mt-1 block text-[11px] text-amber-700 font-bold">
                      لا يمكن تغيير نوع الباص لوجود حجوزات نشطة على الرحلة.
                    </span>
                  ) : null}
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg mb-1">
                    الباص الفعلي (اختياري)
                  </label>
                  <select
                    value={form.busId}
                    onChange={(e) => setForm((f) => ({ ...f, busId: e.target.value }))}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                  >
                    <option value="">بدون تخصيص لوحة</option>
                    {matchingBuses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.plateNumber}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg mb-1">
                    تاريخ الرحلة
                  </label>
                  <input
                    type="date"
                    value={form.departDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, departDate: e.target.value }))
                    }
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg mb-1">
                    وقت الانطلاق (24 ساعة)
                  </label>
                  <input
                    type="time"
                    value={form.departTime}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, departTime: e.target.value }))
                    }
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg mb-1">
                    السعر (ل.س)
                  </label>
                  <input
                    type="number"
                    min={1000}
                    step={500}
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg mb-1">
                    حالة الرحلة
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value as TripStatus }))
                    }
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                  >
                    <option value="OPEN">{ArWeb.tripStatus.OPEN}</option>
                    <option value="SCHEDULED">{ArWeb.tripStatus.SCHEDULED}</option>
                    <option value="CLOSED">{ArWeb.tripStatus.CLOSED}</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-line">
                <Button variant="outline" onClick={() => setFormModalOpen(false)}>
                  إلغاء
                </Button>
                <Button loading={savingForm} onClick={() => void submitTripForm(false)}>
                  {editingTrip ? 'حفظ التعديلات' : 'إنشاء الرحلة'}
                </Button>
              </div>
        </ModalShell>

        {/* Duplicate Confirmation Modal */}
        <DialogConfirm
          isOpen={duplicateConfirmOpen}
          variant="accent"
          title="تأكيد إنشاء رحلة مكررة"
          message="توجد رحلة أخرى على نفس المسار ونوع الباص والموعد الزمني. هل تريد المتابعة وإنشاء الرحلة على أي حال؟"
          confirmText="نعم، أنشئ الرحلة"
          loading={savingForm}
          onConfirm={() => void submitTripForm(true)}
          onClose={() => setDuplicateConfirmOpen(false)}
        />

        {/* Cancel Trip Confirmation Modal */}
        <DialogConfirm
          isOpen={Boolean(cancelTarget)}
          variant="danger"
          title={`إلغاء الرحلة #${cancelTarget?.id ?? ''}`}
          message={
            cancelTarget
              ? `سيتم إلغاء رحلة ${cancelTarget.origin.nameAr} ← ${cancelTarget.destination.nameAr} (${cancelTarget.bookedSeatsCount} مقعد محجوز) وإلغاء جميع الحجوزات النشطة المرتبطة بها وإشعار الركاب.`
              : ''
          }
          confirmText="تأكيد إلغاء الرحلة"
          loading={cancelling}
          onConfirm={() => void handleConfirmCancelTrip()}
          onClose={() => setCancelTarget(null)}
        >
          <input
            type="text"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="سبب الإلغاء (اختياري)..."
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-brand-600 focus:outline-none"
          />
        </DialogConfirm>
      </AppLayout>
    </AuthGuard>
  );
}
