import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { AppException } from '../exceptions/app.exception.js';

export interface UnifiedErrorBody {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.normalizeException(exception);

    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} -> ${status} ${body.code}: ${body.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(body);
  }

  private normalizeException(exception: unknown): {
    status: number;
    body: UnifiedErrorBody;
  } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.handlePrismaError(exception);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      return this.handleHttpException(status, raw, exception.message);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'حدث خطأ غير متوقع في الخادم، يرجى المحاولة لاحقاً',
        details: {},
      },
    };
  }

  private handleHttpException(
    status: number,
    raw: unknown,
    fallbackMessage: string,
  ): { status: number; body: UnifiedErrorBody } {
    if (typeof raw === 'object' && raw !== null) {
      const obj = raw as Record<string, unknown>;
      if (typeof obj.code === 'string' && typeof obj.message === 'string') {
        return {
          status,
          body: {
            code: obj.code,
            message: obj.message,
            details:
              typeof obj.details === 'object' && obj.details !== null
                ? (obj.details as Record<string, unknown>)
                : {},
          },
        };
      }

      if (Array.isArray(obj.message)) {
        return {
          status,
          body: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'بيانات الإدخال غير صالحة',
            details: { errors: obj.message },
          },
        };
      }

      if (typeof obj.message === 'string') {
        return {
          status,
          body: {
            code: this.defaultCodeForStatus(status),
            message: obj.message,
            details: {},
          },
        };
      }
    }

    return {
      status,
      body: {
        code: this.defaultCodeForStatus(status),
        message: fallbackMessage || 'حدث خطأ أثناء معالجة الطلب',
        details: {},
      },
    };
  }

  private handlePrismaError(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    body: UnifiedErrorBody;
  } {
    if (error.code === 'P2002') {
      const message = error.message ?? '';
      if (message.includes('booking_seats_trip_id_seat_number_active_key')) {
        return {
          status: HttpStatus.CONFLICT,
          body: {
            code: ErrorCodes.SEAT_ALREADY_BOOKED,
            message: 'هذا المقعد تم حجزه للتو، يرجى اختيار مقعد آخر',
            details: {},
          },
        };
      }
      return {
        status: HttpStatus.CONFLICT,
        body: {
          code: ErrorCodes.DUPLICATE_ENTRY,
          message: 'القيمة المدخلة مسجلة مسبقاً',
          details: { target: error.meta?.target ?? [] },
        },
      };
    }

    if (error.code === 'P2003' || error.code === 'P2014') {
      return {
        status: HttpStatus.CONFLICT,
        body: {
          code: ErrorCodes.RESOURCE_IN_USE,
          message: 'لا يمكن إتمام العملية لارتباط السجل ببيانات أخرى',
          details: {},
        },
      };
    }

    if (error.code === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        body: {
          code: ErrorCodes.NOT_FOUND,
          message: 'السجل المطلوب غير موجود',
          details: {},
        },
      };
    }

    return {
      status: HttpStatus.BAD_REQUEST,
      body: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'تعذر تنفيذ العملية على قاعدة البيانات',
        details: { prismaCode: error.code },
      },
    };
  }

  private defaultCodeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCodes.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCodes.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCodes.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCodes.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCodes.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCodes.RATE_LIMIT_EXCEEDED;
      default:
        return ErrorCodes.INTERNAL_ERROR;
    }
  }
}
