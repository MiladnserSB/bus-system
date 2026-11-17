'use client';

import React from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/core/utils/cn';
import { SeatStatus } from '@/types/api.types';

interface SeatComponentProps {
  seatNumber: string;
  status: SeatStatus;
  selected?: boolean;
  isExtra?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

/**
 * Accessible seat button aligned across Web & Mobile (SRS 3.1.1 & 4.5.3):
 * - Available: Light Blue (#EFF6FF / border #93C5FD)
 * - Booked: Light Red (#FEE2E2 / border #FCA5A5) + ×
 * - Held by another: Amber (#FEF3C7 / border #F59E0B) + dashed border + clock icon
 * - Selected / Held by me: Deep Blue (#133883) + white ✓
 * - Extra middle rear seat (9E/11E): distinct Amber highlight (#E0A100) + "إضافي" label
 */
export default function SeatComponent({
  seatNumber,
  status,
  selected = false,
  isExtra = false,
  disabled = false,
  onClick,
}: SeatComponentProps) {
  const isSelected = selected || status === 'HELD_BY_ME';
  const isBooked = status === 'BOOKED';
  const isHeldOther = status === 'HELD' && !selected;
  const isBlocked = disabled || isBooked || isHeldOther;

  let stateClasses =
    'bg-[#EFF6FF] border-[#93C5FD] text-[#1E3A8A] hover:border-brand-600 hover:bg-[#DBEAFE]';
  let symbol: React.ReactNode = null;
  let stateText = 'متاح';

  if (isSelected) {
    stateClasses = 'bg-[#133883] border-[#0D275C] text-white shadow-sm';
    symbol = <span aria-hidden="true">✓</span>;
    stateText = 'محدد';
  } else if (isBooked) {
    stateClasses = 'bg-[#FEE2E2] border-[#FCA5A5] text-[#991B1B] cursor-not-allowed';
    symbol = <span aria-hidden="true">×</span>;
    stateText = 'محجوز';
  } else if (isHeldOther) {
    stateClasses =
      'bg-[#FEF3C7] border-[#F59E0B] border-dashed text-[#92400E] cursor-not-allowed';
    symbol = <Clock className="h-3 w-3" aria-hidden="true" />;
    stateText = 'قيد الحجز';
  } else if (isExtra) {
    stateClasses =
      'bg-[#FFFBEB] border-[#E0A100] border-dashed text-[#92400E] hover:bg-amber-100';
  }

  return (
    <button
      type="button"
      disabled={isBlocked}
      onClick={onClick}
      aria-pressed={isSelected}
      aria-label={`مقعد ${seatNumber} ${stateText}${isExtra ? ' (مقعد إضافي وسط الممر)' : ''}`}
      className={cn(
        'min-w-[52px] min-h-[50px] px-2 py-1 rounded-xl border-2 flex flex-col items-center justify-center text-xs font-extrabold transition-all tabular-nums select-none',
        isBlocked ? 'cursor-not-allowed' : 'cursor-pointer',
        stateClasses,
      )}
    >
      <span className="flex items-center gap-1 leading-none">
        <span>{seatNumber}</span>
        {symbol}
      </span>
      {isExtra ? (
        <span
          className={cn(
            'text-[9px] font-bold leading-tight mt-0.5',
            isSelected ? 'text-amber-200' : 'text-amber-700',
          )}
        >
          إضافي
        </span>
      ) : null}
    </button>
  );
}
