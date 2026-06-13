import { Module } from '@nestjs/common';
import { EmailService } from './email/email.service';
import { MembershipService } from './membership/membership.service';
import { DmPermissionService } from './dm-permission/dm-permission.service';
import { FriendPermissionService } from './friend-permission/friend-permission.service';
import { RealtimeService } from './realtime/realtime.service';
import { PresenceService } from './presence/presence.service';
import { AutomodService } from './automod/automod.service';
import { StorageService } from './storage/storage.service';

@Module({
  providers: [EmailService, MembershipService, DmPermissionService, FriendPermissionService, RealtimeService, PresenceService, AutomodService, StorageService],
  exports: [EmailService, MembershipService, DmPermissionService, FriendPermissionService, RealtimeService, PresenceService, AutomodService, StorageService],
})
export class SharedModule {}
