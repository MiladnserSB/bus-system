'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/core/utils/cn';

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  maxWidthClass?: string;
  children: React.ReactNode;
}

export default function ModalShell({
  isOpen,
  onClose,
  title,
  maxWidthClass = 'max-w-2xl',
  children,
}: ModalShellProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'w-full max-h-[90vh] flex flex-col rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden',
          maxWidthClass,
        )}
      >
        <div className="shrink-0 flex items-center justify-between border-b border-line px-6 py-4 bg-surface">
          <h3 className="text-lg font-extrabold text-fg">{title}</h3>
          <button
            type="button"
            aria-label="إغلاق"
            onClick={onClose}
            className="rounded-lg p-1.5 text-fg-subtle hover:bg-surface-muted hover:text-fg cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
