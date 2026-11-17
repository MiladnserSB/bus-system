'use client';

import React, { useMemo } from 'react';
import { Clock, Compass } from 'lucide-react';
import { groupSeatsIntoRows } from '@/core/utils/seatLayout';
import { ArWeb } from '@/i18n/ar';
import { SeatDto } from '@/types/api.types';
import SeatComponent from './SeatComponent';

interface SeatMapBoardProps {
  seats: SeatDto[];
  busTypeName: string;
  layout: string;
  selectedSeatNumbers?: string[];
  disabled?: boolean;
  onToggleSeat?: (seat: SeatDto) => void;
}

export default function SeatMapBoard({
  seats,
  busTypeName,
  layout,
  selectedSeatNumbers = [],
  disabled = false,
  onToggleSeat,
}: SeatMapBoardProps) {
  const rows = useMemo(() => groupSeatsIntoRows(seats), [seats]);
  const selectedSet = useMemo(() => new Set(selectedSeatNumbers), [selectedSeatNumbers]);

  return (
    <div className="space-y-4">
      {/* Accessible Color + Icon Legend (SRS 3.1.1 & REQ-SEAT-06) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-xs font-bold">
        <div className="flex items-center gap-2">
          <span className="inline-block h-5 w-5 rounded-md border-2 border-[#93C5FD] bg-[#EFF6FF]" />
          <span className="text-fg">{ArWeb.seats.available}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border-2 border-[#0D275C] bg-[#133883] text-white text-[11px]">
            ✓
          </span>
          <span className="text-fg">{ArWeb.seats.selected}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border-2 border-dashed border-[#F59E0B] bg-[#FEF3C7] text-[#92400E]">
            <Clock className="h-3 w-3" />
          </span>
          <span className="text-fg">{ArWeb.seats.held}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border-2 border-[#FCA5A5] bg-[#FEE2E2] text-[#991B1B] text-sm leading-none">
            ×
          </span>
          <span className="text-fg">{ArWeb.seats.booked}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-5 w-5 rounded-md border-2 border-dashed border-[#E0A100] bg-[#FFFBEB]" />
          <span className="text-fg">{ArWeb.seats.extraBadge}</span>
        </div>
      </div>

      {/* Physical Bus Interior Container */}
      <div className="rounded-2xl border-2 border-line-strong bg-surface p-5 max-w-xl mx-auto">
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-extrabold text-brand-700">
            {busTypeName} · {layout} ({seats.length} مقعد)
          </span>
          <div className="flex items-center gap-2 text-xs font-bold text-fg-muted">
            <span>{ArWeb.seats.front}</span>
            <span className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface-muted text-brand-600">
              <Compass className="h-4 w-4" />
            </span>
          </div>
        </div>

        {/* Fixed LTR cabin rows: Physical LEFT seats | Aisle/Middle(E) | Physical RIGHT seats */}
        <div dir="ltr" className="space-y-2.5">
          {rows.map((row) => (
            <div
              key={row.rowNumber}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex flex-1 items-center justify-center gap-2">
                {row.leftSeats.map((seat) => (
                  <SeatComponent
                    key={seat.seatNumber}
                    seatNumber={seat.seatNumber}
                    status={seat.status}
                    selected={selectedSet.has(seat.seatNumber)}
                    isExtra={seat.isExtra}
                    disabled={disabled}
                    onClick={onToggleSeat ? () => onToggleSeat(seat) : undefined}
                  />
                ))}
              </div>

              <div className="min-w-[56px] flex items-center justify-center">
                {row.middleSeat ? (
                  <SeatComponent
                    seatNumber={row.middleSeat.seatNumber}
                    status={row.middleSeat.status}
                    selected={selectedSet.has(row.middleSeat.seatNumber)}
                    isExtra
                    disabled={disabled}
                    onClick={
                      onToggleSeat
                        ? () => onToggleSeat(row.middleSeat!)
                        : undefined
                    }
                  />
                ) : (
                  <span className="text-xs font-bold text-fg-subtle tabular-nums">
                    {row.rowNumber}
                  </span>
                )}
              </div>

              <div className="flex flex-1 items-center justify-center gap-2">
                {row.rightSeats.map((seat) => (
                  <SeatComponent
                    key={seat.seatNumber}
                    seatNumber={seat.seatNumber}
                    status={seat.status}
                    selected={selectedSet.has(seat.seatNumber)}
                    isExtra={seat.isExtra}
                    disabled={disabled}
                    onClick={onToggleSeat ? () => onToggleSeat(seat) : undefined}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-line text-center text-xs font-bold text-fg-muted">
          {ArWeb.seats.back}
        </div>
      </div>
    </div>
  );
}
