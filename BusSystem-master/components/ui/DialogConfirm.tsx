'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/core/utils/cn';
import Button from './Button';

interface DialogConfirmProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary' | 'accent';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}

export default function DialogConfirm({
  isOpen,
  title,
  message,
  confirmText = 'تأكيد',
  cancelText = 'إلغاء',
  variant = 'danger',
  loading = false,
  onConfirm,
  onClose,
  children,
}: DialogConfirmProps) {
  if (!isOpen) return null;

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-surface border border-line p-6 shadow-xl"
      >
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'grid h-11 w-11 shrink-0 place-items-center rounded-xl',
              variant === 'danger'
                ? 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
            )}
          >
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="flex-1 text-right">
            <h3 className="text-lg font-extrabold text-fg">{title}</h3>
            <p className="text-sm text-fg-muted mt-1 leading-relaxed">{message}</p>
            {children ? <div className="mt-3">{children}</div> : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
