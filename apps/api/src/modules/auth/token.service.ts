import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@turnopro/shared';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { AppConfigService } from '../../config/app-config.service';
import type { AccessTokenPayload } from '../../common/types/authenticated-request';

export interface RefreshTokenMaterial {
  id: string;
  familyId: string;
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async issueAccessToken(input: {
    userId: string;
    organizationId: string;
    membershipId: string;
    role: Role;
  }): Promise<{ accessToken: string; expiresIn: number }> {
    const payload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
      sub: input.userId,
      org: input.organizationId,
      mid: input.membershipId,
      role: input.role,
      type: 'access',
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.jwtAccessSecret,
      algorithm: 'HS256',
      expiresIn: this.config.jwtAccessTtlSeconds,
    });

    return { accessToken, expiresIn: this.config.jwtAccessTtlSeconds };
  }

  createRefreshToken(familyId: string = randomUUID()): RefreshTokenMaterial {
    const id = randomUUID();
    const token = randomBytes(48).toString('base64url');

    return {
      id,
      familyId,
      token,
      tokenHash: this.hashRefreshToken(token),
      expiresAt: new Date(Date.now() + this.config.refreshTokenTtlMs),
    };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
