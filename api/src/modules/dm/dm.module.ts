import { Module } from '@nestjs/common';
import { DmController } from './dm.controller';
import { DmService } from './dm.service';
import { DmGroupEventsService } from './dm-group-events.service';
import { SharedModule } from '../../shared/shared.module';
import { E2eeModule } from '../e2ee/e2ee.module';
import { VoiceModule } from '../voice/voice.module';

@Module({
  imports: [SharedModule, E2eeModule, VoiceModule], // C62 §2.3.d: ayrılan/çıkarılan LiveKit'ten düşürülür
  controllers: [DmController],
  providers: [DmService, DmGroupEventsService],
})
export class DmModule {}
