import { HttpStatus } from '@nestjs/common';
import { BusCategory, BusSize, SeatSide } from '../../generated/prisma/enums.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { AppException } from '../exceptions/app.exception.js';

export interface GeneratedSeat {
  seatNumber: string;
  rowNumber: number;
  colLetter: string;
  side: SeatSide;
  colIndex: number;
  isExtra: boolean;
}

export interface SeatLayoutInput {
  category: BusCategory;
  layout: string;
  rowsCount: number;
  hasExtraBackSeat: boolean;
  expectedTotalSeats?: number;
}

export interface PresetBusTypeSpec {
  code: string;
  nameAr: string;
  nameEn: string;
  category: BusCategory;
  size: BusSize;
  layout: string;
  rowsCount: number;
  hasExtraBackSeat: boolean;
  totalSeats: number;
}

export const PRESET_BUS_TYPES: readonly PresetBusTypeSpec[] = [
  {
    code: 'STANDARD_LARGE',
    nameAr: 'عادية 2+2 كبير',
    nameEn: 'Standard 2+2 Large',
    category: BusCategory.STANDARD,
    size: BusSize.LARGE,
    layout: '2+2',
    rowsCount: 11,
    hasExtraBackSeat: true,
    totalSeats: 45,
  },
  {
    code: 'STANDARD_MEDIUM',
    nameAr: 'عادية 2+2 متوسط',
    nameEn: 'Standard 2+2 Medium',
    category: BusCategory.STANDARD,
    size: BusSize.MEDIUM,
    layout: '2+2',
    rowsCount: 9,
    hasExtraBackSeat: true,
    totalSeats: 37,
  },
  {
    code: 'FIRST_CLASS_LARGE',
    nameAr: 'درجة أولى 2+1 كبير',
    nameEn: 'First Class 2+1 Large',
    category: BusCategory.FIRST_CLASS,
    size: BusSize.LARGE,
    layout: '2+1',
    rowsCount: 11,
    hasExtraBackSeat: false,
    totalSeats: 33,
  },
  {
    code: 'FIRST_CLASS_MEDIUM',
    nameAr: 'درجة أولى 2+1 متوسط',
    nameEn: 'First Class 2+1 Medium',
    category: BusCategory.FIRST_CLASS,
    size: BusSize.MEDIUM,
    layout: '2+1',
    rowsCount: 9,
    hasExtraBackSeat: false,
    totalSeats: 27,
  },
  {
    code: 'BUSINESS_LARGE',
    nameAr: 'رجال أعمال 1+1 كبير',
    nameEn: 'Business 1+1 Large',
    category: BusCategory.BUSINESS,
    size: BusSize.LARGE,
    layout: '1+1',
    rowsCount: 11,
    hasExtraBackSeat: false,
    totalSeats: 22,
  },
  {
    code: 'BUSINESS_MEDIUM',
    nameAr: 'رجال أعمال 1+1 متوسط',
    nameEn: 'Business 1+1 Medium',
    category: BusCategory.BUSINESS,
    size: BusSize.MEDIUM,
    layout: '1+1',
    rowsCount: 9,
    hasExtraBackSeat: false,
    totalSeats: 18,
  },
];

export function parseLayoutPattern(layout: string): {
  leftCount: number;
  rightCount: number;
} {
  const match = /^(\d+)\+(\d+)$/.exec(layout.trim());
  if (!match) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCodes.INVALID_SEAT_LAYOUT,
      'صيغة التخطيط غير صالحة، يجب أن تكون مثل 2+2 أو 2+1 أو 1+1',
      { layout },
    );
  }

  const leftCount = Number.parseInt(match[1], 10);
  const rightCount = Number.parseInt(match[2], 10);

  if (leftCount < 1 || leftCount > 4 || rightCount < 1 || rightCount > 4) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCodes.INVALID_SEAT_LAYOUT,
      'عدد المقاعد على جانبي الممر يجب أن يكون بين 1 و4',
      { layout, leftCount, rightCount },
    );
  }

  return { leftCount, rightCount };
}

export function generateSeatTemplates(input: SeatLayoutInput): GeneratedSeat[] {
  const { category, layout, rowsCount, hasExtraBackSeat, expectedTotalSeats } = input;

  if (!Number.isInteger(rowsCount) || rowsCount < 1 || rowsCount > 30) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCodes.INVALID_SEAT_LAYOUT,
      'عدد الصفوف يجب أن يكون رقماً صحيحاً بين 1 و30',
      { rowsCount },
    );
  }

  if (hasExtraBackSeat && category !== BusCategory.STANDARD) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCodes.INVALID_SEAT_LAYOUT,
      'المقعد الإضافي في منتصف آخر الممر مسموح للفئة العادية فقط',
      { category },
    );
  }

  const { leftCount, rightCount } = parseLayoutPattern(layout);
  const seats: GeneratedSeat[] = [];

  for (let row = 1; row <= rowsCount; row += 1) {
    let letterCode = 'A'.charCodeAt(0);

    for (let i = 0; i < leftCount; i += 1) {
      const colLetter = String.fromCharCode(letterCode);
      letterCode += 1;
      seats.push({
        seatNumber: `${row}${colLetter}`,
        rowNumber: row,
        colLetter,
        side: SeatSide.LEFT,
        colIndex: i,
        isExtra: false,
      });
    }

    if (hasExtraBackSeat && row === rowsCount) {
      seats.push({
        seatNumber: `${row}E`,
        rowNumber: row,
        colLetter: 'E',
        side: SeatSide.MIDDLE,
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
        side: SeatSide.RIGHT,
        colIndex: leftCount + 1 + j,
        isExtra: false,
      });
    }
  }

  if (
    expectedTotalSeats !== undefined &&
    seats.length !== expectedTotalSeats
  ) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCodes.INVALID_SEAT_LAYOUT,
      `عدد المقاعد المولّد (${seats.length}) لا يطابق العدد المحدد (${expectedTotalSeats})`,
      { generated: seats.length, expected: expectedTotalSeats },
    );
  }

  return seats;
}
