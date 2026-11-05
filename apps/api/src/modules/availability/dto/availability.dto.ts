import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AvailabilitySlotsQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceId!: string;

  @ApiProperty({ example: '2026-11-10', description: 'Fecha local YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Usa una fecha YYYY-MM-DD' })
  date!: string;
}

export class AvailabilityRuleInputDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = domingo, 6 = sábado' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @ApiProperty({ minimum: 0, maximum: 1_439, example: 540 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_439)
  startMinute!: number;

  @ApiProperty({ minimum: 1, maximum: 1_440, example: 1_080 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_440)
  endMinute!: number;
}

export class ReplaceAvailabilityRulesDto {
  @ApiProperty({ type: [AvailabilityRuleInputDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityRuleInputDto)
  rules!: AvailabilityRuleInputDto[];
}

export class TimeOffQueryDto {
  @ApiPropertyOptional({ description: 'Inicio del rango ISO 8601' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ description: 'Fin del rango ISO 8601' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class CreateTimeOffDto {
  @ApiProperty({ example: '2026-11-15T15:00:00.000Z' })
  @IsISO8601({ strict: true })
  startsAt!: string;

  @ApiProperty({ example: '2026-11-15T18:00:00.000Z' })
  @IsISO8601({ strict: true })
  endsAt!: string;

  @ApiPropertyOptional({ example: 'Capacitación' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
