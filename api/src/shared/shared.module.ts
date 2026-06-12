import { Module } from '@nestjs/common';
import { EmailService } from './email/email.service';
import { MembershipService } from './membership/membership.service';
import { DmPermissionService } from './dm-permission/dm-permission.service';
import { RealtimeService } from './realtime/realtime.service';

@Module({
  providers: [EmailService, MembershipService, DmPermissionService, RealtimeService],
  exports: [EmailService, MembershipService, DmPermissionService, RealtimeService],
})
export class SharedModule {}
