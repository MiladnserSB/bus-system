'use client';

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-rose-200 bg-rose-50/70 dark:bg-rose-950/30 dark:border-rose-900 p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-rose-100 text-rose-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-extrabold text-fg">حدث خطأ غير متوقع في الواجهة</h2>
        <p className="mt-2 text-sm text-fg-muted">
          {error.message || 'تعذر عرض الصفحة المطلوبة حالياً.'}
        </p>
        <div className="mt-5 flex justify-center">
          <Button onClick={reset}>
            <RefreshCw className="h-4 w-4" />
            إعادة المحاولة
          </Button>
        </div>
      </div>
    </div>
  );
}
