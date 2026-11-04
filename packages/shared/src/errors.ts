export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  SLUG_TAKEN: 'SLUG_TAKEN',
  ORGANIZATION_REQUIRED: 'ORGANIZATION_REQUIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  MEMBERSHIP_INACTIVE: 'MEMBERSHIP_INACTIVE',
  ORGANIZATION_INACTIVE: 'ORGANIZATION_INACTIVE',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  TOKEN_REUSED: 'TOKEN_REUSED',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  BOOKING_SLOT_UNAVAILABLE: 'BOOKING_SLOT_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
    timestamp: string;
    path?: string;
  };
}

/**
 * Error de dominio controlado. El filtro global lo traduce a la
 * envoltura HTTP estándar sin filtrar detalles internos.
 */
export class AppError extends Error {
  override readonly name = 'AppError';

  constructor(
    readonly code: ErrorCode,
    readonly statusCode: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
