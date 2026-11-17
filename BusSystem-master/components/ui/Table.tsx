import React from 'react';
import { cn } from '@/core/utils/cn';

export function Table({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'w-full overflow-x-auto rounded-2xl border border-line bg-surface shadow-xs',
        className,
      )}
    >
      <table className="w-full text-right text-sm">{children}</table>
    </div>
  );
}

export function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-surface-muted border-b border-line text-xs text-fg-muted font-bold">
      {children}
    </thead>
  );
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function TableRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <tr className={cn('hover:bg-surface-muted/50 transition-colors', className)}>
      {children}
    </tr>
  );
}

export function TableHead({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={cn('px-5 py-3.5 font-extrabold text-fg whitespace-nowrap', className)}>{children}</th>;
}

export function TableCell({
  children,
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('px-5 py-3.5 text-fg-muted align-middle', className)}
      {...props}
    >
      {children}
    </td>
  );
}
