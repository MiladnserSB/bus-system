import { SeatDto } from '../types/api.types';

export const SYRIAN_MONTHS = [
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

export const ARABIC_DAYS = [
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
] as const;

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EXTENDED_ARABIC_INDIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/**
 * Converts any Arabic-Indic / Persian numerals into Western ASCII digits (0-9).
 */
export function toWesternDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (ch) => {
    const idx1 = ARABIC_INDIC_DIGITS.indexOf(ch);
    if (idx1 !== -1) return String(idx1);
    const idx2 = EXTENDED_ARABIC_INDIC_DIGITS.indexOf(ch);
    if (idx2 !== -1) return String(idx2);
    return ch;
  });
}

/**
 * Formats price in Western digits with Syrian Lira label: `45,000 ل.س` (SRS 3.1.1).
 */
export function formatPrice(price: number): string {
  const safe = Number.isFinite(price) ? Math.round(price) : 0;
  return `${new Intl.NumberFormat('en-US').format(safe)} ل.س`;
}

/**
 * Formats a Date/ISO timestamp in `Asia/Damascus` 24-hour time (`08:30`, Western digits).
 */
export function formatTime24h(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (Number.isNaN(d.getTime())) return '--:--';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Damascus',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour === '24' ? '00' : hour}:${minute}`;
}

/**
 * Returns YYYY-MM-DD in `Asia/Damascus` timezone with Western digits.
 */
export function getDamascusDateYmd(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Damascus',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

/**
 * Formats YYYY-MM-DD or ISO date string with Syrian Arabic month name and Western digits.
 */
export function formatDateSyrian(dateInput: string | Date): string {
  const ymd =
    typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())
      ? dateInput.trim()
      : getDamascusDateYmd(typeof dateInput === 'string' ? new Date(dateInput) : dateInput);

  const [yStr, mStr, dStr] = ymd.split('-');
  const year = Number(yStr);
  const monthIdx = Number(mStr) - 1;
  const day = Number(dStr);

  if (!year || monthIdx < 0 || monthIdx > 11 || !day) {
    return String(dateInput);
  }

  // Noon UTC ensures stable day-of-week regardless of DST offsets
  const probe = new Date(Date.UTC(year, monthIdx, day, 12, 0, 0));
  const dayName = ARABIC_DAYS[probe.getUTCDay()] ?? '';
  const monthName = SYRIAN_MONTHS[monthIdx] ?? '';
  return `${dayName}، ${day} ${monthName} ${year}`;
}

/**
 * Formats short date chip label (e.g., `اليوم` / `غداً` / `17 تشرين الثاني`).
 */
export function formatShortDateChip(ymd: string, todayYmd: string = getDamascusDateYmd()): {
  primary: string;
  secondary: string;
} {
  const [y, m, d] = ymd.split('-').map(Number);
  const [ty, tm, td] = todayYmd.split('-').map(Number);
  const targetMs = Date.UTC(y, m - 1, d);
  const todayMs = Date.UTC(ty, tm - 1, td);
  const diffDays = Math.round((targetMs - todayMs) / 86_400_000);

  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = ARABIC_DAYS[probe.getUTCDay()] ?? '';
  const dateText = `${d} ${SYRIAN_MONTHS[m - 1] ?? ''}`;

  if (diffDays === 0) return { primary: 'اليوم', secondary: dateText };
  if (diffDays === 1) return { primary: 'غداً', secondary: dateText };
  return { primary: weekday, secondary: dateText };
}

/**
 * Generates N consecutive dates starting from today in `Asia/Damascus`.
 */
export function getUpcomingDamascusDates(daysCount = 14, baseDate: Date = new Date()): string[] {
  const todayYmd = getDamascusDateYmd(baseDate);
  const [y, m, d] = todayYmd.split('-').map(Number);
  const list: string[] = [];
  for (let i = 0; i < daysCount; i += 1) {
    const dt = new Date(Date.UTC(y, m - 1, d + i, 12, 0, 0));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    list.push(`${yy}-${mm}-${dd}`);
  }
  return list;
}

/**
 * Normalizes Syrian mobile numbers (`09XXXXXXXX`, `9XXXXXXXX`, `+9639XXXXXXXX`, `009639XXXXXXXX`)
 * into E.164 format `+9639XXXXXXXX`, or returns null if invalid.
 */
export function normalizeSyrianPhone(raw: string): string | null {
  const cleaned = toWesternDigits(raw).replace(/[\s\-().]/g, '');
  if (/^\+9639\d{8}$/.test(cleaned)) return cleaned;
  if (/^009639\d{8}$/.test(cleaned)) return `+${cleaned.slice(2)}`;
  if (/^9639\d{8}$/.test(cleaned)) return `+${cleaned}`;
  if (/^09\d{8}$/.test(cleaned)) return `+963${cleaned.slice(1)}`;
  if (/^9\d{8}$/.test(cleaned)) return `+963${cleaned}`;
  return null;
}

export function isValidSyrianPhone(raw: string): boolean {
  return normalizeSyrianPhone(raw) !== null;
}

/**
 * Extracts local `9XXXXXXXX` digits for display next to `+963` prefix.
 */
export function extractLocalSyrianDigits(phone?: string | null): string {
  if (!phone) return '';
  const norm = normalizeSyrianPhone(phone);
  if (norm) return norm.slice(4);
  return toWesternDigits(phone).replace(/\D/g, '').slice(-9);
}

/**
 * Formats seconds as MM:SS in Western digits.
 */
export function formatCountdownMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Translates bus category code into clear Arabic label.
 */
export function formatBusCategoryAr(category?: string): string {
  switch (category) {
    case 'BUSINESS':
      return 'رجال أعمال VIP';
    case 'FIRST_CLASS':
      return 'درجة أولى';
    case 'STANDARD':
    default:
      return 'درجة عادية';
  }
}

/**
 * Generates an RFC-style unique idempotency / session identifier.
 */
export function generateClientId(prefix = 'id'): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand()}-${rand()}`;
}

export interface SeatMapRow {
  rowNumber: number;
  leftSeats: SeatDto[];
  middleSeat: SeatDto | null;
  rightSeats: SeatDto[];
}

/**
 * Groups flat seat list from `GET /trips/:id/seats` into visual bus rows.
 * Handles all 6 SRS bus configurations: 18 (1+1x9), 22 (1+1x11),
 * 27 (2+1x9), 33 (2+1x11), 37 (2+2x9 + 9E), and 45 (2+2x11 + 11E).
 */
export function groupSeatsIntoRows(seats: SeatDto[]): SeatMapRow[] {
  const byRow = new Map<number, SeatDto[]>();
  for (const seat of seats) {
    const list = byRow.get(seat.rowNumber) ?? [];
    list.push(seat);
    byRow.set(seat.rowNumber, list);
  }

  const rowNumbers = Array.from(byRow.keys()).sort((a, b) => a - b);
  return rowNumbers.map((rowNumber) => {
    const rowSeats = (byRow.get(rowNumber) ?? []).slice().sort((a, b) => a.colIndex - b.colIndex);
    const leftSeats = rowSeats.filter((s) => s.side === 'LEFT');
    const middleSeat = rowSeats.find((s) => s.side === 'MIDDLE' || s.isExtra) ?? null;
    const rightSeats = rowSeats.filter((s) => s.side === 'RIGHT' && !s.isExtra);
    return { rowNumber, leftSeats, middleSeat, rightSeats };
  });
}
