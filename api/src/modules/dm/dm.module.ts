import { Module } from '@nestjs/common';
import { DmController } from './dm.controller';
import { DmService } from './dm.service';
import { DmGroupEventsService } from './dm-group-events.service';
import { SharedModule } from '../../shared/shared.module';
import { E2eeModule } from '../e2ee/e2ee.module';
import { VoiceModule } from '../voice/voice.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [SharedModule, E2eeModule, VoiceModule, NotificationsModule], // C62 §2.3.d: LiveKit düşürme · C75: istek bildirimi okundu
  controllers: [DmController],
  providers: [DmService, DmGroupEventsService],
})
export class DmModule {}
