import { IsString, IsBoolean, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateGuildDto {
  @ApiPropertyOptional({ example: 'Yeni Ortam Adı' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Ortam adı en az 2 karakter olmalıdır.' })
  @MaxLength(50, { message: 'Ortam adı en fazla 50 karakter olabilir.' })
  name?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  adultsOnly?: boolean;

  @ApiPropertyOptional({ example: 'Sunucumuza hoş geldiniz! Lütfen kurallara uyun.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Ortam kuralları en fazla 2000 karakter olabilir.' })
  rules?: string;
}
