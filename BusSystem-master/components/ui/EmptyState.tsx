import React from 'react';
import { Inbox } from 'lucide-react';
import Button from './Button';

export default function EmptyState({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface p-12 text-center">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-surface-muted">
        <Inbox className="h-7 w-7" />
      </div>
      <h3 className="text-base font-bold text-fg">{title}</h3>
      {subtitle ? <p className="mt-1 max-w-md text-sm text-fg-muted">{subtitle}</p> : null}
      {actionLabel && onAction ? (
        <Button onClick={onAction} className="mt-5">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
