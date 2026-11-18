'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { KeyRound, LogOut, Mail, Phone, Shield, UserCheck } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/ToastProvider';
import { WebApiError } from '@/core/api/client';
import { profileService } from '@/core/api/services';
import AuthGuard from '@/core/auth/AuthGuard';
import { useAuth } from '@/core/auth/AuthContext';
import { ArWeb } from '@/i18n/ar';

export default function ProfilePage() {
  const { user, refreshProfile, logout } = useAuth();
  const { showToast } = useToast();

  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.name) {
      setName(user.name);
    }
  }, [user?.name]);

  async function handleSaveName(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      showToast('يجب إدخال اسم لا يقل عن حرفين.', 'error');
      return;
    }

    setSaving(true);
    try {
      await profileService.updateName(trimmed);
      await refreshProfile();
      showToast('تم تحديث الاسم الشخصي بنجاح.');
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر تحديث الملف الشخصي.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthGuard>
      <AppLayout>
        <div className="max-w-3xl mx-auto space-y-6">
          <PageHeader
            title="الملف الشخصي وإعدادات الحساب"
            subtitle="معلومات الموظف والصلاحيات وإدارة كلمة المرور"
          />

          <Card className="p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white text-xl font-extrabold">
                  {user?.name?.charAt(0) ?? 'م'}
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-fg">{user?.name}</h2>
                  <p className="text-sm text-fg-muted">
                    {user?.username ? `@${user.username}` : 'حساب نظام BusWay'}
                  </p>
                </div>
              </div>
              {user ? (
                <StatusBadge
                  status={user.role === 'ADMIN' ? 'info' : 'success'}
                  label={ArWeb.roles[user.role]}
                />
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-3 rounded-xl bg-surface-muted p-4 border border-line">
                <Phone className="h-4 w-4 text-brand-600 shrink-0" />
                <div>
                  <span className="text-xs text-fg-muted block">رقم الهاتف</span>
                  <span className="font-bold text-fg tabular-nums" dir="ltr">
                    {user?.phone ?? 'غير متوفر'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl bg-surface-muted p-4 border border-line">
                <Mail className="h-4 w-4 text-brand-600 shrink-0" />
                <div>
                  <span className="text-xs text-fg-muted block">البريد الإلكتروني</span>
                  <span className="font-bold text-fg">
                    {user?.email ?? 'غير مسجل'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl bg-surface-muted p-4 border border-line">
                <Shield className="h-4 w-4 text-brand-600 shrink-0" />
                <div>
                  <span className="text-xs text-fg-muted block">مستوى الصلاحية</span>
                  <span className="font-bold text-fg">
                    {user ? ArWeb.roles[user.role] : '-'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl bg-surface-muted p-4 border border-line">
                <UserCheck className="h-4 w-4 text-brand-600 shrink-0" />
                <div>
                  <span className="text-xs text-fg-muted block">حالة الحساب</span>
                  <span className="font-bold text-emerald-600">نشط</span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveName} className="space-y-4 border-t border-line pt-5">
              <div className="space-y-1.5">
                <label htmlFor="profile-name" className="block text-sm font-bold text-fg">
                  الاسم الكامل
                </label>
                <input
                  id="profile-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full max-w-md rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-fg focus:border-brand-600 focus:outline-none"
                  required
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" loading={saving}>
                  حفظ التغييرات
                </Button>
                <Link
                  href="/change-password"
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-bold text-fg hover:bg-surface-muted min-h-[42px]"
                >
                  <KeyRound className="h-4 w-4" />
                  تغيير كلمة المرور
                </Link>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => void logout()}
                >
                  <LogOut className="h-4 w-4" />
                  {ArWeb.nav.logout}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </AppLayout>
    </AuthGuard>
  );
}
