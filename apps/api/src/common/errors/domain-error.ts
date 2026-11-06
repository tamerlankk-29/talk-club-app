import { HttpException } from '@nestjs/common';
import { ERROR_CATALOG, ErrorCode } from './error-codes';

/**
 * A business-rule violation with a stable code and a user-safe message.
 * Thrown from services; rendered by AllExceptionsFilter as
 * `{ error: { code, message, details, requestId } }`.
 */
export class DomainError extends HttpException {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, options: { message?: string; details?: Record<string, unknown>; status?: number } = {}) {
    const entry = ERROR_CATALOG[code];
    const message = options.message ?? entry.message;
    super({ code, message, details: options.details }, options.status ?? entry.status);
    this.code = code;
    this.details = options.details;
  }
}

export const notFound = (entity: string, details?: Record<string, unknown>) =>
  new DomainError('NOT_FOUND', { message: `${entity} not found.`, details });

export const forbidden = (message?: string) => new DomainError('FORBIDDEN', { message });
