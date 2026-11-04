import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { RefreshCookieService } from './refresh-cookie.service';
import { TokenService } from './token.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, RefreshCookieService],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
