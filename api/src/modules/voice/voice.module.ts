import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedModule } from '../../shared/shared.module';
import { VoiceController, VoiceWebhookController } from './voice.controller';
import { VoiceService } from './voice.service';

// SharedModule MembershipService + RealtimeService export eder (erişim kapısı + WS yayını).
@Module({
  imports: [JwtModule.register({}), SharedModule],
  controllers: [VoiceController, VoiceWebhookController],
  providers: [VoiceService],
})
export class VoiceModule {}
