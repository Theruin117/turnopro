import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { APPOINTMENT_STATUSES, type AppointmentStatus } from '@turnopro/contracts';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@turnopro/shared';

export class AppointmentsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @IsOptional()
  @IsEnum(APPOINTMENT_STATUSES)
  status?: AppointmentStatus;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;
}
