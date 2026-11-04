import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@turnopro/database';
import type { Response } from 'express';

import { AppError, ErrorCode, type ApiErrorBody } from '@turnopro/shared';

import type { AuthenticatedRequest } from '../types/authenticated-request';

interface HttpErrorLike {
  statusCode?: number;
  message?: string | string[];
  code?: string;
  error?: string;
}

function requestIdOf(request: AuthenticatedRequest): string | undefined {
  const header = request.headers['x-request-id'];
  if (typeof header === 'string' && header.length <= 128) {
    return header;
  }
  return typeof request.id === 'string' ? request.id : undefined;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<AuthenticatedRequest>();
    const requestId = requestIdOf(request);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCode.INTERNAL_ERROR;
    let message = 'Ocurrió un error inesperado';
    let details: unknown;

    if (exception instanceof AppError) {
      status = exception.statusCode;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ status, code, message } = mapPrismaError(exception));
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse() as HttpErrorLike | string;
      if (typeof payload === 'string') {
        message = payload;
      } else {
        message = Array.isArray(payload.message)
          ? payload.message[0] ?? exception.message
          : (payload.message ?? exception.message);
        details = Array.isArray(payload.message) ? payload.message : undefined;
      }
      code = status >= 500 ? ErrorCode.INTERNAL_ERROR : HttpCodeFallback(status);
      if (status >= 500) {
        message = 'Ocurrió un error inesperado';
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Excepción no controlada en ${request.method} ${request.originalUrl ?? request.url}: ${exception.message}`,
        exception.stack,
      );
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl ?? request.url} → ${status} [${requestId ?? 'sin-request-id'}]`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ApiErrorBody = {
      error: {
        code: code as ApiErrorBody['error']['code'],
        message,
        ...(details === undefined ? {} : { details }),
        ...(requestId ? { requestId } : {}),
        timestamp: new Date().toISOString(),
        path: request.originalUrl ?? request.url,
      },
    };

    response.status(status).json(body);
  }
}

function HttpCodeFallback(status: number): string {
  if (status === 401) return ErrorCode.UNAUTHORIZED;
  if (status === 403) return ErrorCode.FORBIDDEN;
  if (status === 404) return ErrorCode.NOT_FOUND;
  if (status === 409) return ErrorCode.CONFLICT;
  if (status === 429) return ErrorCode.RATE_LIMITED;
  return ErrorCode.INTERNAL_ERROR;
}

function mapPrismaError(exception: Prisma.PrismaClientKnownRequestError): {
  status: number;
  code: string;
  message: string;
} {
  switch (exception.code) {
    case 'P2002': {
      const target = exception.meta?.target;
      const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
      if (fields.some((field) => field.includes('email'))) {
        return {
          status: 409,
          code: ErrorCode.EMAIL_TAKEN,
          message: 'Ya existe una cuenta con ese correo electrónico',
        };
      }
      if (fields.some((field) => field.includes('slug'))) {
        return {
          status: 409,
          code: ErrorCode.SLUG_TAKEN,
          message: 'Ese identificador de organización ya está en uso',
        };
      }
      return {
        status: 409,
        code: ErrorCode.CONFLICT,
        message: 'El registro ya existe',
      };
    }
    case 'P2025':
      return { status: 404, code: ErrorCode.NOT_FOUND, message: 'El recurso no existe' };
    case 'P2003':
      return {
        status: 409,
        code: ErrorCode.CONFLICT,
        message: 'La operación viola una referencia existente',
      };
    default:
      return {
        status: 500,
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Ocurrió un error inesperado',
      };
  }
}
