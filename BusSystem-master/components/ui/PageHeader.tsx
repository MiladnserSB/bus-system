import React from 'react';
import Button from './Button';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  extraActions?: React.ReactNode;
}

export default function PageHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  extraActions,
}: PageHeaderProps) {
  return (
    <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">{title}</h1>
        {subtitle ? <p className="text-sm text-fg-muted mt-1">{subtitle}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {extraActions}
        {actionLabel && onAction ? (
          <Button onClick={onAction}>{actionLabel}</Button>
        ) : null}
      </div>
    </div>
  );
}
