import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PlatformUsersController } from './platform-users.controller';
import { PlatformUsersService } from './platform-users.service';
import { FunnelController } from './funnel.controller';
import { FunnelService } from './funnel.service';

@Module({
  imports: [SharedModule],
  controllers: [PlatformUsersController, FunnelController],
  providers: [PlatformUsersService, FunnelService],
})
export class PlatformUsersModule {}
