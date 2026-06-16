import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Denetim kaydındaki kullanıcı özeti (actor veya targetUser). */
export class AuditLogUserDto {
  @ApiProperty({ example: 'cuid123' })
  id: string;

  @ApiProperty({ example: 'kanka42' })
  username: string;

  @ApiProperty({ example: 'https://cdn.example.com/avatar.png', nullable: true })
  avatarUrl: string | null;
}

/** GET /guilds/:id/audit-logs — tek denetim kaydı satırı. */
export class AuditLogEntryDto {
  @ApiProperty({ example: 'cuid-audit' })
  id: string;

  @ApiProperty({ example: 'guild.member_kicked' })
  action: string;

  @ApiProperty({ example: 'GuildMember' })
  entityType: string;

  @ApiProperty({ example: 'cuid-entity' })
  entityId: string;

  @ApiProperty({ example: '2026-06-16T18:42:00.000Z' })
  createdAt: string;

  @ApiProperty({ type: AuditLogUserDto })
  actor: AuditLogUserDto;

  @ApiPropertyOptional({ type: AuditLogUserDto, nullable: true })
  targetUser: AuditLogUserDto | null;

  @ApiPropertyOptional({ example: 'Kural ihlali', nullable: true })
  reason: string | null;
}
