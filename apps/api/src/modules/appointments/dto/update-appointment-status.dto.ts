import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import {
  APPOINTMENT_STATUS_TARGETS,
  type AppointmentStatusTarget,
} from '@turnopro/contracts';

export class UpdateAppointmentStatusDto {
  @ApiProperty({
    enum: APPOINTMENT_STATUS_TARGETS,
    description: 'Estado destino del turno',
  })
  @IsIn(APPOINTMENT_STATUS_TARGETS)
  status!: AppointmentStatusTarget;

  @ApiPropertyOptional({
    example: 'El cliente no se presentó',
    description: 'Motivo, obligatorio para cancelar',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  reason?: string;
}
