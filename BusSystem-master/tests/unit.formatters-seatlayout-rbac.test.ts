import { describe, expect, it } from 'vitest';
import { WEB_NAVIGATION } from '@/components/layout/Sidebar';
import { DesignTokens } from '@/core/theme/tokens';
import {
  formatCountdownMMSS,
  formatDamascusTime24h,
  formatPriceSyp,
  isValidSyrianPhone,
  normalizeSyrianPhone,
} from '@/core/utils/formatters';
import { generateSeatPreviewTemplates, groupSeatsIntoRows } from '@/core/utils/seatLayout';
import { translateWebApiError } from '@/i18n/ar';
import { SeatDto } from '@/types/api.types';

describe('Web Design Tokens & Formatters', () => {
  it('enforces unified brand tokens and SRS 5000ms toast duration', () => {
    expect(DesignTokens.brand.primary).toBe('#133883');
    expect(DesignTokens.brand.accent).toBe('#E0A100');
    expect(DesignTokens.toastDurationMs).toBe(5000);
  });

  it('formats SYP currency with Western digits and ل.س suffix', () => {
    expect(formatPriceSyp(45000)).toBe('45,000 ل.س');
    expect(formatPriceSyp(125500.4)).toBe('125,500 ل.س');
  });

  it('formats Asia/Damascus time in 24-hour HH:mm format', () => {
    // 2026-06-01T05:30:00Z is 08:30 in Asia/Damascus (UTC+3)
    expect(formatDamascusTime24h('2026-06-01T05:30:00Z')).toBe('08:30');
  });

  it('normalizes Syrian phone numbers including Arabic-Indic digits', () => {
    expect(normalizeSyrianPhone('0912345678')).toBe('+963912345678');
    expect(normalizeSyrianPhone('٠٩٨٧٦٥٤٣٢١')).toBe('+963987654321');
    expect(normalizeSyrianPhone('00963911223344')).toBe('+963911223344');
    expect(isValidSyrianPhone('+963944556677')).toBe(true);
    expect(isValidSyrianPhone('12345')).toBe(false);
  });

  it('formats hold countdown MM:SS accurately', () => {
    expect(formatCountdownMMSS(300)).toBe('05:00');
    expect(formatCountdownMMSS(65)).toBe('01:05');
    expect(formatCountdownMMSS(-5)).toBe('00:00');
  });
});

describe('Seat Layout Generator & Row Grouping (All 6 SRS Bus Types)', () => {
  const cases = [
    { name: 'STANDARD_LARGE', category: 'STANDARD' as const, layout: '2+2', rowsCount: 11, extra: true, expectedTotal: 45, expectedExtra: '11E' },
    { name: 'STANDARD_MEDIUM', category: 'STANDARD' as const, layout: '2+2', rowsCount: 9, extra: true, expectedTotal: 37, expectedExtra: '9E' },
    { name: 'FIRST_CLASS_LARGE', category: 'FIRST_CLASS' as const, layout: '2+1', rowsCount: 11, extra: false, expectedTotal: 33, expectedExtra: null },
    { name: 'FIRST_CLASS_MEDIUM', category: 'FIRST_CLASS' as const, layout: '2+1', rowsCount: 9, extra: false, expectedTotal: 27, expectedExtra: null },
    { name: 'BUSINESS_LARGE', category: 'BUSINESS' as const, layout: '1+1', rowsCount: 11, extra: false, expectedTotal: 22, expectedExtra: null },
    { name: 'BUSINESS_MEDIUM', category: 'BUSINESS' as const, layout: '1+1', rowsCount: 9, extra: false, expectedTotal: 18, expectedExtra: null },
  ];

  for (const tc of cases) {
    it(`generates exact seat map for ${tc.name} (${tc.expectedTotal} seats)`, () => {
      const templates = generateSeatPreviewTemplates({
        category: tc.category,
        layout: tc.layout,
        rowsCount: tc.rowsCount,
        hasExtraBackSeat: tc.extra,
      });
      expect(templates).toHaveLength(tc.expectedTotal);

      const asSeats: SeatDto[] = templates.map((t) => ({ ...t, status: 'AVAILABLE' }));
      const rows = groupSeatsIntoRows(asSeats);
      expect(rows).toHaveLength(tc.rowsCount);

      const lastRow = rows[rows.length - 1];
      if (tc.expectedExtra) {
        expect(lastRow.middleSeat?.seatNumber).toBe(tc.expectedExtra);
        expect(lastRow.middleSeat?.isExtra).toBe(true);
      } else {
        expect(lastRow.middleSeat).toBeNull();
      }
    });
  }
});

describe('RBAC Navigation & Arabic Error Translation', () => {
  it('restricts RECEPTIONIST sidebar strictly to reception workflows', () => {
    const receptionistLinks = WEB_NAVIGATION.filter((item) =>
      item.roles.includes('RECEPTIONIST'),
    ).map((i) => i.href);

    expect(receptionistLinks).toEqual(['/', '/trips', '/bookings', '/profile']);
    expect(receptionistLinks).not.toContain('/analytics');
    expect(receptionistLinks).not.toContain('/staff');
    expect(receptionistLinks).not.toContain('/settings');
    expect(receptionistLinks).not.toContain('/audit');
    expect(receptionistLinks).not.toContain('/fleet');
    expect(receptionistLinks).not.toContain('/stations');
    expect(receptionistLinks).not.toContain('/scheduled-trips');
  });

  it('translates key backend API error codes into clear Arabic', () => {
    expect(translateWebApiError('ACCOUNT_LOCKED')).toContain('قفل الحساب');
    expect(translateWebApiError('DUPLICATE_TRIP_CONFIRMATION_REQUIRED')).toContain('التأكيد');
    expect(translateWebApiError('CANCELLATION_DEADLINE_PASSED')).toContain('المهلة');
  });
});
