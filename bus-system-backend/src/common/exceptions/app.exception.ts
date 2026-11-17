import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../constants/error-codes.js';

export class AppException extends HttpException {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    status: HttpStatus,
    code: ErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super({ code, message, details }, status);
    this.code = code;
    this.details = details;
  }
}
