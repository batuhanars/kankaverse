import { Module } from '@nestjs/common';
import { AdminGuildsController } from './admin-guilds.controller';
import { GuildsController } from './guilds.controller';
import { GuildsService } from './guilds.service';
import { GuildAnimatedMediaService } from './guild-animated-media.service';
import { DiscordImportService } from './discord-import.service';
import { SharedModule } from '../../shared/shared.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvitesModule } from '../invites/invites.module';

@Module({
  imports: [SharedModule, NotificationsModule, InvitesModule],
  controllers: [GuildsController, AdminGuildsController],
  providers: [GuildsService, GuildAnimatedMediaService, DiscordImportService],
})
export class GuildsModule {}
