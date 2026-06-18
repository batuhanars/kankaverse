import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { GuildsModule } from './modules/guilds/guilds.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { MessagesModule } from './modules/messages/messages.module';
import { FriendsModule } from './modules/friends/friends.module';
import { BlocksModule } from './modules/blocks/blocks.module';
import { DmModule } from './modules/dm/dm.module';
import { UsersModule } from './modules/users/users.module';
import { JobsModule } from './common/jobs/jobs.module';
import { InvitesModule } from './modules/invites/invites.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { VoiceModule } from './modules/voice/voice.module';
import { RolesModule } from './modules/roles/roles.module';
import { EventsModule } from './modules/events/events.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { PlatformInvitesModule } from './modules/platform-invites/platform-invites.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    GuildsModule,
    ChannelsModule,
    MessagesModule,
    FriendsModule,
    BlocksModule,
    DmModule,
    UsersModule,
    JobsModule,
    InvitesModule,
    AttachmentsModule,
    ReportsModule,
    ModerationModule,
    CategoriesModule,
    VoiceModule,
    RolesModule,
    EventsModule,
    NotificationsModule,
    DiscoveryModule,
    PlatformInvitesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
