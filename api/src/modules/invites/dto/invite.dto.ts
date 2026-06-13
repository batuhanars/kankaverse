import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InviteDto {
  @ApiProperty({ example: 'AB3K7PQZ' })
  code: string;

  @ApiProperty({ example: 'clxxxxxxxxxxxxxxxx' })
  guildId: string;

  @ApiPropertyOptional({ example: 10, nullable: true })
  maxUses: number | null;

  @ApiProperty({ example: 0 })
  uses: number;

  @ApiPropertyOptional({ example: '2026-06-20T00:00:00.000Z', nullable: true })
  expiresAt: string | null;

  @ApiProperty({ example: '2026-06-13T00:00:00.000Z' })
  createdAt: string;
}

export class InvitePreviewDto {
  @ApiProperty({ example: 'Oyun Klanı' })
  guildName: string;

  @ApiProperty({ example: false })
  adultsOnly: boolean;

  @ApiProperty({ example: true })
  valid: boolean;
}
