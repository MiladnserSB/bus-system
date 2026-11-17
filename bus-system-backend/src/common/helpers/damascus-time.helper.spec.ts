import { describe, expect, it } from 'vitest';
import {
  addDaysToDateString,
  clampDayOfMonth,
  damascusDateAndTimeToUtc,
  formatDamascusArabicDate,
  formatDamascusDate,
  formatDamascusTime,
} from './damascus-time.helper.js';

describe('damascus-time.helper', () => {
  it('converts Asia/Damascus wall-clock date+time to UTC and back accurately', () => {
    const utc = damascusDateAndTimeToUtc('2026-11-08', '08:00');
    expect(utc.toISOString()).toBe('2026-11-08T05:00:00.000Z');
    expect(formatDamascusDate(utc)).toBe('2026-11-08');
    expect(formatDamascusTime(utc)).toBe('08:00');
    expect(formatDamascusArabicDate(utc)).toContain('تشرين الثاني');
  });

  it('clamps monthly day 31 to last day of shorter months including leap February (REQ-SCHD-11)', () => {
    expect(clampDayOfMonth(2026, 2, 31)).toBe(28);
    expect(clampDayOfMonth(2028, 2, 31)).toBe(29);
    expect(clampDayOfMonth(2026, 4, 31)).toBe(30);
    expect(clampDayOfMonth(2026, 12, 31)).toBe(31);
  });

  it('adds calendar days cleanly across month and year boundaries', () => {
    expect(addDaysToDateString('2026-12-30', 3)).toBe('2027-01-02');
  });
});
