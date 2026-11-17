'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bus, Edit3, Eye, Trash2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DialogConfirm from '@/components/ui/DialogConfirm';
import EmptyState from '@/components/ui/EmptyState';
import ErrorHandler from '@/components/ui/ErrorHandler';
import ModalShell from '@/components/ui/ModalShell';
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
import { useToast } from '@/components/ui/ToastProvider';
import { WebApiError } from '@/core/api/client';
import { busService, busTypeService } from '@/core/api/services';
import AuthGuard from '@/core/auth/AuthGuard';
import { RoleGuard } from '@/core/auth/RoleGuard';
import { formatBusCategoryAr } from '@/core/utils/formatters';
import { generateSeatPreviewTemplates } from '@/core/utils/seatLayout';
import {
  BusCategory,
  BusDto,
  BusSize,
  BusTypeDto,
  BusTypeLayoutResponse,
  SeatDto,
} from '@/types/api.types';

export default function FleetPage() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'bus-types' | 'buses'>('bus-types');
  const [busTypes, setBusTypes] = useState<BusTypeDto[]>([]);
  const [buses, setBuses] = useState<BusDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Bus type layout viewer modal
  const [layoutPreview, setLayoutPreview] = useState<BusTypeLayoutResponse | null>(null);

  // Create / Edit BusType modal
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<BusTypeDto | null>(null);
  const [typeForm, setTypeForm] = useState({
    code: '',
    nameAr: '',
    nameEn: '',
    category: 'STANDARD' as BusCategory,
    size: 'LARGE' as BusSize,
    layout: '2+2',
    rowsCount: '11',
    hasExtraBackSeat: true,
    isActive: true,
  });
  const [savingType, setSavingType] = useState(false);

  // Create / Edit Bus modal
  const [busModalOpen, setBusModalOpen] = useState(false);
  const [editingBus, setEditingBus] = useState<BusDto | null>(null);
  const [busForm, setBusForm] = useState({
    plateNumber: '',
    busTypeId: '',
    isActive: true,
  });
  const [savingBus, setSavingBus] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: 'busType'; item: BusTypeDto } | { kind: 'bus'; item: BusDto } | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const loadFleet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [btList, busList] = await Promise.all([
        busTypeService.getAll(true),
        busService.getAll({ includeInactive: true }),
      ]);
      setBusTypes(btList);
      setBuses(busList);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFleet();
  }, [loadFleet]);

  const liveCreatePreviewSeats: SeatDto[] = useMemo(() => {
    const rowsNum = Number.parseInt(typeForm.rowsCount, 10) || 1;
    return generateSeatPreviewTemplates({
      category: typeForm.category,
      layout: typeForm.layout,
      rowsCount: rowsNum,
      hasExtraBackSeat: typeForm.hasExtraBackSeat && typeForm.category === 'STANDARD',
    }).map((tpl) => ({
      ...tpl,
      status: 'AVAILABLE',
    }));
  }, [typeForm.category, typeForm.layout, typeForm.rowsCount, typeForm.hasExtraBackSeat]);

  async function handleInspectLayout(bt: BusTypeDto) {
    try {
      const layoutData = await busTypeService.getLayout(bt.id);
      setLayoutPreview(layoutData);
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر تحميل مخطط الباص.',
        'error',
      );
    }
  }

  function openCreateBusType() {
    setEditingType(null);
    setTypeForm({
      code: '',
      nameAr: '',
      nameEn: '',
      category: 'STANDARD',
      size: 'LARGE',
      layout: '2+2',
      rowsCount: '11',
      hasExtraBackSeat: true,
      isActive: true,
    });
    setTypeModalOpen(true);
  }

  function openEditBusType(bt: BusTypeDto) {
    setEditingType(bt);
    setTypeForm({
      code: bt.code,
      nameAr: bt.nameAr,
      nameEn: bt.nameEn ?? '',
      category: bt.category,
      size: bt.size,
      layout: bt.layout,
      rowsCount: String(bt.rowsCount),
      hasExtraBackSeat: bt.hasExtraBackSeat,
      isActive: bt.isActive,
    });
    setTypeModalOpen(true);
  }

  async function handleSaveBusType(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingType(true);
    try {
      if (editingType) {
        await busTypeService.update(editingType.id, {
          nameAr: typeForm.nameAr.trim(),
          nameEn: typeForm.nameEn.trim() || undefined,
          isActive: typeForm.isActive,
        });
        showToast('تم تحديث نوع الباص بنجاح.');
      } else {
        await busTypeService.create({
          code: typeForm.code.trim().toUpperCase(),
          nameAr: typeForm.nameAr.trim(),
          nameEn: typeForm.nameEn.trim() || undefined,
          category: typeForm.category,
          size: typeForm.size,
          layout: typeForm.layout.trim(),
          rowsCount: Number(typeForm.rowsCount),
          hasExtraBackSeat:
            typeForm.category === 'STANDARD' ? typeForm.hasExtraBackSeat : false,
          totalSeats: liveCreatePreviewSeats.length,
        });
        showToast('تم إنشاء نوع الباص ومخططه الهندسي بنجاح.');
      }
      setTypeModalOpen(false);
      await loadFleet();
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر حفظ نوع الباص.',
        'error',
      );
    } finally {
      setSavingType(false);
    }
  }

  function openCreateBus() {
    setEditingBus(null);
    setBusForm({
      plateNumber: '',
      busTypeId: busTypes[0]?.id ? String(busTypes[0].id) : '',
      isActive: true,
    });
    setBusModalOpen(true);
  }

  function openEditBus(bus: BusDto) {
    setEditingBus(bus);
    setBusForm({
      plateNumber: bus.plateNumber,
      busTypeId: String(bus.busTypeId),
      isActive: bus.isActive,
    });
    setBusModalOpen(true);
  }

  async function handleSaveBus(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!busForm.plateNumber.trim() || !busForm.busTypeId) {
      showToast('أدخل رقم اللوحة واختر نوع الباص.', 'error');
      return;
    }
    setSavingBus(true);
    try {
      if (editingBus) {
        await busService.update(editingBus.id, {
          plateNumber: busForm.plateNumber.trim(),
          busTypeId: Number(busForm.busTypeId),
          isActive: busForm.isActive,
        });
        showToast('تم تحديث بيانات الباص بنجاح.');
      } else {
        await busService.create({
          plateNumber: busForm.plateNumber.trim(),
          busTypeId: Number(busForm.busTypeId),
          isActive: busForm.isActive,
        });
        showToast('تم تسجيل الباص الجديد في الأسطول بنجاح.');
      }
      setBusModalOpen(false);
      await loadFleet();
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر حفظ بيانات الباص.',
        'error',
      );
    } finally {
      setSavingBus(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === 'busType') {
        await busTypeService.remove(deleteTarget.item.id);
        showToast('تم حذف نوع الباص بنجاح.');
      } else {
        await busService.remove(deleteTarget.item.id);
        showToast('تم حذف المركبة بنجاح.');
      }
      setDeleteTarget(null);
      await loadFleet();
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر الحذف.',
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
              title="الأسطول والمخططات الهندسية"
              subtitle="إدارة أنواع الباصات الستة (عادي، درجة أولى، رجال أعمال) وتكوين مخططات المقاعد والمركبات"
              actionLabel={
                activeTab === 'bus-types' ? 'إضافة نوع باص' : 'تسجيل مركبة جديدة'
              }
              onAction={activeTab === 'bus-types' ? openCreateBusType : openCreateBus}
            />

            <TabComponent
              activeTab={activeTab}
              onChange={(tab) => setActiveTab(tab as 'bus-types' | 'buses')}
              tabs={[
                { id: 'bus-types', label: 'أنواع الباصات والمخططات', count: busTypes.length },
                { id: 'buses', label: 'المركبات الفعلية (اللوحات)', count: buses.length },
              ]}
            />

            {error ? <ErrorHandler error={error} onRetry={() => void loadFleet()} /> : null}
            {loading ? <TableSkeleton rows={5} /> : null}

            {!loading && !error && activeTab === 'bus-types' ? (
              busTypes.length === 0 ? (
                <EmptyState title="لا توجد أنواع باصات معرفة" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {busTypes.map((bt) => (
                    <Card key={bt.id} className="p-5 flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-base font-extrabold text-fg">{bt.nameAr}</h3>
                            <p className="text-xs text-fg-muted">{bt.code}</p>
                          </div>
                          <StatusBadge
                            status={bt.isActive ? 'success' : 'neutral'}
                            label={bt.isActive ? 'نشط' : 'معطل'}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs pt-2">
                          <div className="rounded-xl bg-surface-muted p-2.5">
                            <span className="text-fg-muted block">الفئة</span>
                            <span className="font-bold text-fg">
                              {formatBusCategoryAr(bt.category)}
                            </span>
                          </div>
                          <div className="rounded-xl bg-surface-muted p-2.5">
                            <span className="text-fg-muted block">المخطط</span>
                            <span className="font-extrabold text-brand-600 tabular-nums">
                              {bt.layout} ({bt.rowsCount} صف)
                            </span>
                          </div>
                          <div className="rounded-xl bg-surface-muted p-2.5">
                            <span className="text-fg-muted block">إجمالي المقاعد</span>
                            <span className="font-extrabold text-fg tabular-nums">
                              {bt.totalSeats} مقعد
                            </span>
                          </div>
                          <div className="rounded-xl bg-surface-muted p-2.5">
                            <span className="text-fg-muted block">مقعد إضافي خلفي</span>
                            <span className="font-bold text-fg">
                              {bt.hasExtraBackSeat ? 'نعم (E)' : 'لا'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-line">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleInspectLayout(bt)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          معاينة المخطط
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openEditBusType(bt)}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setDeleteTarget({ kind: 'busType', item: bt })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )
            ) : null}

            {!loading && !error && activeTab === 'buses' ? (
              buses.length === 0 ? (
                <EmptyState
                  title="لا توجد مركبات مسجلة"
                  actionLabel="تسجيل مركبة"
                  onAction={openCreateBus}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>رقم اللوحة</TableHead>
                      <TableHead>نوع الباص</TableHead>
                      <TableHead>المخطط والسعة</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {buses.map((bus) => (
                      <TableRow key={bus.id}>
                        <TableCell className="font-extrabold text-fg flex items-center gap-2">
                          <Bus className="h-4 w-4 text-brand-600" />
                          {bus.plateNumber}
                        </TableCell>
                        <TableCell className="font-bold text-fg">
                          {bus.busType.nameAr}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {bus.busType.layout} · {bus.busType.totalSeats} مقعد
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={bus.isActive ? 'success' : 'neutral'}
                            label={bus.isActive ? 'نشط' : 'خارج الخدمة'}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditBus(bus)}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => setDeleteTarget({ kind: 'bus', item: bus })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : null}
          </div>

          {/* BusType Layout Inspector Modal */}
          <ModalShell
            isOpen={Boolean(layoutPreview)}
            onClose={() => setLayoutPreview(null)}
            title={
              layoutPreview
                ? `مخطط المقاعد — ${layoutPreview.busType.nameAr}`
                : 'مخطط المقاعد'
            }
            maxWidthClass="max-w-2xl"
          >
            {layoutPreview ? (
              <SeatMapBoard
                seats={layoutPreview.seats.map((s) => ({ ...s, status: 'AVAILABLE' }))}
                busTypeName={layoutPreview.busType.nameAr}
                layout={layoutPreview.busType.layout}
                disabled
              />
            ) : null}
          </ModalShell>

          {/* Create / Edit BusType Modal with Live Preview */}
          <ModalShell
            isOpen={typeModalOpen}
            onClose={() => setTypeModalOpen(false)}
            title={
              editingType
                ? `تعديل نوع الباص ${editingType.nameAr}`
                : 'إنشاء نوع باص ومخطط مقاعد جديد'
            }
            maxWidthClass="max-w-4xl"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  <form onSubmit={handleSaveBusType} className="space-y-4">
                    {!editingType ? (
                      <div>
                        <label className="block text-xs font-bold text-fg mb-1">
                          الرمز الفريد (Code)
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={typeForm.code}
                          onChange={(e) =>
                            setTypeForm((f) => ({ ...f, code: e.target.value }))
                          }
                          placeholder="VIP_EXTRA_LARGE"
                          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg text-left"
                          required
                        />
                      </div>
                    ) : null}

                    <div>
                      <label className="block text-xs font-bold text-fg mb-1">
                        الاسم بالعربية
                      </label>
                      <input
                        type="text"
                        value={typeForm.nameAr}
                        onChange={(e) =>
                          setTypeForm((f) => ({ ...f, nameAr: e.target.value }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                        required
                      />
                    </div>

                    {!editingType ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-fg mb-1">
                              الفئة
                            </label>
                            <select
                              value={typeForm.category}
                              onChange={(e) =>
                                setTypeForm((f) => ({
                                  ...f,
                                  category: e.target.value as BusCategory,
                                }))
                              }
                              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                            >
                              <option value="STANDARD">عادي</option>
                              <option value="FIRST_CLASS">درجة أولى</option>
                              <option value="BUSINESS">رجال أعمال VIP</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-fg mb-1">
                              الحجم
                            </label>
                            <select
                              value={typeForm.size}
                              onChange={(e) =>
                                setTypeForm((f) => ({
                                  ...f,
                                  size: e.target.value as BusSize,
                                }))
                              }
                              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                            >
                              <option value="LARGE">كبير</option>
                              <option value="MEDIUM">وسط</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-fg mb-1">
                              نمط التوزع
                            </label>
                            <select
                              value={typeForm.layout}
                              onChange={(e) =>
                                setTypeForm((f) => ({ ...f, layout: e.target.value }))
                              }
                              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                            >
                              <option value="2+2">2+2</option>
                              <option value="2+1">2+1</option>
                              <option value="1+1">1+1</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-fg mb-1">
                              عدد الصفوف
                            </label>
                            <input
                              type="number"
                              min={4}
                              max={20}
                              value={typeForm.rowsCount}
                              onChange={(e) =>
                                setTypeForm((f) => ({ ...f, rowsCount: e.target.value }))
                              }
                              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg tabular-nums"
                              required
                            />
                          </div>
                        </div>

                        {typeForm.category === 'STANDARD' ? (
                          <label className="inline-flex items-center gap-2 text-xs font-bold text-fg cursor-pointer">
                            <input
                              type="checkbox"
                              checked={typeForm.hasExtraBackSeat}
                              onChange={(e) =>
                                setTypeForm((f) => ({
                                  ...f,
                                  hasExtraBackSeat: e.target.checked,
                                }))
                              }
                              className="h-4 w-4 accent-brand-600"
                            />
                            إضافة المقعد الخلفي الوسطي (E) في الصف الأخير
                          </label>
                        ) : null}
                      </>
                    ) : (
                      <label className="inline-flex items-center gap-2 text-sm font-bold text-fg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={typeForm.isActive}
                          onChange={(e) =>
                            setTypeForm((f) => ({ ...f, isActive: e.target.checked }))
                          }
                          className="h-4 w-4 accent-brand-600"
                        />
                        نوع الباص مفعّل
                      </label>
                    )}

                    <div className="flex justify-end gap-2 pt-3 border-t border-line">
                      <Button variant="outline" onClick={() => setTypeModalOpen(false)}>
                        إلغاء
                      </Button>
                      <Button type="submit" loading={savingType}>
                        حفظ النوع
                      </Button>
                    </div>
                  </form>

                  <div className="max-h-[440px] overflow-y-auto">
                    <SeatMapBoard
                      seats={liveCreatePreviewSeats}
                      busTypeName={typeForm.nameAr || 'معاينة المخطط'}
                      layout={typeForm.layout}
                      disabled
                    />
                  </div>
                </div>
          </ModalShell>

          {/* Bus Create / Edit Modal */}
          <ModalShell
            isOpen={busModalOpen}
            onClose={() => setBusModalOpen(false)}
            title={editingBus ? 'تعديل بيانات المركبة' : 'تسجيل مركبة جديدة'}
            maxWidthClass="max-w-md"
          >
            <form onSubmit={handleSaveBus} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-fg mb-1">
                  رقم اللوحة
                </label>
                <input
                  type="text"
                  value={busForm.plateNumber}
                  onChange={(e) =>
                    setBusForm((f) => ({ ...f, plateNumber: e.target.value }))
                  }
                  placeholder="دمشق 452180"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-fg mb-1">
                  نوع الباص
                </label>
                <select
                  value={busForm.busTypeId}
                  onChange={(e) =>
                    setBusForm((f) => ({ ...f, busTypeId: e.target.value }))
                  }
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                  required
                >
                  {busTypes.map((bt) => (
                    <option key={bt.id} value={bt.id}>
                      {bt.nameAr} ({bt.layout})
                    </option>
                  ))}
                </select>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-bold text-fg cursor-pointer">
                <input
                  type="checkbox"
                  checked={busForm.isActive}
                  onChange={(e) =>
                    setBusForm((f) => ({ ...f, isActive: e.target.checked }))
                  }
                  className="h-4 w-4 accent-brand-600"
                />
                المركبة بالخدمة
              </label>
              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button variant="outline" onClick={() => setBusModalOpen(false)}>
                  إلغاء
                </Button>
                <Button type="submit" loading={savingBus}>
                  حفظ
                </Button>
              </div>
            </form>
          </ModalShell>

          <DialogConfirm
            isOpen={Boolean(deleteTarget)}
            variant="danger"
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف هذا العنصر؟ لن يتم السماح بالحذف إذا كان مستخدماً في رحلات مسجلة."
            confirmText="تأكيد الحذف"
            loading={deleting}
            onConfirm={() => void handleConfirmDelete()}
            onClose={() => setDeleteTarget(null)}
          />
        </RoleGuard>
      </AppLayout>
    </AuthGuard>
  );
}
