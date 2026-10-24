import { BadRequestException, type ValidationError } from '@nestjs/common';

/** class-validator errors → { 'path.to.field': 'first message' } so forms can highlight fields. */
export function flattenValidationErrors(errors: ValidationError[], parent = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const first = error.constraints ? Object.values(error.constraints)[0] : undefined;
    if (first) out[path] = first;
    if (error.children?.length) Object.assign(out, flattenValidationErrors(error.children, path));
  }
  return out;
}

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const fields = flattenValidationErrors(errors);
  return new BadRequestException({ message: Object.values(fields), fields });
}
