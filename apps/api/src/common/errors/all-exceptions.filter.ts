import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { localizeError, localizeFieldError } from '../i18n/error-messages';
import { localeFromHeader } from '../utils/locale';
import { DomainError } from './domain-error';
import { ERROR_CATALOG, ErrorCode } from './error-codes';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

/** Maps database constraint names to domain error codes. */
const CONSTRAINT_ERRORS: Array<[string, ErrorCode]> = [
  ['sessions_no_room_overlap', 'SESSION_ROOM_CONFLICT'],
  ['sessions_no_teacher_overlap', 'SESSION_TEACHER_CONFLICT'],
  ['sessions_time_range_chk', 'SESSION_INVALID_TIME'],
  ['memberships_visits_remaining_chk', 'MEMBERSHIP_BALANCE_NEGATIVE'],
  ['membership_transactions_balance_chk', 'MEMBERSHIP_BALANCE_NEGATIVE'],
  ['bookings_session_id_client_id_active_slot_key', 'BOOKING_ALREADY_BOOKED'],
  ['waitlist_entries_session_id_client_id_active_slot_key', 'WAITLIST_ALREADY_JOINED'],
  ['payments_amount_chk', 'PAYMENT_REFUND_EXCEEDS'],
];

/**
 * Converts every error into the public error envelope. Unknown errors are logged
 * with the request id and reported to the client only as a generic message —
 * technical details never reach end users.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = request?.requestId;

    const { status, body } = this.toResponse(exception);
    body.error.requestId = requestId;
    const locale = localeFromHeader(request?.headers?.['accept-language']);
    body.error.message = localizeError(body.error.message, locale);
    const details = body.error.details as { fields?: Record<string, string>; constraints?: Record<string, string> } | undefined;
    if (details?.fields && locale !== 'en') {
      for (const [path, message] of Object.entries(details.fields)) details.fields[path] = localizeFieldError(message, details.constraints?.[path], locale);
    }
    if (details?.constraints) delete details.constraints;

    if (status >= 500) {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(`[${requestId ?? '-'}] ${request?.method} ${request?.url} → ${status}: ${err.message}`, err.stack);
    }

    if (!response.headersSent) {
      response.status(status).json(body);
    }
  }

  private toResponse(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof DomainError) {
      return {
        status: exception.getStatus(),
        body: { error: { code: exception.code, message: exception.message, details: exception.details } },
      };
    }

    if (exception instanceof ThrottlerException) {
      return this.fromCode('RATE_LIMITED');
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (status === HttpStatus.BAD_REQUEST && typeof payload === 'object' && payload && 'message' in payload) {
        const { message: messages, fields, constraints } = payload as { message: unknown; fields?: Record<string, string>; constraints?: Record<string, string> };
        return {
          status,
          body: {
            error: {
              code: 'VALIDATION_FAILED',
              message: ERROR_CATALOG.VALIDATION_FAILED.message,
              details: { fields: fields ?? {}, constraints, messages: Array.isArray(messages) ? messages.map(String) : [String(messages)] },
            },
          },
        };
      }
      const code = this.codeForStatus(status);
      return { status, body: { error: { code, message: ERROR_CATALOG[code].message } } };
    }

    const constraintCode = this.constraintCode(exception);
    if (constraintCode) return this.fromCode(constraintCode);

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') return this.fromCode('CONFLICT', { fields: exception.meta?.target });
      if (exception.code === 'P2025') return this.fromCode('NOT_FOUND');
      if (exception.code === 'P2034') return this.fromCode('CONFLICT');
      if (exception.code === 'P2003') return this.fromCode('CONFLICT', { reason: 'Related record constraint' });
    }

    return this.fromCode('INTERNAL');
  }

  private constraintCode(exception: unknown): ErrorCode | null {
    if (!(exception instanceof Error)) return null;
    const text = `${exception.message} ${JSON.stringify((exception as { meta?: unknown }).meta ?? '')}`;
    for (const [constraint, code] of CONSTRAINT_ERRORS) {
      if (text.includes(constraint)) return code;
    }
    return null;
  }

  private fromCode(code: ErrorCode, details?: unknown): { status: number; body: ErrorBody } {
    const entry = ERROR_CATALOG[code];
    return { status: entry.status, body: { error: { code, message: entry.message, details } } };
  }

  private codeForStatus(status: number): ErrorCode {
    switch (status) {
      case 401:
        return 'UNAUTHENTICATED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 413:
        return 'FILE_TOO_LARGE';
      case 429:
        return 'RATE_LIMITED';
      default:
        return status >= 500 ? 'INTERNAL' : 'VALIDATION_FAILED';
    }
  }
}
