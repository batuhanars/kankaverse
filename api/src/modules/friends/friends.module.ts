import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';

@Module({
  imports: [SharedModule, NotificationsModule],
  controllers: [FriendsController],
  providers: [FriendsService],
})
export class FriendsModule {}
