import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Genel', description: 'Kategori adı (1-50 karakter)' })
  @IsString()
  @MinLength(1, { message: 'Kategori adı en az 1 karakter olmalıdır.' })
  @MaxLength(50, { message: 'Kategori adı en fazla 50 karakter olabilir.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;
}
