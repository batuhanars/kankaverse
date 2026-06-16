import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

// R11 — Taşı gövdesi. Hedef ses kanalı id'si.
export class MoveParticipantDto {
  @ApiProperty({ description: 'Taşınacak hedef GUILD_VOICE kanal id' })
  @IsString()
  @IsNotEmpty()
  targetChannelId!: string;
}
