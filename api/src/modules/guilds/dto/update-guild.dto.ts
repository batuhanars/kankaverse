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

  @ApiPropertyOptional({ example: 'Ortamımıza hoş geldiniz! Burası ne hakkında, kısaca anlat.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Ortam açıklaması en fazla 2000 karakter olabilir.' })
  description?: string;
}
