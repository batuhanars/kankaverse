import { ApiProperty } from '@nestjs/swagger';
import { GuildRole } from '@prisma/client';

export class GuildMemberDto {
  @ApiProperty({ example: 'cuid123' })
  userId: string;

  @ApiProperty({ example: 'kanka42' })
  username: string;

  @ApiProperty({ example: 'https://cdn.example.com/avatar.png', nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ enum: GuildRole, example: GuildRole.MEMBER })
  role: GuildRole;
}
