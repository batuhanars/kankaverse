import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { GraphemeLength } from '../../../common/utils/emoji-name.validators';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Genel', description: 'Kategori adı (1-50 karakter)' })
  @IsString()
  @GraphemeLength(1, 50, 'Kategori adı')
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name: string;
}
