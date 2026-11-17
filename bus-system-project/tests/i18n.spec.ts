import { describe, expect, it } from 'vitest';
import { API_ERROR_MESSAGES, ArStrings, translateApiError } from '../src/shared/i18n/ar';

describe('Arabic RTL Strings & Error Code Translations', () => {
  it('provides translated Arabic messages for all backend concurrency/policy error codes', () => {
    const requiredCodes = [
      'SEAT_ALREADY_BOOKED',
      'SEAT_HELD_BY_ANOTHER',
      'MAX_SEATS_EXCEEDED',
      'HOLD_EXPIRED',
      'HOLD_NOT_FOUND',
      'TRIP_BOOKING_CLOSED',
      'CANCELLATION_DEADLINE_PASSED',
      'OTP_EXPIRED',
      'OTP_INVALID',
      'OTP_MAX_ATTEMPTS',
      'OTP_COOLDOWN',
      'NETWORK_ERROR',
      'UNAUTHORIZED',
    ];

    for (const code of requiredCodes) {
      expect(API_ERROR_MESSAGES[code]).toBeTruthy();
      expect(translateApiError(code)).toBe(API_ERROR_MESSAGES[code]);
    }
  });

  it('falls back cleanly to custom backend message or generic error', () => {
    expect(translateApiError('UNKNOWN_CODE', 'رسالة مخصصة من الخادم')).toBe(
      'رسالة مخصصة من الخادم',
    );
    expect(translateApiError('UNKNOWN_CODE')).toBe(API_ERROR_MESSAGES.INTERNAL_ERROR);
  });

  it('keeps seat map status labels localized and accessible', () => {
    expect(ArStrings.seats.legendAvailable).toBe('متاح');
    expect(ArStrings.seats.legendBooked).toBe('محجوز');
    expect(ArStrings.seats.legendHeld).toBe('قيد الحجز');
    expect(ArStrings.seats.legendSelected).toContain('محدد');
    expect(ArStrings.seats.legendSelected).toContain('✓');
  });
});
