import { Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';

import { REFRESH_COOKIE_NAME } from '@turnopro/shared';

import { AppConfigService } from '../../config/app-config.service';

@Injectable()
export class RefreshCookieService {
  private readonly baseOptions: CookieOptions;

  constructor(private readonly config: AppConfigService) {
    this.baseOptions = {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'lax',
      domain: config.cookieDomain,
      path: `/${config.apiPrefix}/auth`,
    };
  }

  set(response: Response, token: string, expiresAt: Date): void {
    response.cookie(REFRESH_COOKIE_NAME, token, {
      ...this.baseOptions,
      expires: expiresAt,
    });
  }

  clear(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, this.baseOptions);
  }
}
