import { describe, expect, it } from 'vitest';
import { AppException } from '../exceptions/app.exception.js';
import { maskPhone, normalizePhone } from './phone.helper.js';

describe('phone.helper', () => {
  it('normalizes Syrian phone numbers to E.164 +963 format', () => {
    expect(normalizePhone('0944123456')).toBe('+963944123456');
    expect(normalizePhone('963944123456')).toBe('+963944123456');
    expect(normalizePhone('+963 944-123-456')).toBe('+963944123456');
    expect(normalizePhone('00963944123456')).toBe('+963944123456');
  });

  it('rejects invalid phone formats', () => {
    expect(() => normalizePhone('12345')).toThrow(AppException);
    expect(() => normalizePhone('abc')).toThrow(AppException);
  });

  it('masks passenger phones for privacy (SEC-08)', () => {
    const masked = maskPhone('+963944123456');
    expect(masked).toContain('***');
    expect(masked.endsWith('456')).toBe(true);
    expect(masked).not.toBe('+963944123456');
  });
});
