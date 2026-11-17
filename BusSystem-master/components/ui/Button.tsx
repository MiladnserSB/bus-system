'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/core/utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600',
    accent: 'bg-accent-500 text-slate-900 hover:bg-accent-600 focus-visible:outline-accent-500',
    secondary: 'bg-surface-muted text-fg hover:bg-line border border-line',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-600',
    outline: 'border border-line bg-surface hover:bg-surface-muted text-fg',
    ghost: 'bg-transparent hover:bg-surface-muted text-fg',
  };

  const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
    sm: 'px-3 py-1.5 text-xs rounded-lg min-h-[36px]',
    md: 'px-4 py-2 text-sm rounded-xl min-h-[42px]',
    lg: 'px-6 py-2.5 text-base rounded-xl min-h-[46px]',
  };

  return (
    <button
      type={type}
      disabled={Boolean(disabled || loading)}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
