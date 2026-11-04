import type { ValidationError } from 'class-validator';

export interface FieldValidationError {
  field: string;
  messages: string[];
  code?: string;
}

function walk(errors: ValidationError[], parent = ''): FieldValidationError[] {
  const result: FieldValidationError[] = [];

  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      result.push({
        field,
        code: error.constraints[Object.keys(error.constraints)[0] ?? ''] ?? undefined,
        messages: Object.values(error.constraints),
      });
    }
    if (error.children && error.children.length > 0) {
      result.push(...walk(error.children, field));
    }
  }

  return result;
}

export function flattenValidationErrors(errors: ValidationError[]): FieldValidationError[] {
  return walk(errors);
}
