'use client';

import React, { useEffect, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { formatDateSyrian, formatPriceSyp } from '@/core/utils/formatters';
import { ArWeb } from '@/i18n/ar';
import { TicketDto } from '@/types/api.types';
import Button from './Button';
import StatusBadge from './StatusBadge';

export default function TicketPrintModal({
  ticket,
  onClose,
}: {
  ticket: TicketDto | null;
  onClose: () => void;
}) {
  const [printFormat, setPrintFormat] = useState<'a5' | '80mm'>('a5');

  useEffect(() => {
    if (!ticket) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ticket, onClose]);

  if (!ticket) return null;

  const badgeStatus =
    ticket.status === 'CANCELLED'
      ? 'danger'
      : ticket.status === 'PARTIAL_CANCELLED'
        ? 'warning'
        : 'success';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 print:static print:bg-transparent print:p-0"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-surface border border-line shadow-2xl overflow-hidden print:max-h-none print:border-0 print:shadow-none print:max-w-none">
        {/* Toolbar hidden when printing */}
        <div className="no-print shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4 bg-surface-muted">
          <div>
            <h3 className="text-base font-extrabold text-fg">معاينة التذكرة والطباعة</h3>
            <p className="text-xs text-fg-muted tabular-nums">{ticket.bookingCode}</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-line bg-surface p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setPrintFormat('a5')}
                className={`px-3 py-1.5 rounded-lg cursor-pointer ${
                  printFormat === 'a5' ? 'bg-brand-600 text-white' : 'text-fg-muted'
                }`}
              >
                ورق A5
              </button>
              <button
                type="button"
                onClick={() => setPrintFormat('80mm')}
                className={`px-3 py-1.5 rounded-lg cursor-pointer ${
                  printFormat === '80mm' ? 'bg-brand-600 text-white' : 'text-fg-muted'
                }`}
              >
                إيصال حراري 80mm
              </button>
            </div>

            <Button
              size="sm"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4" />
              {ArWeb.common.print}
            </Button>

            <Button variant="outline" size="sm" onClick={onClose} aria-label="إغلاق">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Printable Ticket Surface */}
        <div className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0">
          <div
            data-print-format={printFormat}
            className={`print-area mx-auto rounded-2xl border border-line bg-white text-slate-900 p-6 ${
              printFormat === '80mm' ? 'max-w-[320px] text-xs p-4' : 'max-w-lg'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <div>
                <h2 className="text-lg font-extrabold text-[#133883]">شركة مسار للنقل</h2>
                <p className="text-[11px] text-slate-500">تذكرة سفر إلكترونية</p>
              </div>
              <StatusBadge
                status={badgeStatus}
                label={ArWeb.bookingStatus[ticket.status]}
              />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-dashed border-slate-300 pb-4 mb-4">
              <div className="space-y-1 text-right w-full">
                <span className="text-[11px] text-slate-500 block">رقم الحجز</span>
                <span className="text-lg font-extrabold text-[#133883] tabular-nums block">
                  {ticket.bookingCode}
                </span>
                <p className="text-base font-extrabold text-slate-900 pt-1">
                  {ticket.route.label}
                </p>
                <p className="text-xs font-semibold text-slate-700 tabular-nums">
                  {formatDateSyrian(ticket.departDateDamascus)} · {ticket.departTimeDamascus} (دمشق)
                </p>
                <p className="text-xs text-slate-600">
                  {ticket.busType.nameAr}
                  {ticket.busPlateNumber ? ` · لوحة ${ticket.busPlateNumber}` : ''}
                </p>
              </div>

              {ticket.qrCodeDataUrl ? (
                <div className="shrink-0 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ticket.qrCodeDataUrl}
                    alt={`QR ${ticket.bookingCode}`}
                    className={printFormat === '80mm' ? 'h-24 w-24 mx-auto' : 'h-28 w-28 mx-auto'}
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-2 mb-4">
              <h4 className="text-xs font-extrabold text-slate-700">المقاعد والركاب</h4>
              {ticket.seats.map((seat) => (
                <div
                  key={seat.seatNumber}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 border border-slate-200"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-[#133883] px-2 py-0.5 text-xs font-extrabold text-white tabular-nums">
                      {seat.seatNumber}
                    </span>
                    <div>
                      <span className="font-bold text-slate-900 block">{seat.passengerName}</span>
                      <span dir="ltr" className="text-[11px] text-slate-500 tabular-nums">
                        {seat.passengerPhone}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-bold tabular-nums text-slate-700">
                    {seat.isActive ? formatPriceSyp(seat.unitPrice) : 'ملغي'}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-sm font-extrabold">
              <span>{ticket.paymentMethodLabel}</span>
              <span className="text-[#133883] tabular-nums">{formatPriceSyp(ticket.totalPrice)}</span>
            </div>

            <p className="mt-3 rounded-lg bg-[#EBF1FC] px-3 py-2 text-center text-[11px] font-bold text-[#0D275C]">
              {ticket.earlyArrivalNotice}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
