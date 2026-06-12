import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';

@Module({
  imports: [SharedModule],
  controllers: [FriendsController],
  providers: [FriendsService],
})
export class FriendsModule {}
