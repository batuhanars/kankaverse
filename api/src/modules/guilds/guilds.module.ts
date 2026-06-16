import { Module } from '@nestjs/common';
import { GuildsController } from './guilds.controller';
import { GuildsService } from './guilds.service';
import { SharedModule } from '../../shared/shared.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvitesModule } from '../invites/invites.module';

@Module({
  imports: [SharedModule, NotificationsModule, InvitesModule],
  controllers: [GuildsController],
  providers: [GuildsService],
})
export class GuildsModule {}
