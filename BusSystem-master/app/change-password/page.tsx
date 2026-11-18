'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { WebApiError } from '@/core/api/client';
import { authService } from '@/core/api/services';
import AuthGuard from '@/core/auth/AuthGuard';
import { useAuth } from '@/core/auth/AuthContext';

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMessage('يرجى تعبئة جميع الحقول المطلوبة.');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMessage('يجب أن تتكون كلمة المرور الجديدة من 8 أحرف على الأقل.');
      return;
    }
    if (newPassword === currentPassword) {
      setErrorMessage('كلمة المرور الجديدة يجب أن تختلف عن الكلمة الحالية.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('تأكيد كلمة المرور لا يطابق كلمة المرور الجديدة.');
      return;
    }

    setSubmitting(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      await refreshProfile();
      showToast('تم تغيير كلمة المرور بنجاح.');
      router.replace('/');
    } catch (err) {
      setErrorMessage(
        err instanceof WebApiError ? err.message : 'تعذر تغيير كلمة المرور حالياً.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthGuard>
      <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6">
        <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-7 sm:p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-5">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <KeyRound className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-fg">تغيير كلمة المرور</h1>
              <p className="text-xs text-fg-muted mt-0.5">
                {user?.mustChangePassword
                  ? 'مطلوب تغيير كلمة المرور المؤقتة للمتابعة.'
                  : 'تحديث كلمة مرور الحساب الشخصي.'}
              </p>
            </div>
          </div>

          {user?.mustChangePassword ? (
            <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-3 text-xs font-bold text-amber-800 dark:text-amber-300">
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                يرجى تعيين كلمة مرور دائمة لا تقل عن 8 أحرف لكي تتمكن من استخدام لوحة التحكم.
              </span>
            </div>
          ) : null}

          {errorMessage ? (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
            >
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="cp-current" className="block text-sm font-bold text-fg">
                كلمة المرور الحالية
              </label>
              <input
                id="cp-current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-fg focus:border-brand-600 focus:outline-none"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="cp-new" className="block text-sm font-bold text-fg">
                كلمة المرور الجديدة (8 أحرف على الأقل)
              </label>
              <input
                id="cp-new"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-fg focus:border-brand-600 focus:outline-none"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="cp-confirm" className="block text-sm font-bold text-fg">
                تأكيد كلمة المرور الجديدة
              </label>
              <input
                id="cp-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-fg focus:border-brand-600 focus:outline-none"
                required
              />
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button type="submit" size="lg" loading={submitting} className="w-full">
                حفظ كلمة المرور الجديدة
              </Button>
              {!user?.mustChangePassword ? (
                <Link
                  href="/profile"
                  className="inline-flex items-center justify-center gap-1.5 text-sm font-bold text-fg-muted hover:text-fg py-2"
                >
                  <ArrowRight className="h-4 w-4" />
                  العودة إلى حسابي
                </Link>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </AuthGuard>
  );
}
