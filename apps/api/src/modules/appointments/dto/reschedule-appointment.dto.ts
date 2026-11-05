import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RescheduleAppointmentDto {
  @ApiProperty({
    example: '2026-11-12T17:00:00.000Z',
    description: 'Nuevo inicio del turno en ISO 8601 con zona horaria',
  })
  @IsISO8601({ strict: true })
  startAt!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Nuevo empleado; si se omite se conserva el actual',
  })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Nuevo servicio; si se omite se conserva el actual',
  })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({ example: 'Reprogramado por el cliente' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;
}
