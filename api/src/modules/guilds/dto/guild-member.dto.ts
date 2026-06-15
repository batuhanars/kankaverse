import { ApiProperty } from '@nestjs/swagger';
import { GuildRole } from '@prisma/client';

export class RoleSummaryDto {
  @ApiProperty({ example: 'cuid-role' })
  id: string;

  @ApiProperty({ example: 'Moderatör' })
  name: string;

  @ApiProperty({ example: '#FF5733' })
  color: string;

  @ApiProperty({ example: 1 })
  position: number;

  @ApiProperty({ example: false })
  hoist: boolean;
}

export class GuildMemberDto {
  @ApiProperty({ example: 'cuid123' })
  userId: string;

  @ApiProperty({ example: 'kanka42' })
  username: string;

  @ApiProperty({ example: 'https://cdn.example.com/avatar.png', nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ enum: GuildRole, example: GuildRole.MEMBER })
  role: GuildRole;

  /** Üyenin atanmış rolleri; position DESC. @everyone örtük olduğu için burada YER ALMAZ. */
  @ApiProperty({ type: [RoleSummaryDto] })
  roles: RoleSummaryDto[];
}
