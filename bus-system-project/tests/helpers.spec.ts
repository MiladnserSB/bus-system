import { describe, expect, it } from 'vitest';
import {
  extractLocalSyrianDigits,
  formatCountdownMMSS,
  formatDateSyrian,
  formatPrice,
  formatTime24h,
  groupSeatsIntoRows,
  isValidSyrianPhone,
  normalizeSyrianPhone,
  toWesternDigits,
} from '../src/shared/constants/helpers';
import { SeatDto } from '../src/shared/types/api.types';

function makeSeat(
  rowNumber: number,
  colLetter: string,
  side: 'LEFT' | 'MIDDLE' | 'RIGHT',
  colIndex: number,
  isExtra = false,
): SeatDto {
  return {
    seatNumber: `${rowNumber}${colLetter}`,
    rowNumber,
    colLetter,
    side,
    colIndex,
    isExtra,
    status: 'AVAILABLE',
  };
}

function buildPresetSeats(
  leftCount: number,
  rightCount: number,
  rowsCount: number,
  hasExtraBackSeat: boolean,
): SeatDto[] {
  const seats: SeatDto[] = [];
  for (let row = 1; row <= rowsCount; row += 1) {
    let letterCode = 'A'.charCodeAt(0);
    for (let i = 0; i < leftCount; i += 1) {
      seats.push(makeSeat(row, String.fromCharCode(letterCode++), 'LEFT', i));
    }
    if (hasExtraBackSeat && row === rowsCount) {
      seats.push(makeSeat(row, 'E', 'MIDDLE', leftCount, true));
    }
    for (let j = 0; j < rightCount; j += 1) {
      let colLetter = String.fromCharCode(letterCode);
      if (colLetter === 'E') {
        letterCode += 1;
        colLetter = String.fromCharCode(letterCode);
      }
      letterCode += 1;
      seats.push(
        makeSeat(
          row,
          colLetter,
          'RIGHT',
          leftCount + (hasExtraBackSeat && row === rowsCount ? 1 : 0) + j,
        ),
      );
    }
  }
  return seats;
}

describe('Formatting & Validation Helpers (SRS 3.1.1)', () => {
  it('formats SYP price using Western digits (0-9)', () => {
    expect(formatPrice(45000)).toBe('45,000 ل.س');
    expect(formatPrice(0)).toBe('0 ل.س');
    expect(formatPrice(125500)).toBe('125,500 ل.س');
  });

  it('converts Eastern Arabic numerals into Western ASCII digits', () => {
    expect(toWesternDigits('٠٩٤٤١٢٣٤٥٦')).toBe('0944123456');
    expect(toWesternDigits('۱۲۳۴۵')).toBe('12345');
  });

  it('formats 24h time in Asia/Damascus timezone and dates with Syrian month names', () => {
    // 2026-12-01T05:00:00Z is 08:00 Asia/Damascus (UTC+3)
    expect(formatTime24h('2026-12-01T05:00:00.000Z')).toBe('08:00');
    const formattedDate = formatDateSyrian('2026-12-01');
    expect(formattedDate).toContain('كانون الأول');
    expect(formattedDate).toContain('2026');
    expect(formattedDate).toMatch(/[0-9]/);
  });

  it('normalizes Syrian phone numbers cleanly across formats', () => {
    expect(normalizeSyrianPhone('0944123456')).toBe('+963944123456');
    expect(normalizeSyrianPhone('944123456')).toBe('+963944123456');
    expect(normalizeSyrianPhone('+963 944-123-456')).toBe('+963944123456');
    expect(normalizeSyrianPhone('00963944123456')).toBe('+963944123456');
    expect(normalizeSyrianPhone('٠٩٤٤١٢٣٤٥٦')).toBe('+963944123456');
    expect(normalizeSyrianPhone('12345')).toBeNull();
    expect(isValidSyrianPhone('0991112233')).toBe(true);
    expect(extractLocalSyrianDigits('+963944123456')).toBe('944123456');
  });

  it('formats countdown in MM:SS Western digits', () => {
    expect(formatCountdownMMSS(300)).toBe('05:00');
    expect(formatCountdownMMSS(65)).toBe('01:05');
    expect(formatCountdownMMSS(-5)).toBe('00:00');
  });
});

describe('Seat Map Grouping for all 6 SRS Bus Configurations', () => {
  it.each([
    { name: 'Business Medium 1+1 (18 seats)', left: 1, right: 1, rows: 9, extra: false, total: 18 },
    { name: 'Business Large 1+1 (22 seats)', left: 1, right: 1, rows: 11, extra: false, total: 22 },
    { name: 'First Class Medium 2+1 (27 seats)', left: 2, right: 1, rows: 9, extra: false, total: 27 },
    { name: 'First Class Large 2+1 (33 seats)', left: 2, right: 1, rows: 11, extra: false, total: 33 },
    { name: 'Standard Medium 2+2+E (37 seats)', left: 2, right: 2, rows: 9, extra: true, total: 37 },
    { name: 'Standard Large 2+2+E (45 seats)', left: 2, right: 2, rows: 11, extra: true, total: 45 },
  ])('groups $name accurately with back-row extra seat when present', ({ left, right, rows, extra, total }) => {
    const flatSeats = buildPresetSeats(left, right, rows, extra);
    expect(flatSeats).toHaveLength(total);

    const grouped = groupSeatsIntoRows(flatSeats);
    expect(grouped).toHaveLength(rows);
    expect(grouped[0].leftSeats).toHaveLength(left);
    expect(grouped[0].rightSeats).toHaveLength(right);
    expect(grouped[0].middleSeat).toBeNull();

    const lastRow = grouped[grouped.length - 1];
    expect(lastRow.rowNumber).toBe(rows);
    if (extra) {
      expect(lastRow.middleSeat?.seatNumber).toBe(`${rows}E`);
      expect(lastRow.middleSeat?.isExtra).toBe(true);
    } else {
      expect(lastRow.middleSeat).toBeNull();
    }
  });
});
