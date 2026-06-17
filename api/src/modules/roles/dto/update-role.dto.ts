import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateRoleDto } from './create-role.dto';

export class UpdateRoleDto extends PartialType(CreateRoleDto) {
  @ApiPropertyOptional({ example: true, description: 'Yeni üyelere otomatik atanan varsayılan rol (guild başına tek)' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
