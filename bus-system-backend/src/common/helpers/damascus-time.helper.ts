export const DAMASCUS_TIMEZONE = 'Asia/Damascus';

export const SYRIAN_MONTHS_AR = [
  'كانون الثاني',
  'شباط',
  'آذار',
  'نيسان',
  'أيار',
  'حزيران',
  'تموز',
  'آب',
  'أيلول',
  'تشرين الأول',
  'تشرين الثاني',
  'كانون الأول',
] as const;

export const ARABIC_WEEKDAYS = [
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
] as const;

const damascusPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DAMASCUS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export interface DamascusParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number;
  dateStr: string;
  timeStr: string;
}

export function getDamascusParts(date: Date): DamascusParts {
  const parts = damascusPartsFormatter.formatToParts(date);
  const map = new Map<string, number>();
  for (const part of parts) {
    if (part.type !== 'literal') {
      map.set(part.type, Number.parseInt(part.value, 10));
    }
  }

  const year = map.get('year') ?? 1970;
  const month = map.get('month') ?? 1;
  const day = map.get('day') ?? 1;
  const rawHour = map.get('hour') ?? 0;
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = map.get('minute') ?? 0;
  const second = map.get('second') ?? 0;

  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const min = String(minute).padStart(2, '0');

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dayOfWeek,
    dateStr: `${year}-${mm}-${dd}`,
    timeStr: `${hh}:${min}`,
  };
}

export function damascusDateAndTimeToUtc(
  dateStr: string,
  timeStr: string,
): Date {
  const [year, month, day] = dateStr.split('-').map((n) => Number.parseInt(n, 10));
  const [hour, minute] = timeStr.split(':').map((n) => Number.parseInt(n, 10));

  const targetWallMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidateMs = targetWallMs - 3 * 60 * 60 * 1000;

  for (let i = 0; i < 2; i += 1) {
    const p = getDamascusParts(new Date(candidateMs));
    const actualWallMs = Date.UTC(
      p.year,
      p.month - 1,
      p.day,
      p.hour,
      p.minute,
      0,
      0,
    );
    const diff = targetWallMs - actualWallMs;
    if (diff === 0) break;
    candidateMs += diff;
  }

  return new Date(candidateMs);
}

export function formatDamascusDate(date: Date): string {
  return getDamascusParts(date).dateStr;
}

export function formatDamascusTime(date: Date): string {
  return getDamascusParts(date).timeStr;
}

export function formatDamascusArabicDate(date: Date): string {
  const p = getDamascusParts(date);
  const weekday = ARABIC_WEEKDAYS[p.dayOfWeek];
  const monthName = SYRIAN_MONTHS_AR[p.month - 1];
  return `${weekday} ${p.day} ${monthName} ${p.year}`;
}

export function formatBookingDateCode(date: Date): string {
  const p = getDamascusParts(date);
  return `${p.year}${String(p.month).padStart(2, '0')}${String(p.day).padStart(2, '0')}`;
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map((n) => Number.parseInt(n, 10));
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dateOnlyToUtcMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export function utcDateToDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function clampDayOfMonth(
  year: number,
  month: number,
  targetDay: number,
): number {
  return Math.min(Math.max(1, targetDay), daysInMonth(year, month));
}
