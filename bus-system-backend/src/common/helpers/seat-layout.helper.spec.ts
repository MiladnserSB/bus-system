import { describe, expect, it } from 'vitest';
import { BusCategory, SeatSide } from '../../generated/prisma/enums.js';
import { AppException } from '../exceptions/app.exception.js';
import {
  generateSeatTemplates,
  PRESET_BUS_TYPES,
} from './seat-layout.helper.js';

describe('seat-layout.helper', () => {
  it('generates exact seat counts and layouts for all 6 SRS preset bus types', () => {
    for (const preset of PRESET_BUS_TYPES) {
      const seats = generateSeatTemplates({
        category: preset.category,
        layout: preset.layout,
        rowsCount: preset.rowsCount,
        hasExtraBackSeat: preset.hasExtraBackSeat,
        expectedTotalSeats: preset.totalSeats,
      });

      expect(seats).toHaveLength(preset.totalSeats);
      const uniqueNumbers = new Set(seats.map((s) => s.seatNumber));
      expect(uniqueNumbers.size).toBe(preset.totalSeats);

      const extraSeats = seats.filter((s) => s.isExtra);
      if (preset.category === BusCategory.STANDARD) {
        expect(extraSeats).toHaveLength(1);
        expect(extraSeats[0].seatNumber).toBe(`${preset.rowsCount}E`);
        expect(extraSeats[0].side).toBe(SeatSide.MIDDLE);
      } else {
        expect(extraSeats).toHaveLength(0);
      }
    }
  });

  it('places 11E in the middle of the last row for Standard Large (45 seats)', () => {
    const seats = generateSeatTemplates({
      category: BusCategory.STANDARD,
      layout: '2+2',
      rowsCount: 11,
      hasExtraBackSeat: true,
      expectedTotalSeats: 45,
    });

    const row11 = seats.filter((s) => s.rowNumber === 11);
    expect(row11.map((s) => s.seatNumber)).toEqual([
      '11A',
      '11B',
      '11E',
      '11C',
      '11D',
    ]);
    expect(row11.map((s) => s.colIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it('rejects extra back seat on non-STANDARD bus categories (BR-7)', () => {
    expect(() =>
      generateSeatTemplates({
        category: BusCategory.FIRST_CLASS,
        layout: '2+1',
        rowsCount: 11,
        hasExtraBackSeat: true,
      }),
    ).toThrow(AppException);
  });

  it('rejects when generated seat count mismatches expected totalSeats (REQ-DATA-05)', () => {
    expect(() =>
      generateSeatTemplates({
        category: BusCategory.BUSINESS,
        layout: '1+1',
        rowsCount: 11,
        hasExtraBackSeat: false,
        expectedTotalSeats: 99,
      }),
    ).toThrow(AppException);
  });

  it('supports adding custom layout patterns without code changes (REQ-DATA-06)', () => {
    const seats = generateSeatTemplates({
      category: BusCategory.FIRST_CLASS,
      layout: '2+2',
      rowsCount: 8,
      hasExtraBackSeat: false,
      expectedTotalSeats: 32,
    });
    expect(seats).toHaveLength(32);
    expect(seats[0].seatNumber).toBe('1A');
  });
});
