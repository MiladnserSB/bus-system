'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Bus, Eye, EyeOff, Lock, User } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { useAuth } from '@/core/auth/AuthContext';
import { ArWeb } from '@/i18n/ar';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const { showToast } = useToast();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    if (user.mustChangePassword) {
      router.replace('/change-password');
    } else {
      router.replace('/');
    }
  }, [user, loading, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);

    if (!identifier.trim() || !password) {
      setErrorMessage('يرجى إدخال اسم المستخدم وكلمة المرور.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await login(identifier.trim(), password);
      if (!result.success || !result.user) {
        setErrorMessage(result.message ?? 'بيانات الدخول غير صحيحة.');
        return;
      }

      showToast(`أهلاً بك، ${result.user.name}`);
      if (result.user.mustChangePassword) {
        router.replace('/change-password');
      } else {
        router.replace('/');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6">
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-7 sm:p-9 shadow-xl">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand-600 text-white shadow-md">
            <Bus className="h-8 w-8" />
            <span className="absolute -bottom-1 -left-1 h-4 w-4 rounded-full bg-accent-500 border-2 border-surface" />
          </div>
          <h1 className="text-2xl font-extrabold text-fg">{ArWeb.brand.name}</h1>
          <p className="text-sm text-fg-muted mt-1">{ArWeb.brand.subtitle}</p>
        </div>

        {errorMessage ? (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
          >
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="login-identifier" className="block text-sm font-bold text-fg">
              اسم المستخدم أو البريد الإلكتروني
            </label>
            <div className="relative">
              <User className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle pointer-events-none" />
              <input
                id="login-identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="مثال: admin"
                className="w-full rounded-xl border border-line bg-surface py-2.5 pr-10 pl-4 text-sm text-fg placeholder:text-fg-subtle focus:border-brand-600 focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="login-password" className="block text-sm font-bold text-fg">
              كلمة المرور
            </label>
            <div className="relative">
              <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle pointer-events-none" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-line bg-surface py-2.5 pr-10 pl-10 text-sm text-fg placeholder:text-fg-subtle focus:border-brand-600 focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" size="lg" loading={submitting} className="w-full">
            تسجيل الدخول
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-fg-subtle leading-relaxed">
          مخصص للمدير العام وموظفي مكاتب الاستقبال. يتم قفل الحساب مؤقتاً لـ 15 دقيقة بعد 5 محاولات دخول خاطئة.
        </p>
      </div>
    </div>
  );
}
