import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty({ format: 'uuid', description: 'Cliente de la organización' })
  @IsUUID()
  clientId!: string;

  @ApiProperty({ format: 'uuid', description: 'Empleado de la organización' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ format: 'uuid', description: 'Servicio de la organización' })
  @IsUUID()
  serviceId!: string;

  @ApiProperty({
    example: '2026-11-10T16:00:00.000Z',
    description: 'Inicio del turno en ISO 8601 con zona horaria',
  })
  @IsISO8601({ strict: true })
  startAt!: string;

  @ApiPropertyOptional({ example: 'Primera visita' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;
}
