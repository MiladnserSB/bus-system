'use client';

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import Button from './Button';

export default function ErrorHandler({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'تعذر الاتصال بالخادم أو جلب المعلومات المطلوبة. يرجى المحاولة مرة أخرى.';

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center p-10 text-center rounded-2xl border border-rose-200 bg-rose-50/70 dark:bg-rose-950/25 dark:border-rose-900 my-4"
    >
      <div className="grid h-12 w-12 place-items-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900 dark:text-rose-300 mb-3">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h3 className="text-base font-extrabold text-fg">تعذر تحميل البيانات</h3>
      <p className="text-sm text-fg-muted max-w-md mt-1 mb-5">{message}</p>
      {onRetry ? (
        <Button onClick={onRetry} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4" />
          إعادة المحاولة
        </Button>
      ) : null}
    </div>
  );
}
