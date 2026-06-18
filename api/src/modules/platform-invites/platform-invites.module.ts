import { Module } from '@nestjs/common';
import { PlatformInvitesController } from './platform-invites.controller';
import { PlatformInvitesService } from './platform-invites.service';

@Module({
  controllers: [PlatformInvitesController],
  providers: [PlatformInvitesService],
  exports: [PlatformInvitesService],
})
export class PlatformInvitesModule {}
