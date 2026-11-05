import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import {
  MEMBER_STATUS_TARGETS,
  type MemberStatusTarget,
} from '@turnopro/contracts';
import { ROLES, type Role } from '@turnopro/shared';

export class UpdateMemberDto {
  @ApiPropertyOptional({ enum: ROLES, description: 'Nuevo rol del miembro' })
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @ApiPropertyOptional({
    enum: MEMBER_STATUS_TARGETS,
    description: 'Activa o suspende al miembro',
  })
  @IsOptional()
  @IsIn(MEMBER_STATUS_TARGETS)
  status?: MemberStatusTarget;
}
