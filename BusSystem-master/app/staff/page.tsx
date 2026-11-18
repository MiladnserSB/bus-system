'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Edit3, KeyRound, ShieldAlert, UserCheck, UserX } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
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
import { userService } from '@/core/api/services';
import AuthGuard from '@/core/auth/AuthGuard';
import { RoleGuard } from '@/core/auth/RoleGuard';
import { isValidSyrianPhone, normalizeSyrianPhone } from '@/core/utils/formatters';
import { ArWeb } from '@/i18n/ar';
import { AuthUser, StaffRole } from '@/types/api.types';

export default function StaffManagementPage() {
  const { showToast } = useToast();

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | StaffRole>('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Create / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AuthUser | null>(null);
  const [form, setForm] = useState({
    name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    role: 'RECEPTIONIST' as StaffRole,
  });
  const [saving, setSaving] = useState(false);

  // Reset password modal
  const [resetTarget, setResetTarget] = useState<AuthUser | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  // Status toggle confirmation
  const [statusTarget, setStatusTarget] = useState<AuthUser | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await userService.getAll({
        search: search.trim() || undefined,
        role: roleFilter || undefined,
        isActive:
          activeFilter === '' ? undefined : activeFilter === 'true',
      });
      setUsers(list);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, activeFilter]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  function openCreate() {
    setEditing(null);
    setForm({
      name: '',
      username: '',
      email: '',
      phone: '',
      password: '',
      role: 'RECEPTIONIST',
    });
    setModalOpen(true);
  }

  function openEdit(u: AuthUser) {
    setEditing(u);
    setForm({
      name: u.name,
      username: u.username ?? '',
      email: u.email ?? '',
      phone: u.phone,
      password: '',
      role: u.role === 'ADMIN' ? 'ADMIN' : 'RECEPTIONIST',
    });
    setModalOpen(true);
  }

  async function handleSaveUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (form.name.trim().length < 2 || form.username.trim().length < 3) {
      showToast('أدخل الاسم واسم المستخدم الصحيح.', 'error');
      return;
    }
    if (!isValidSyrianPhone(form.phone)) {
      showToast('أدخل رقم هاتف سوري صالح مثل 09XXXXXXXX.', 'error');
      return;
    }
    const phone = normalizeSyrianPhone(form.phone);
    if (!phone) return;

    if (!editing && form.password.length < 8) {
      showToast('كلمة المرور المؤقتة يجب ألا تقل عن 8 أحرف.', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await userService.update(editing.id, {
          name: form.name.trim(),
          username: form.username.trim(),
          email: form.email.trim() || undefined,
          phone,
          role: form.role,
        });
        showToast('تم تحديث بيانات الموظف بنجاح.');
      } else {
        await userService.create({
          name: form.name.trim(),
          username: form.username.trim(),
          email: form.email.trim() || undefined,
          phone,
          password: form.password,
          role: form.role,
        });
        showToast('تم إنشاء حساب الموظف بنجاح مع فرض تغيير كلمة المرور عند الدخول الأول.');
      }
      setModalOpen(false);
      await loadUsers();
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر حفظ حساب الموظف.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!statusTarget) return;
    setTogglingStatus(true);
    try {
      const nextActive = statusTarget.isActive === false;
      await userService.updateStatus(statusTarget.id, nextActive);
      showToast(
        nextActive
          ? 'تم تفعيل حساب الموظف بنجاح.'
          : 'تم تعطيل حساب الموظف وإلغاء جلساته الفعالة.',
      );
      setStatusTarget(null);
      await loadUsers();
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر تعديل حالة الموظف.',
        'error',
      );
    } finally {
      setTogglingStatus(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resetTarget) return;
    if (tempPassword.length < 8) {
      showToast('كلمة المرور المؤقتة يجب ألا تقل عن 8 أحرف.', 'error');
      return;
    }
    setResetting(true);
    try {
      await userService.resetPassword(resetTarget.id, tempPassword);
      showToast(
        'تم تعيين كلمة مرور مؤقتة وسيُطلب من الموظف تغييرها عند تسجيل الدخول القادم.',
      );
      setResetTarget(null);
      setTempPassword('');
      await loadUsers();
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر إعادة تعيين كلمة المرور.',
        'error',
      );
    } finally {
      setResetting(false);
    }
  }

  return (
    <AuthGuard>
      <AppLayout>
        <RoleGuard allowedRoles={['ADMIN']}>
          <div className="space-y-6">
            <PageHeader
              title="إدارة الموظفين والصلاحيات"
              subtitle="إنشاء حسابات الاستقبال والإدارة، التفعيل والتعطيل الفوري، وإعادة تعيين كلمة المرور المؤقتة"
              actionLabel="إضافة موظف جديد"
              onAction={openCreate}
            />

            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <SearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder="بحث بالاسم أو اسم المستخدم أو الهاتف..."
                  className="max-w-sm"
                />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as '' | StaffRole)}
                  className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                >
                  <option value="">جميع الأدوار</option>
                  <option value="ADMIN">{ArWeb.roles.ADMIN}</option>
                  <option value="RECEPTIONIST">{ArWeb.roles.RECEPTIONIST}</option>
                </select>
                <select
                  value={activeFilter}
                  onChange={(e) =>
                    setActiveFilter(e.target.value as '' | 'true' | 'false')
                  }
                  className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                >
                  <option value="">جميع الحالات</option>
                  <option value="true">نشط فقط</option>
                  <option value="false">معطل فقط</option>
                </select>
              </div>
            </Card>

            {error ? <ErrorHandler error={error} onRetry={() => void loadUsers()} /> : null}
            {loading ? <TableSkeleton rows={5} /> : null}

            {!loading && !error && users.length === 0 ? (
              <EmptyState
                title="لا يوجد موظفون مطابقون"
                actionLabel="إضافة موظف"
                onAction={openCreate}
              />
            ) : null}

            {!loading && !error && users.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم</TableHead>
                    <TableHead>اسم المستخدم</TableHead>
                    <TableHead>الهاتف</TableHead>
                    <TableHead>الدور</TableHead>
                    <TableHead>الحالة الأمنية</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const active = u.isActive !== false;
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-extrabold text-fg">{u.name}</TableCell>
                        <TableCell className="tabular-nums text-fg-muted" dir="ltr">
                          {u.username ? `@${u.username}` : '-'}
                        </TableCell>
                        <TableCell className="tabular-nums" dir="ltr">
                          {u.phone}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={u.role === 'ADMIN' ? 'info' : 'neutral'}
                            label={ArWeb.roles[u.role]}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge
                              status={active ? 'success' : 'danger'}
                              label={active ? 'نشط' : 'معطل'}
                            />
                            {u.mustChangePassword ? (
                              <StatusBadge status="warning" label="كلمة مؤقتة" />
                            ) : null}
                            {u.lockedUntil ? (
                              <StatusBadge status="danger" label="مقفل مؤقتاً" />
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(u)}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setResetTarget(u);
                                setTempPassword('');
                              }}
                              title="إعادة تعيين كلمة المرور المؤقتة"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant={active ? 'danger' : 'secondary'}
                              onClick={() => setStatusTarget(u)}
                              title={active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                            >
                              {active ? (
                                <UserX className="h-3.5 w-3.5" />
                              ) : (
                                <UserCheck className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : null}
          </div>

          {/* Create / Edit Staff Modal */}
          <ModalShell
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            title={editing ? `تعديل حساب ${editing.name}` : 'إضافة موظف جديد'}
            maxWidthClass="max-w-lg"
          >
            <form onSubmit={handleSaveUser} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-fg mb-1">
                        الاسم الكامل
                      </label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, name: e.target.value }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-fg mb-1">
                        اسم المستخدم
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={form.username}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, username: e.target.value }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg text-left"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-fg mb-1">
                        رقم الهاتف السوري
                      </label>
                      <input
                        type="tel"
                        dir="ltr"
                        value={form.phone}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, phone: e.target.value }))
                        }
                        placeholder="09XXXXXXXX"
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg text-left tabular-nums"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-fg mb-1">
                        البريد الإلكتروني (اختياري)
                      </label>
                      <input
                        type="email"
                        dir="ltr"
                        value={form.email}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, email: e.target.value }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg text-left"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-fg mb-1">الدور</label>
                    <select
                      value={form.role}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, role: e.target.value as StaffRole }))
                      }
                      className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                    >
                      <option value="RECEPTIONIST">{ArWeb.roles.RECEPTIONIST}</option>
                      <option value="ADMIN">{ArWeb.roles.ADMIN}</option>
                    </select>
                  </div>

                  {!editing ? (
                    <div>
                      <label className="block text-xs font-bold text-fg mb-1">
                        كلمة المرور المؤقتة (8 أحرف على الأقل)
                      </label>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, password: e.target.value }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                        required
                      />
                      <span className="mt-1 flex items-center gap-1 text-[11px] text-amber-700 font-bold">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        سيُفرض على الموظف تغيير هذه الكلمة عند تسجيل الدخول الأول.
                      </span>
                    </div>
                  ) : null}

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

          {/* Reset Password Modal */}
          <ModalShell
            isOpen={Boolean(resetTarget)}
            onClose={() => setResetTarget(null)}
            title={
              resetTarget
                ? `إعادة تعيين كلمة مرور ${resetTarget.name}`
                : 'إعادة تعيين كلمة المرور'
            }
            maxWidthClass="max-w-md"
          >
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-fg mb-1">
                  كلمة المرور المؤقتة الجديدة
                </label>
                <input
                  type="password"
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  placeholder="8 أحرف على الأقل..."
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setResetTarget(null)}>
                  إلغاء
                </Button>
                <Button type="submit" variant="accent" loading={resetting}>
                  تعيين وإلغاء الجلسات
                </Button>
              </div>
            </form>
          </ModalShell>

          <DialogConfirm
            isOpen={Boolean(statusTarget)}
            variant={statusTarget?.isActive === false ? 'primary' : 'danger'}
            title={
              statusTarget?.isActive === false
                ? `تفعيل حساب ${statusTarget?.name}`
                : `تعطيل حساب ${statusTarget?.name}`
            }
            message={
              statusTarget?.isActive === false
                ? 'سيتمكن الموظف من تسجيل الدخول مجدداً فوراً.'
                : 'سيتم منع الموظف من تسجيل الدخول وإنهاء جميع جلساته الفعالة فوراً.'
            }
            confirmText={statusTarget?.isActive === false ? 'تفعيل الحساب' : 'تعطيل الحساب'}
            loading={togglingStatus}
            onConfirm={() => void handleToggleStatus()}
            onClose={() => setStatusTarget(null)}
          />
        </RoleGuard>
      </AppLayout>
    </AuthGuard>
  );
}
