import React from 'react';
import { cn } from '@/core/utils/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'full' | 'square';
}

export default function Card({
  children,
  className,
  variant = 'default',
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-surface p-5 shadow-xs transition-all',
        variant === 'full' ? 'w-full col-span-full' : '',
        variant === 'square' ? 'flex flex-col justify-between' : '',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
