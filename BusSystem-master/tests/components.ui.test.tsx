import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ModalShell from '@/components/ui/ModalShell';
import SeatMapBoard from '@/components/ui/SeatMapBoard';
import TicketPrintModal from '@/components/ui/TicketPrintModal';
import { generateSeatPreviewTemplates } from '@/core/utils/seatLayout';
import { SeatDto, TicketDto } from '@/types/api.types';

vi.mock('@/core/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 2,
      name: 'Receptionist User',
      username: 'rec1',
      email: null,
      phone: '+963911111111',
      role: 'RECEPTIONIST',
      mustChangePassword: false,
    },
    loading: false,
    logout: vi.fn(),
    hasRole: (allowed?: string[]) => !allowed?.includes('ADMIN'),
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/core/theme', () => ({
  ThemeToggle: () => <button type="button" aria-label="تبديل المظهر" />,
}));

import Navbar from '@/components/layout/Navbar';
import { RoleGuard } from '@/core/auth/RoleGuard';

describe('Web UI Components (SeatMapBoard, TicketPrintModal, RoleGuard)', () => {
  it('renders 45-seat STANDARD_LARGE layout with accessible symbols, extra badge, and LTR cabin geometry', () => {
    const base = generateSeatPreviewTemplates({
      category: 'STANDARD',
      layout: '2+2',
      rowsCount: 11,
      hasExtraBackSeat: true,
    });
    const seats: SeatDto[] = base.map((tpl, idx) => ({
      ...tpl,
      status: idx === 0 ? 'BOOKED' : idx === 1 ? 'HELD' : 'AVAILABLE',
    }));

    const html = renderToStaticMarkup(
      <SeatMapBoard
        seats={seats}
        busTypeName="عادي كبير"
        layout="2+2"
        selectedSeatNumbers={['11E']}
      />,
    );

    expect(html).toContain('dir="ltr"');
    expect(html).toContain('11E');
    expect(html).toContain('إضافي');
    expect(html).toContain('✓');
    expect(html).toContain('×');
    expect(html).toContain('45 مقعد');
  });

  it('renders TicketPrintModal with A5 default layout, early arrival notice, and QR image', () => {
    const ticket: TicketDto = {
      bookingCode: 'BK-2026-1001',
      status: 'CONFIRMED',
      route: {
        originAr: 'دمشق',
        originEn: 'Damascus',
        destinationAr: 'حلب',
        destinationEn: 'Aleppo',
        label: 'دمشق ← حلب',
      },
      departAt: '2026-06-01T05:30:00.000Z',
      departDateDamascus: '2026-06-01',
      departTimeDamascus: '08:30',
      departDateArabic: 'الإثنين، 1 حزيران 2026',
      busType: {
        nameAr: 'رجال أعمال كبير VIP',
        category: 'BUSINESS',
        size: 'LARGE',
        layout: '1+1',
      },
      busPlateNumber: 'دمشق 112233',
      seats: [
        {
          seatNumber: '1A',
          passengerName: 'أحمد العلي',
          passengerPhone: '+963912345678',
          unitPrice: 75000,
          status: 'CONFIRMED',
          isActive: true,
        },
      ],
      totalPrice: 75000,
      paymentMethod: 'CASH_OFFICE',
      paymentMethodLabel: 'نقداً في المكتب',
      earlyArrivalNotice: 'يرجى الحضور قبل موعد الانطلاق بـ 30 دقيقة على الأقل.',
      qrPayload: {
        code: 'BK-2026-1001',
        tripId: 12,
        seats: ['1A'],
        issuedAt: '2026-06-01T01:00:00Z',
        signature: 'sig-123',
      },
      qrCodeDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
    };

    const html = renderToStaticMarkup(
      <TicketPrintModal ticket={ticket} onClose={() => {}} />,
    );

    expect(html).toContain('BK-2026-1001');
    expect(html).toContain('شركة BusWay للنقل');
    expect(html).toContain('دمشق ← حلب');
    expect(html).toContain('75,000 ل.س');
    expect(html).toContain('data-print-format="a5"');
    expect(html).toContain('يرجى الحضور قبل موعد الانطلاق بـ 30 دقيقة');
    expect(html).toContain('data:image/png;base64');
  });

  it('renders Navbar with BusWay branding on right and search/profile/theme/logout grouped on left', () => {
    const html = renderToStaticMarkup(<Navbar onOpenMobileMenu={() => {}} />);

    expect(html).toContain('w-full items-center justify-between');
    expect(html).toContain('>BW<');
    expect(html).toContain('>BusWay<');

    const brandIdx = html.indexOf('>BusWay<');
    const searchIdx = html.indexOf('بحث برقم الحجز');
    const themeIdx = html.indexOf('تبديل المظهر');
    const userIdx = html.indexOf('Receptionist User');
    const logoutIdx = html.indexOf('تسجيل الخروج');

    expect(brandIdx).toBeGreaterThan(-1);
    expect(searchIdx).toBeGreaterThan(brandIdx);
    expect(themeIdx).toBeGreaterThan(searchIdx);
    expect(userIdx).toBeGreaterThan(themeIdx);
    expect(logoutIdx).toBeGreaterThan(userIdx);
  });

  it('blocks unauthorized role access inside RoleGuard', () => {
    const html = renderToStaticMarkup(
      <RoleGuard allowedRoles={['ADMIN']}>
        <div>Admin Secret Panel</div>
      </RoleGuard>,
    );
    expect(html).toContain('ليس لديك صلاحية الوصول');
    expect(html).not.toContain('Admin Secret Panel');
  });

  it('renders ModalShell with bounded viewport height, sticky header, and accessible close button', () => {
    const html = renderToStaticMarkup(
      <ModalShell isOpen onClose={() => {}} title="مخطط المقاعد">
        <div>تفاصيل المخطط</div>
      </ModalShell>,
    );
    expect(html).toContain('max-h-[90vh]');
    expect(html).toContain('overflow-y-auto');
    expect(html).toContain('aria-label="إغلاق"');
    expect(html).toContain('مخطط المقاعد');
  });
});
