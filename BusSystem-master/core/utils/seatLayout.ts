import { BusCategory, SeatDto, SeatTemplateDto } from '@/types/api.types';

export interface SeatMapRow {
  rowNumber: number;
  leftSeats: SeatDto[];
  middleSeat: SeatDto | null;
  rightSeats: SeatDto[];
}

export function parseLayoutPattern(layout: string): {
  leftCount: number;
  rightCount: number;
} | null {
  const match = /^(\d+)\+(\d+)$/.exec(layout.trim());
  if (!match) return null;
  const leftCount = Number.parseInt(match[1], 10);
  const rightCount = Number.parseInt(match[2], 10);
  if (leftCount < 1 || leftCount > 4 || rightCount < 1 || rightCount > 4) {
    return null;
  }
  return { leftCount, rightCount };
}

/**
 * Generates live preview seat templates mirroring `bus-system-backend/src/common/helpers/seat-layout.helper.ts`.
 */
export function generateSeatPreviewTemplates(params: {
  category: BusCategory;
  layout: string;
  rowsCount: number;
  hasExtraBackSeat: boolean;
}): SeatTemplateDto[] {
  const parsed = parseLayoutPattern(params.layout);
  if (!parsed || params.rowsCount < 1 || params.rowsCount > 30) {
    return [];
  }
  const { leftCount, rightCount } = parsed;
  const allowExtra = params.hasExtraBackSeat && params.category === 'STANDARD';
  const seats: SeatTemplateDto[] = [];

  for (let row = 1; row <= params.rowsCount; row += 1) {
    let letterCode = 'A'.charCodeAt(0);
    for (let i = 0; i < leftCount; i += 1) {
      const colLetter = String.fromCharCode(letterCode++);
      seats.push({
        seatNumber: `${row}${colLetter}`,
        rowNumber: row,
        colLetter,
        side: 'LEFT',
        colIndex: i,
        isExtra: false,
      });
    }

    if (allowExtra && row === params.rowsCount) {
      seats.push({
        seatNumber: `${row}E`,
        rowNumber: row,
        colLetter: 'E',
        side: 'MIDDLE',
        colIndex: leftCount,
        isExtra: true,
      });
    }

    for (let j = 0; j < rightCount; j += 1) {
      let colLetter = String.fromCharCode(letterCode);
      if (colLetter === 'E') {
        letterCode += 1;
        colLetter = String.fromCharCode(letterCode);
      }
      letterCode += 1;
      seats.push({
        seatNumber: `${row}${colLetter}`,
        rowNumber: row,
        colLetter,
        side: 'RIGHT',
        colIndex: leftCount + (allowExtra && row === params.rowsCount ? 1 : 0) + j,
        isExtra: false,
      });
    }
  }

  return seats;
}

/**
 * Groups flat seat map array into cabin rows (`leftSeats | aisle/middleSeat | rightSeats`).
 */
export function groupSeatsIntoRows(seats: SeatDto[]): SeatMapRow[] {
  const byRow = new Map<number, SeatDto[]>();
  for (const seat of seats) {
    const list = byRow.get(seat.rowNumber) ?? [];
    list.push(seat);
    byRow.set(seat.rowNumber, list);
  }

  const rows = Array.from(byRow.keys()).sort((a, b) => a - b);
  return rows.map((rowNumber) => {
    const rowSeats = (byRow.get(rowNumber) ?? []).slice().sort((a, b) => a.colIndex - b.colIndex);
    const leftSeats = rowSeats.filter((s) => s.side === 'LEFT');
    const middleSeat = rowSeats.find((s) => s.side === 'MIDDLE' || s.isExtra) ?? null;
    const rightSeats = rowSeats.filter((s) => s.side === 'RIGHT' && !s.isExtra);
    return { rowNumber, leftSeats, middleSeat, rightSeats };
  });
}
