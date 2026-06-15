import { ApiProperty } from '@nestjs/swagger';

export class RoleDto {
  @ApiProperty({ example: 'cuid123' })
  id: string;

  @ApiProperty({ example: 'guild-abc' })
  guildId: string;

  @ApiProperty({ example: 'Moderatör' })
  name: string;

  @ApiProperty({ example: '#FF5733' })
  color: string;

  @ApiProperty({ example: 1 })
  position: number;

  @ApiProperty({ example: false })
  hoist: boolean;

  @ApiProperty({ example: false })
  mentionable: boolean;

  @ApiProperty({ example: ['VIEW_CHANNELS', 'CREATE_INVITE'], type: [String] })
  permissions: string[];

  @ApiProperty({ example: null, nullable: true })
  iconUrl: string | null;

  @ApiProperty({ example: false })
  isEveryone: boolean;

  @ApiProperty({ example: 5 })
  memberCount: number;
}
