import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';

export class ReorderCategoryItem {
  @IsString()
  id: string;

  @IsInt()
  @Min(0)
  position: number;
}

export class ReorderCategoriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderCategoryItem)
  items: ReorderCategoryItem[];
}
