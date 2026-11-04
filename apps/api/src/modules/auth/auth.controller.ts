import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import type { AuthContext, AuthSession } from '@turnopro/contracts';
import { AppError, ErrorCode, REFRESH_COOKIE_NAME } from '@turnopro/shared';

import { CurrentSession } from '../../common/decorators/current-session.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OriginGuard } from '../../common/guards/origin.guard';
import type {
  AuthenticatedRequest,
  SessionMembership,
  SessionUser,
} from '../../common/types/authenticated-request';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { RefreshCookieService } from './refresh-cookie.service';

function requestMetadata(request: Request) {
  let ip: string | undefined;
  try {
    ip = request.ip;
  } catch {
    ip = undefined;
  }
  const userAgent = request.headers['user-agent'];
  return {
    ip: ip?.slice(0, 64),
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : undefined,
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: RefreshCookieService,
  ) {}

  @Public()
  @Post('register')
  @Header('Cache-Control', 'no-store')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Crea una organización y su usuario propietario' })
  @ApiResponse({ status: 201, description: 'Sesión creada' })
  @ApiResponse({ status: 409, description: 'Correo o identificador ya registrado' })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSession> {
    const result = await this.auth.register(dto, requestMetadata(request));
    this.cookies.set(response, result.refreshToken, result.refreshExpiresAt);
    return result.session;
  }

  @Public()
  @Post('login')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Inicia sesión y emite un access token + refresh cookie' })
  @ApiResponse({ status: 200, description: 'Sesión creada' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiResponse({ status: 409, description: 'Se requiere seleccionar una organización' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSession> {
    const result = await this.auth.login(dto, requestMetadata(request));
    this.cookies.set(response, result.refreshToken, result.refreshExpiresAt);
    return result.session;
  }

  @Public()
  @UseGuards(OriginGuard)
  @Post('refresh')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rota el refresh token y emite un nuevo access token' })
  @ApiResponse({ status: 200, description: 'Sesión renovada' })
  @ApiResponse({ status: 401, description: 'Refresh token inválido, expirado o reutilizado' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSession> {
    try {
      const result = await this.auth.refresh(
        request.cookies?.[REFRESH_COOKIE_NAME],
        requestMetadata(request),
      );
      this.cookies.set(response, result.refreshToken, result.refreshExpiresAt);
      return result.session;
    } catch (error) {
      if (
        error instanceof AppError &&
        (error.code === ErrorCode.TOKEN_REUSED ||
          error.code === ErrorCode.REFRESH_TOKEN_INVALID)
      ) {
        this.cookies.clear(response);
      }
      throw error;
    }
  }

  @Public()
  @UseGuards(OriginGuard)
  @Post('logout')
  @Header('Cache-Control', 'no-store')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Revoca la familia de refresh tokens y borra la cookie' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(
      request.cookies?.[REFRESH_COOKIE_NAME],
      requestMetadata(request),
    );
    this.cookies.clear(response);
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Devuelve el usuario, organización y permisos de la sesión' })
  me(
    @CurrentSession()
    session: {
      user: SessionUser;
      membership: SessionMembership;
      organization: AuthenticatedRequest['organization'];
    },
  ): AuthContext {
    return this.auth.me({
      user: session.user,
      membership: session.membership,
      organization: session.organization,
    });
  }
}
