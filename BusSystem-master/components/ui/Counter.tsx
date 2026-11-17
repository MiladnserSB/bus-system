'use client';

import React from 'react';
import { Minus, Plus } from 'lucide-react';
import Button from './Button';

interface CounterProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export default function Counter({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
}: CounterProps) {
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-surface p-1 shadow-xs">
      <Button
        variant="ghost"
        size="sm"
        aria-label="إنقاص"
        onClick={() => value - step >= min && onChange(value - step)}
        disabled={value <= min}
        className="h-9 w-9 p-0 rounded-lg"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <span className="w-12 text-center text-sm font-bold text-fg tabular-nums">{value}</span>
      <Button
        variant="ghost"
        size="sm"
        aria-label="زيادة"
        onClick={() => value + step <= max && onChange(value + step)}
        disabled={value >= max}
        className="h-9 w-9 p-0 rounded-lg"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
