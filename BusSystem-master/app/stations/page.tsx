'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Edit3, MapPin, Trash2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import Button from '@/components/ui/Button';
import DialogConfirm from '@/components/ui/DialogConfirm';
import EmptyState from '@/components/ui/EmptyState';
import ErrorHandler from '@/components/ui/ErrorHandler';
import ModalShell from '@/components/ui/ModalShell';
import PageHeader from '@/components/ui/PageHeader';
import SearchBar from '@/components/ui/SearchBar';
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
import { cityService } from '@/core/api/services';
import AuthGuard from '@/core/auth/AuthGuard';
import { RoleGuard } from '@/core/auth/RoleGuard';
import { CityDto } from '@/types/api.types';

export default function StationsPage() {
  const { showToast } = useToast();

  const [cities, setCities] = useState<CityDto[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CityDto | null>(null);
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CityDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadCities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await cityService.getAll(true);
      setCities(list);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCities();
  }, [loadCities]);

  const filtered = cities.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.nameAr.toLowerCase().includes(q) ||
      (c.nameEn ?? '').toLowerCase().includes(q)
    );
  });

  function openCreate() {
    setEditing(null);
    setNameAr('');
    setNameEn('');
    setIsActive(true);
    setModalOpen(true);
  }

  function openEdit(city: CityDto) {
    setEditing(city);
    setNameAr(city.nameAr);
    setNameEn(city.nameEn ?? '');
    setIsActive(city.isActive);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (nameAr.trim().length < 2) {
      showToast('أدخل اسم المدينة بالعربية.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await cityService.update(editing.id, {
          nameAr: nameAr.trim(),
          nameEn: nameEn.trim() || undefined,
          isActive,
        });
        showToast('تم تحديث بيانات المحطة بنجاح.');
      } else {
        await cityService.create({
          nameAr: nameAr.trim(),
          nameEn: nameEn.trim() || undefined,
          isActive,
        });
        showToast('تمت إضافة المحطة بنجاح.');
      }
      setModalOpen(false);
      await loadCities();
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر حفظ بيانات المدينة.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(city: CityDto) {
    try {
      await cityService.update(city.id, { isActive: !city.isActive });
      showToast(city.isActive ? 'تم تعطيل المدينة بنجاح.' : 'تم تفعيل المدينة بنجاح.');
      await loadCities();
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر تحديث حالة المدينة.',
        'error',
      );
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await cityService.remove(deleteTarget.id);
      showToast('تم حذف المدينة بنجاح.');
      setDeleteTarget(null);
      await loadCities();
    } catch (err) {
      if (err instanceof WebApiError && err.code === 'RESOURCE_IN_USE') {
        await cityService.update(deleteTarget.id, { isActive: false });
        showToast(
          'المدينة مرتبطة برحلات سابقة، لذا تم تعطيلها بدلاً من الحذف للحفاظ على سلامة السجلات.',
          'info',
        );
        setDeleteTarget(null);
        await loadCities();
        return;
      }
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر حذف المدينة.',
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
              title="إدارة المدن والمحطات"
              subtitle="تنظيم نقاط الانطلاق والوصول المعتمدة بين المحافظات"
              actionLabel="إضافة مدينة جديدة"
              onAction={openCreate}
            />

            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="بحث باسم المدينة بالعربية أو الإنجليزية..."
            />

            {error ? <ErrorHandler error={error} onRetry={() => void loadCities()} /> : null}
            {loading ? <TableSkeleton rows={5} /> : null}

            {!loading && !error && filtered.length === 0 ? (
              <EmptyState
                title="لا توجد مدن مطابقة"
                subtitle="أضف مدينة أو محطة جديدة لتمكين إضافتها إلى خطوط الرحلات."
                actionLabel="إضافة مدينة"
                onAction={openCreate}
              />
            ) : null}

            {!loading && !error && filtered.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>الاسم بالعربية</TableHead>
                    <TableHead>الاسم بالإنجليزية</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((city) => (
                    <TableRow key={city.id}>
                      <TableCell className="tabular-nums font-bold text-fg-muted">
                        #{city.id}
                      </TableCell>
                      <TableCell className="font-extrabold text-fg flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-brand-600" />
                        {city.nameAr}
                      </TableCell>
                      <TableCell className="text-fg-muted">
                        {city.nameEn ?? '-'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={city.isActive ? 'success' : 'neutral'}
                          label={city.isActive ? 'مفعّلة' : 'معطلة'}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(city)}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void handleToggleStatus(city)}
                          >
                            {city.isActive ? 'تعطيل' : 'تفعيل'}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setDeleteTarget(city)}
                            aria-label={`حذف ${city.nameAr}`}
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

          <ModalShell
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            title={editing ? `تعديل مدينة ${editing.nameAr}` : 'إضافة مدينة جديدة'}
            maxWidthClass="max-w-md"
          >
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-fg mb-1">
                  الاسم بالعربية
                </label>
                <input
                  type="text"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder="مثال: دمشق"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-fg mb-1">
                  الاسم بالإنجليزية (اختياري)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="Damascus"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg text-left"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-bold text-fg cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 accent-brand-600"
                />
                المدينة متاحة للحجز
              </label>
              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button variant="outline" onClick={() => setModalOpen(false)}>
                  إلغاء
                </Button>
                <Button type="submit" loading={saving}>
                  حفظ
                </Button>
              </div>
            </form>
          </ModalShell>

          <DialogConfirm
            isOpen={Boolean(deleteTarget)}
            variant="danger"
            title={`حذف مدينة ${deleteTarget?.nameAr ?? ''}`}
            message="في حال كانت المدينة مرتبطة برحلات قائمة سيتم تعطيلها تلقائياً للحفاظ على سلامة السجلات التاريخية."
            confirmText="متابعة الحذف"
            loading={deleting}
            onConfirm={() => void handleDelete()}
            onClose={() => setDeleteTarget(null)}
          />
        </RoleGuard>
      </AppLayout>
    </AuthGuard>
  );
}
