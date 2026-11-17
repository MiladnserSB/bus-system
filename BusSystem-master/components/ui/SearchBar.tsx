'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/core/utils/cn';

export default function SearchBar({
  value,
  onChange,
  placeholder = 'بحث...',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative flex items-center w-full max-w-md', className)}>
      <Search className="absolute right-3.5 h-4 w-4 text-fg-subtle pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line bg-surface py-2.5 pr-10 pl-4 text-sm text-fg placeholder:text-fg-subtle shadow-xs focus:border-brand-600 focus:outline-none"
      />
    </div>
  );
}
