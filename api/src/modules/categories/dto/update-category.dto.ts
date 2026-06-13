import { IsString, MinLength, MaxLength, IsOptional, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Yeni Ad', description: 'Kategori adı (1-50 karakter)' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Kategori adı en az 1 karakter olmalıdır.' })
  @MaxLength(50, { message: 'Kategori adı en fazla 50 karakter olabilir.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @ApiPropertyOptional({ example: 2, description: 'Sıra konumu (0 veya üzeri tam sayı)' })
  @IsOptional()
  @IsInt({ message: 'Konum tam sayı olmalıdır.' })
  @Min(0, { message: 'Konum 0 veya daha büyük olmalıdır.' })
  position?: number;
}
