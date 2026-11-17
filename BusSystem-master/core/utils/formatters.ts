const SYRIAN_MONTHS = [
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

const ARABIC_DAYS = [
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
] as const;

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_INDIC = '۰۱۲۳۴۵۶۷۸۹';

export function toWesternDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (ch) => {
    const idx1 = ARABIC_INDIC.indexOf(ch);
    if (idx1 !== -1) return String(idx1);
    const idx2 = PERSIAN_INDIC.indexOf(ch);
    if (idx2 !== -1) return String(idx2);
    return ch;
  });
}

/**
 * Formats currency amount in Syrian Lira with Western digits: `45,000 ل.س`.
 */
export function formatPriceSyp(price: number): string {
  const safe = Number.isFinite(price) ? Math.round(price) : 0;
  return `${new Intl.NumberFormat('en-US').format(safe)} ل.س`;
}

/**
 * Formats an ISO timestamp / Date into `Asia/Damascus` 24-hour time (`08:00`).
 */
export function formatDamascusTime24h(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
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

export function formatDateSyrian(dateInput: string | Date): string {
  const ymd =
    typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())
      ? dateInput.trim()
      : getDamascusDateYmd(typeof dateInput === 'string' ? new Date(dateInput) : dateInput);

  const [yStr, mStr, dStr] = ymd.split('-');
  const year = Number(yStr);
  const monthIdx = Number(mStr) - 1;
  const day = Number(dStr);
  if (!year || monthIdx < 0 || monthIdx > 11 || !day) return String(dateInput);

  const probe = new Date(Date.UTC(year, monthIdx, day, 12, 0, 0));
  const dayName = ARABIC_DAYS[probe.getUTCDay()] ?? '';
  const monthName = SYRIAN_MONTHS[monthIdx] ?? '';
  return `${dayName}، ${day} ${monthName} ${year}`;
}

export function formatDamascusDateTime(dateInput: string | Date): string {
  return `${formatDateSyrian(dateInput)} · ${formatDamascusTime24h(dateInput)}`;
}

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

export function formatCountdownMMSS(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function generateIdempotencyKey(prefix = 'web-book'): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand()}-${rand()}`;
}

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

export function formatRecurrenceAr(
  recurrence: 'DAILY' | 'WEEKLY' | 'MONTHLY',
  daysOfWeek?: number[],
  dayOfMonth?: number | null,
): string {
  if (recurrence === 'DAILY') return 'يومي';
  if (recurrence === 'MONTHLY') return `شهري (يوم ${dayOfMonth ?? 1})`;
  const labels = (daysOfWeek ?? [])
    .slice()
    .sort((a, b) => a - b)
    .map((d) => ARABIC_DAYS[d] ?? '')
    .filter(Boolean);
  return labels.length > 0 ? `أسبوعي (${labels.join('، ')})` : 'أسبوعي';
}
