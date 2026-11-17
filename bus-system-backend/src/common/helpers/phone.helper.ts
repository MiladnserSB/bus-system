import { HttpStatus } from '@nestjs/common';
import { ErrorCodes } from '../constants/error-codes.js';
import { AppException } from '../exceptions/app.exception.js';

export function normalizePhone(rawPhone: string): string {
  const cleaned = rawPhone.replace(/[\s\-()]/g, '').trim();

  if (/^09\d{8}$/.test(cleaned)) {
    return `+963${cleaned.slice(1)}`;
  }

  if (/^9639\d{8}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  if (/^\+9639\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  if (/^009639\d{8}$/.test(cleaned)) {
    return `+${cleaned.slice(2)}`;
  }

  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) {
    return cleaned;
  }

  throw new AppException(
    HttpStatus.BAD_REQUEST,
    ErrorCodes.VALIDATION_ERROR,
    'صيغة رقم الهاتف غير صحيحة، مثال: +963944123456 أو 0944123456',
    { phone: rawPhone },
  );
}

export function maskPhone(phone: string): string {
  if (!phone || phone.length < 6) {
    return '***';
  }
  const visiblePrefix = phone.slice(0, Math.min(6, phone.length - 3));
  const visibleSuffix = phone.slice(-3);
  const maskedLen = Math.max(3, phone.length - visiblePrefix.length - visibleSuffix.length);
  return `${visiblePrefix}${'*'.repeat(maskedLen)}${visibleSuffix}`;
}
