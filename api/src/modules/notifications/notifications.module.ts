import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

// NotificationsService friends/messages tarafından kullanılır → export edilir.
// PrismaService (global PrismaModule) + RealtimeService (SharedModule) inject edilir.
@Module({
  imports: [SharedModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
