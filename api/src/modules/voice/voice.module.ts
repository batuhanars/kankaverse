import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedModule } from '../../shared/shared.module';
import {
  VoiceController,
  VoiceModerationController,
  VoiceWebhookController,
  VoiceInspectController,
} from './voice.controller';
import { VoiceCallsController } from './voice-calls.controller';
import { VoiceService } from './voice.service';
import { E2eeFlagService } from '../e2ee/e2ee-flag.service';

// SharedModule MembershipService + RealtimeService export eder (erişim kapısı + WS yayını).
@Module({
  imports: [JwtModule.register({}), SharedModule],
  controllers: [
    VoiceController,
    VoiceModerationController,
    VoiceWebhookController,
    VoiceInspectController,
    VoiceCallsController,
  ],
  // E2eeFlagService yalnız ConfigService'e bağlı; diğer modüller gibi doğrudan sağlanır (E8 §3.5).
  providers: [VoiceService, E2eeFlagService],
  exports: [VoiceService], // A4: EmergencyModule self-pull + bağlam yakalama için VoiceService'i kullanır
})
export class VoiceModule {}
