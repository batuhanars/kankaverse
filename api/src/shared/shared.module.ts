import { Module } from '@nestjs/common';
import { EmailService } from './email/email.service';
import { MembershipService } from './membership/membership.service';
import { PermissionsService } from './permissions/permissions.service';
import { DmPermissionService } from './dm-permission/dm-permission.service';
import { FriendPermissionService } from './friend-permission/friend-permission.service';
import { RealtimeService } from './realtime/realtime.service';
import { PresenceService } from './presence/presence.service';
import { AutomodService } from './automod/automod.service';
import { StorageService } from './storage/storage.service';
import { ModerationService } from './moderation/moderation.service';
import { GuildJoinService } from './guild-join/guild-join.service';

@Module({
  providers: [EmailService, MembershipService, PermissionsService, DmPermissionService, FriendPermissionService, RealtimeService, PresenceService, AutomodService, StorageService, ModerationService, GuildJoinService],
  exports: [EmailService, MembershipService, PermissionsService, DmPermissionService, FriendPermissionService, RealtimeService, PresenceService, AutomodService, StorageService, ModerationService, GuildJoinService],
})
export class SharedModule {}
