import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

  @ApiProperty({ example: '🛡️', nullable: true })
  unicodeEmoji: string | null;
}

export class GuildMemberDto {
  @ApiProperty({ example: 'cuid123' })
  userId: string;

  @ApiProperty({ example: 'kanka42' })
  username: string;

  @ApiProperty({ example: 'https://cdn.example.com/avatar.png', nullable: true })
  avatarUrl: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.webp', nullable: true })
  avatarAnimatedUrl?: string | null;

  @ApiProperty({ example: 'https://cdn.example.com/banner.png', nullable: true })
  bannerUrl: string | null;

  @ApiProperty({ enum: GuildRole, example: GuildRole.MEMBER })
  role: GuildRole;

  /** Üyenin atanmış rolleri; position DESC. @everyone örtük olduğu için burada YER ALMAZ. */
  @ApiProperty({ type: [RoleSummaryDto] })
  roles: RoleSummaryDto[];

  /** C21: emojisi olan en yüksek pozisyonlu rolün emojisi (tek kaynak sunucu); yoksa null. */
  @ApiProperty({ example: '🛡️', nullable: true })
  roleEmoji: string | null;
}
