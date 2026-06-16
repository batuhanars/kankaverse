import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** POST /guilds/:id/invite-friend — kankayı ortama davet (kalıcı GUILD_INVITE bildirimi). */
export class InviteFriendDto {
  @ApiProperty({ description: 'Davet edilecek kankanın kullanıcı id\'si.' })
  @IsString()
  @IsNotEmpty()
  userId: string;
}
