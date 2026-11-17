'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  Eye,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DialogConfirm from '@/components/ui/DialogConfirm';
import EmptyState from '@/components/ui/EmptyState';
import ErrorHandler from '@/components/ui/ErrorHandler';
import ModalShell from '@/components/ui/ModalShell';
import PageHeader from '@/components/ui/PageHeader';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';
import StatusBadge from '@/components/ui/StatusBadge';
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
  templateService,
} from '@/core/api/services';
import AuthGuard from '@/core/auth/AuthGuard';
import { RoleGuard } from '@/core/auth/RoleGuard';
import {
  formatPriceSyp,
  formatRecurrenceAr,
  getDamascusDateYmd,
} from '@/core/utils/formatters';
import {
  BusDto,
  BusTypeDto,
  CityDto,
  RecurrenceType,
  TemplatePreviewResponse,
  TripTemplateDto,
} from '@/types/api.types';

const DAYS_AR = [
  { value: 0, label: 'الأحد' },
  { value: 1, label: 'الإثنين' },
  { value: 2, label: 'الثلاثاء' },
  { value: 3, label: 'الأربعاء' },
  { value: 4, label: 'الخميس' },
  { value: 5, label: 'الجمعة' },
  { value: 6, label: 'السبت' },
];

interface TemplateFormState {
  originId: string;
  destinationId: string;
  busTypeId: string;
  busId: string;
  price: string;
  departureTime: string;
  recurrence: RecurrenceType;
  daysOfWeek: number[];
  dayOfMonth: string;
  startDate: string;
  endDate: string;
  generateAheadDays: string;
}

export default function ScheduledTripsPage() {
  const { showToast } = useToast();

  const [templates, setTemplates] = useState<TripTemplateDto[]>([]);
  const [cities, setCities] = useState<CityDto[]>([]);
  const [busTypes, setBusTypes] = useState<BusTypeDto[]>([]);
  const [buses, setBuses] = useState<BusDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [generatingAll, setGeneratingAll] = useState(false);

  // Create / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TripTemplateDto | null>(null);
  const [form, setForm] = useState<TemplateFormState>({
    originId: '',
    destinationId: '',
    busTypeId: '',
    busId: '',
    price: '45000',
    departureTime: '08:00',
    recurrence: 'DAILY',
    daysOfWeek: [0, 2, 4],
    dayOfMonth: '1',
    startDate: getDamascusDateYmd(),
    endDate: '',
    generateAheadDays: '14',
  });
  const [previewData, setPreviewData] = useState<TemplatePreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  // Exclusions modal
  const [exclusionTarget, setExclusionTarget] = useState<TripTemplateDto | null>(null);
  const [exclusionDate, setExclusionDate] = useState(getDamascusDateYmd());
  const [exclusionReason, setExclusionReason] = useState('');
  const [savingExclusion, setSavingExclusion] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<TripTemplateDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tpls, cityList, btList, busList] = await Promise.all([
        templateService.getAll(),
        cityService.getAll(false),
        busTypeService.getAll(false),
        busService.getAll({ includeInactive: false }),
      ]);
      setTemplates(tpls);
      setCities(cityList);
      setBusTypes(btList);
      setBuses(busList);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const matchingBuses = useMemo(() => {
    const btId = Number(form.busTypeId);
    if (!btId) return [];
    return buses.filter((b) => b.isActive && b.busTypeId === btId);
  }, [buses, form.busTypeId]);

  function openCreateModal() {
    setEditing(null);
    setPreviewData(null);
    setForm({
      originId: cities[0]?.id ? String(cities[0].id) : '',
      destinationId: cities[1]?.id ? String(cities[1].id) : '',
      busTypeId: busTypes[0]?.id ? String(busTypes[0].id) : '',
      busId: '',
      price: '45000',
      departureTime: '08:00',
      recurrence: 'DAILY',
      daysOfWeek: [0, 3, 5],
      dayOfMonth: '1',
      startDate: getDamascusDateYmd(),
      endDate: '',
      generateAheadDays: '14',
    });
    setModalOpen(true);
  }

  function openEditModal(tpl: TripTemplateDto) {
    setEditing(tpl);
    setPreviewData(null);
    setForm({
      originId: String(tpl.origin.id),
      destinationId: String(tpl.destination.id),
      busTypeId: String(tpl.busType.id),
      busId: tpl.bus?.id ? String(tpl.bus.id) : '',
      price: String(tpl.price),
      departureTime: tpl.departureTime,
      recurrence: tpl.recurrence,
      daysOfWeek: tpl.daysOfWeek ?? [],
      dayOfMonth: String(tpl.dayOfMonth ?? 1),
      startDate: tpl.startDate.slice(0, 10),
      endDate: tpl.endDate ? tpl.endDate.slice(0, 10) : '',
      generateAheadDays: String(tpl.generateAheadDays),
    });
    setModalOpen(true);
  }

  function toggleWeekday(day: number) {
    setForm((prev) => {
      const exists = prev.daysOfWeek.includes(day);
      return {
        ...prev,
        daysOfWeek: exists
          ? prev.daysOfWeek.filter((d) => d !== day)
          : [...prev.daysOfWeek, day],
      };
    });
  }

  async function handlePreview() {
    if (!form.originId || !form.destinationId || !form.busTypeId) {
      showToast('اختر المدن ونوع الباص أولاً للمعاينة.', 'error');
      return;
    }
    if (form.originId === form.destinationId) {
      showToast('مدينة الانطلاق يجب أن تختلف عن الوجهة.', 'error');
      return;
    }
    setLoadingPreview(true);
    try {
      const res = await templateService.preview({
        originId: Number(form.originId),
        destinationId: Number(form.destinationId),
        busTypeId: Number(form.busTypeId),
        busId: form.busId ? Number(form.busId) : undefined,
        price: Number(form.price) || 45000,
        departureTime: form.departureTime,
        recurrence: form.recurrence,
        daysOfWeek: form.recurrence === 'WEEKLY' ? form.daysOfWeek : undefined,
        dayOfMonth:
          form.recurrence === 'MONTHLY' ? Number(form.dayOfMonth) || 1 : undefined,
        startDate: form.startDate,
        endDate: form.endDate ? form.endDate : null,
        generateAheadDays: Number(form.generateAheadDays) || 14,
      });
      setPreviewData(res);
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر معاينة مواعيد القالب.',
        'error',
      );
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleSaveTemplate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.originId || !form.destinationId || !form.busTypeId) {
      showToast('يرجى تحديد المدن ونوع الباص.', 'error');
      return;
    }
    if (form.originId === form.destinationId) {
      showToast('مدينة الانطلاق يجب أن تختلف عن الوجهة.', 'error');
      return;
    }
    if (form.recurrence === 'WEEKLY' && form.daysOfWeek.length === 0) {
      showToast('اختر يوماً واحداً على الأقل للتكرار الأسبوعي.', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await templateService.update(editing.id, {
          price: Number(form.price),
          departureTime: form.departureTime,
          recurrence: form.recurrence,
          daysOfWeek: form.recurrence === 'WEEKLY' ? form.daysOfWeek : undefined,
          dayOfMonth:
            form.recurrence === 'MONTHLY' ? Number(form.dayOfMonth) : undefined,
          endDate: form.endDate ? form.endDate : null,
          busId: form.busId ? Number(form.busId) : undefined,
        });
        showToast('تم تحديث القالب الجدولي بنجاح.');
      } else {
        await templateService.create({
          originId: Number(form.originId),
          destinationId: Number(form.destinationId),
          busTypeId: Number(form.busTypeId),
          busId: form.busId ? Number(form.busId) : undefined,
          price: Number(form.price),
          departureTime: form.departureTime,
          recurrence: form.recurrence,
          daysOfWeek: form.recurrence === 'WEEKLY' ? form.daysOfWeek : undefined,
          dayOfMonth:
            form.recurrence === 'MONTHLY' ? Number(form.dayOfMonth) : undefined,
          startDate: form.startDate,
          endDate: form.endDate ? form.endDate : null,
          generateAheadDays: Number(form.generateAheadDays) || 14,
        });
        showToast('تم إنشاء القالب الجدولي وتوليد مواعيده القادمة.');
      }
      setModalOpen(false);
      await loadAll();
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر حفظ القالب.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(tpl: TripTemplateDto) {
    try {
      await templateService.toggle(tpl.id);
      showToast(tpl.isActive ? 'تم إيقاف القالب مؤقتاً.' : 'تم تفعيل القالب.');
      await loadAll();
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر تغيير حالة القالب.',
        'error',
      );
    }
  }

  async function handleGenerateAll() {
    setGeneratingAll(true);
    try {
      const res = await templateService.generateAll();
      showToast(
        `تم فحص ${res.processedTemplates} قالب وتوليد ${res.createdTrips} رحلة جديدة.`,
      );
      await loadAll();
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر توليد الرحلات الآن.',
        'error',
      );
    } finally {
      setGeneratingAll(false);
    }
  }

  async function handleAddExclusion(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!exclusionTarget || !exclusionDate) return;
    setSavingExclusion(true);
    try {
      await templateService.addExclusion(
        exclusionTarget.id,
        exclusionDate,
        exclusionReason.trim() || undefined,
      );
      showToast('تمت إضافة تاريخ العطلة/الاستثناء.');
      setExclusionReason('');
      await loadAll();
      const refreshed = await templateService.getAll();
      const updatedTarget = refreshed.find((t) => t.id === exclusionTarget.id) ?? null;
      setExclusionTarget(updatedTarget);
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر إضافة الاستثناء.',
        'error',
      );
    } finally {
      setSavingExclusion(false);
    }
  }

  async function handleRemoveExclusion(templateId: number, exclusionId: number) {
    try {
      await templateService.removeExclusion(templateId, exclusionId);
      showToast('تم حذف الاستثناء بنجاح.');
      const refreshed = await templateService.getAll();
      setTemplates(refreshed);
      setExclusionTarget(refreshed.find((t) => t.id === templateId) ?? null);
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر حذف الاستثناء.',
        'error',
      );
    }
  }

  async function handleDeleteTemplate() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await templateService.remove(deleteTarget.id);
      showToast('تم حذف القالب والرحلات المستقبلية غير المحجوزة المرتبطة به.');
      setDeleteTarget(null);
      await loadAll();
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر حذف القالب.',
        'error',
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AuthGuard>
      <AppLayout>
        <RoleGuard allowedRoles={['ADMIN']}>
          <div className="space-y-6">
            <PageHeader
              title="الرحلات المجدولة والقوالب الدورية"
              subtitle="إنشاء جداول يومية وأسبوعية وشهرية، معاينة المواعيد، وإدارة العطل والاستثناءات"
              actionLabel="إنشاء قالب مجدول"
              onAction={openCreateModal}
              extraActions={
                <Button
                  variant="outline"
                  loading={generatingAll}
                  onClick={() => void handleGenerateAll()}
                >
                  <RefreshCw className="h-4 w-4" />
                  توليد الرحلات الآن
                </Button>
              }
            />

            {error ? <ErrorHandler error={error} onRetry={() => void loadAll()} /> : null}
            {loading ? <TableSkeleton rows={5} /> : null}

            {!loading && !error && templates.length === 0 ? (
              <EmptyState
                title="لا توجد قوالب مجدولة بعد"
                subtitle="أنشئ قالباً دورياً لتوليد الرحلات تلقائياً لخطوط النقل الثابتة."
                actionLabel="إنشاء قالب جديد"
                onAction={openCreateModal}
              />
            ) : null}

            {!loading && !error && templates.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المسار</TableHead>
                    <TableHead>النمط والتكرار</TableHead>
                    <TableHead>وقت الانطلاق</TableHead>
                    <TableHead>الباص والسعر</TableHead>
                    <TableHead>الرحلات القادمة</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((tpl) => (
                    <TableRow key={tpl.id}>
                      <TableCell className="font-extrabold text-fg">
                        {tpl.origin.nameAr} ← {tpl.destination.nameAr}
                      </TableCell>
                      <TableCell>
                        <div className="font-bold text-fg">
                          {formatRecurrenceAr(
                            tpl.recurrence,
                            tpl.daysOfWeek,
                            tpl.dayOfMonth,
                          )}
                        </div>
                        <div className="text-xs text-fg-subtle tabular-nums">
                          أفق التوليد: {tpl.generateAheadDays} يوم · استثناءات:{' '}
                          {tpl.exclusions.length}
                        </div>
                      </TableCell>
                      <TableCell className="font-bold text-fg tabular-nums">
                        {tpl.departureTime}
                      </TableCell>
                      <TableCell>
                        <div className="font-bold text-fg">{tpl.busType.nameAr}</div>
                        <div className="text-xs font-extrabold text-brand-600 tabular-nums">
                          {formatPriceSyp(tpl.price)}
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums font-bold text-fg">
                        {tpl.upcomingTripsCount}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={tpl.isActive ? 'success' : 'neutral'}
                          label={tpl.isActive ? 'مفعّل' : 'متوقف مؤقتاً'}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleToggleActive(tpl)}
                            title={tpl.isActive ? 'إيقاف مؤقت' : 'تفعيل'}
                          >
                            {tpl.isActive ? (
                              <PauseCircle className="h-3.5 w-3.5" />
                            ) : (
                              <PlayCircle className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setExclusionTarget(tpl)}
                          >
                            العطل ({tpl.exclusions.length})
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openEditModal(tpl)}
                          >
                            تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setDeleteTarget(tpl)}
                            aria-label={`حذف القالب ${tpl.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </div>

          {/* Create / Edit Modal */}
          <ModalShell
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            title={
              <span className="inline-flex items-center gap-2">
                <CalendarPlus className="h-5 w-5 text-brand-600" />
                {editing ? `تعديل القالب #${editing.id}` : 'إنشاء قالب رحلات مجدولة'}
              </span>
            }
            maxWidthClass="max-w-2xl"
          >
            <form onSubmit={handleSaveTemplate} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-fg mb-1">
                        مدينة الانطلاق
                      </label>
                      <select
                        disabled={Boolean(editing)}
                        value={form.originId}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, originId: e.target.value }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg disabled:opacity-60"
                      >
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
                        disabled={Boolean(editing)}
                        value={form.destinationId}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, destinationId: e.target.value }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg disabled:opacity-60"
                      >
                        {cities.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nameAr}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-fg mb-1">
                        نوع الباص
                      </label>
                      <select
                        disabled={Boolean(editing)}
                        value={form.busTypeId}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, busTypeId: e.target.value, busId: '' }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg disabled:opacity-60"
                      >
                        {busTypes.map((bt) => (
                          <option key={bt.id} value={bt.id}>
                            {bt.nameAr} ({bt.layout})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-fg mb-1">
                        لوحة الباص (اختياري)
                      </label>
                      <select
                        value={form.busId}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, busId: e.target.value }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                      >
                        <option value="">بدون تخصيص</option>
                        {matchingBuses.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.plateNumber}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-fg mb-1">
                        وقت الانطلاق (24 ساعة)
                      </label>
                      <input
                        type="time"
                        value={form.departureTime}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, departureTime: e.target.value }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                        required
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
                        onChange={(e) =>
                          setForm((f) => ({ ...f, price: e.target.value }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg tabular-nums"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-fg mb-1">
                        نمط التكرار
                      </label>
                      <select
                        value={form.recurrence}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            recurrence: e.target.value as RecurrenceType,
                          }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                      >
                        <option value="DAILY">يومي</option>
                        <option value="WEEKLY">أسبوعي</option>
                        <option value="MONTHLY">شهري</option>
                      </select>
                    </div>

                    {form.recurrence === 'MONTHLY' ? (
                      <div>
                        <label className="block text-xs font-bold text-fg mb-1">
                          اليوم من كل شهر (1-28)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={28}
                          value={form.dayOfMonth}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, dayOfMonth: e.target.value }))
                          }
                          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg tabular-nums"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-bold text-fg mb-1">
                          عدد الأيام المستقبلية للتوليد
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={90}
                          disabled={Boolean(editing)}
                          value={form.generateAheadDays}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, generateAheadDays: e.target.value }))
                          }
                          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg tabular-nums disabled:opacity-60"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-fg mb-1">
                        تاريخ البدء
                      </label>
                      <input
                        type="date"
                        disabled={Boolean(editing)}
                        value={form.startDate}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, startDate: e.target.value }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-fg mb-1">
                        تاريخ الانتهاء (اختياري)
                      </label>
                      <input
                        type="date"
                        value={form.endDate}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, endDate: e.target.value }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                      />
                    </div>
                  </div>

                  {form.recurrence === 'WEEKLY' ? (
                    <div>
                      <label className="block text-xs font-bold text-fg mb-2">
                        أيام الأسبوع المعتمدة
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {DAYS_AR.map((day) => {
                          const active = form.daysOfWeek.includes(day.value);
                          return (
                            <button
                              key={day.value}
                              type="button"
                              onClick={() => toggleWeekday(day.value)}
                              className={`rounded-xl px-3 py-1.5 text-xs font-bold border cursor-pointer ${
                                active
                                  ? 'border-brand-600 bg-brand-600 text-white'
                                  : 'border-line bg-surface text-fg-muted'
                              }`}
                            >
                              {day.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {previewData ? (
                    <Card className="p-4 bg-surface-muted space-y-2">
                      <div className="flex items-center justify-between text-xs font-extrabold text-fg">
                        <span>المعاينة المباشرة للمواعيد المتوقعة</span>
                        <span className="text-brand-600 tabular-nums">
                          {previewData.count} رحلة سيتم توليدها
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                        {previewData.items.slice(0, 12).map((item) => (
                          <span
                            key={item.date}
                            className="rounded-lg bg-surface border border-line px-2 py-1 text-[11px] font-bold text-fg tabular-nums"
                          >
                            {item.dayNameAr} {item.date} ({item.time})
                          </span>
                        ))}
                      </div>
                    </Card>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-line">
                    <Button
                      type="button"
                      variant="outline"
                      loading={loadingPreview}
                      onClick={() => void handlePreview()}
                    >
                      <Eye className="h-4 w-4" />
                      معاينة المواعيد قبل الحفظ
                    </Button>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => setModalOpen(false)}>
                        إلغاء
                      </Button>
                      <Button type="submit" loading={saving}>
                        {editing ? 'حفظ التعديلات' : 'إنشاء وتوليد القالب'}
                      </Button>
                    </div>
                  </div>
                </form>
          </ModalShell>

          {/* Exclusions Modal */}
          <ModalShell
            isOpen={Boolean(exclusionTarget)}
            onClose={() => setExclusionTarget(null)}
            title={
              exclusionTarget
                ? `العطل والاستثناءات — ${exclusionTarget.origin.nameAr} ← ${exclusionTarget.destination.nameAr}`
                : 'العطل والاستثناءات'
            }
            maxWidthClass="max-w-lg"
          >
            {exclusionTarget ? (
              <div className="space-y-4">
                <form onSubmit={handleAddExclusion} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="date"
                    value={exclusionDate}
                    onChange={(e) => setExclusionDate(e.target.value)}
                    className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                    required
                  />
                  <input
                    type="text"
                    value={exclusionReason}
                    onChange={(e) => setExclusionReason(e.target.value)}
                    placeholder="سبب العطلة..."
                    className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                  />
                  <Button type="submit" size="sm" loading={savingExclusion}>
                    إضافة استثناء
                  </Button>
                </form>

                <div className="space-y-2">
                  {exclusionTarget.exclusions.length === 0 ? (
                    <p className="text-sm text-fg-muted text-center py-4">
                      لا توجد تواريخ مستثناة لهذا القالب.
                    </p>
                  ) : (
                    exclusionTarget.exclusions.map((ex) => (
                      <div
                        key={ex.id}
                        className="flex items-center justify-between rounded-xl border border-line bg-surface-muted px-3 py-2 text-sm"
                      >
                        <div>
                          <span className="font-bold text-fg tabular-nums">
                            {ex.excludedDate.slice(0, 10)}
                          </span>
                          {ex.reason ? (
                            <span className="text-xs text-fg-muted mr-2">
                              ({ex.reason})
                            </span>
                          ) : null}
                        </div>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() =>
                            void handleRemoveExclusion(exclusionTarget.id, ex.id)
                          }
                        >
                          حذف
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </ModalShell>

          <DialogConfirm
            isOpen={Boolean(deleteTarget)}
            variant="danger"
            title="حذف القالب الجدولي"
            message="سيؤدي حذف القالب إلى حذف الرحلات المستقبلية غير المحجوزة المولدة منه مع الإبقاء على أي رحلات تحتوي حجوزات."
            confirmText="تأكيد الحذف"
            loading={deleting}
            onConfirm={() => void handleDeleteTemplate()}
            onClose={() => setDeleteTarget(null)}
          />
        </RoleGuard>
      </AppLayout>
    </AuthGuard>
  );
}
