import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

// OWNER'a set EDİLEMEZ — sahiplik devri kapsam dışı (Sprint F).
// Bu enum yalnız ADMIN|MEMBER içerir; OWNER gelmesi DTO doğrulamasında bloklanır.
export enum AssignableGuildRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: AssignableGuildRole, example: AssignableGuildRole.ADMIN })
  @IsEnum(AssignableGuildRole, { message: 'Rol yalnızca ADMIN veya MEMBER olabilir.' })
  role: AssignableGuildRole;
}
