import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SLUG_REGEX,
} from '@turnopro/shared';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterDto {
  @ApiProperty({ example: 'Estudio Aurora', minLength: 2, maxLength: 80 })
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  organizationName!: string;

  @ApiProperty({ example: 'estudio-aurora', minLength: 3, maxLength: 48 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Length(3, 48)
  @Matches(SLUG_REGEX, { message: 'Usa solo minúsculas, números y guiones (ej. mi-negocio)' })
  organizationSlug!: string;

  @ApiProperty({ example: 'Ana Torres', minLength: 2, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({ example: 'ana@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'una-clave-segura-2026', minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'ana@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'una-clave-segura-2026' })
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  @ApiPropertyOptional({
    example: 'estudio-aurora',
    description: 'Solo es necesario si el correo pertenece a más de una organización.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsString()
  @Length(3, 48)
  @Matches(SLUG_REGEX, { message: 'Usa solo minúsculas, números y guiones (ej. mi-negocio)' })
  organizationSlug?: string;
}
