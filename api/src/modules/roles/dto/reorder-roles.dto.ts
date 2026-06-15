import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';

export class ReorderRoleItem {
  @ApiProperty({ example: 'role-abc123' })
  @IsString()
  id: string;

  @ApiProperty({ example: 1, minimum: 0 })
  @IsInt()
  @Min(0)
  position: number;
}

export class ReorderRolesDto {
  @ApiProperty({ type: [ReorderRoleItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderRoleItem)
  items: ReorderRoleItem[];
}
