import { BadRequestException, type ValidationError } from '@nestjs/common';

export interface FieldError {
  message: string;
  /** class-validator constraint name (isNotEmpty, maxLength…), used to translate the message. */
  constraint: string;
}

/** class-validator errors → { 'path.to.field': first error } so forms can highlight fields. */
export function collectFieldErrors(errors: ValidationError[], parent = ''): Record<string, FieldError> {
  const out: Record<string, FieldError> = {};
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const first = error.constraints ? Object.entries(error.constraints)[0] : undefined;
    if (first) out[path] = { constraint: first[0], message: first[1] };
    if (error.children?.length) Object.assign(out, collectFieldErrors(error.children, path));
  }
  return out;
}

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const fieldErrors = collectFieldErrors(errors);
  const fields = Object.fromEntries(Object.entries(fieldErrors).map(([path, e]) => [path, e.message]));
  const constraints = Object.fromEntries(Object.entries(fieldErrors).map(([path, e]) => [path, e.constraint]));
  return new BadRequestException({ message: Object.values(fields), fields, constraints });
}
