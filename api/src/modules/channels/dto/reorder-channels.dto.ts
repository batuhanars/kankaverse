import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class ReorderChannelItem {
  @IsString()
  id: string;

  @IsInt()
  @Min(0)
  position: number;

  // null → kategorisiz; undefined → kategori değişmez; string → o kategoriye taşı
  @IsOptional()
  categoryId?: string | null;
}

export class ReorderChannelsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderChannelItem)
  items: ReorderChannelItem[];
}
