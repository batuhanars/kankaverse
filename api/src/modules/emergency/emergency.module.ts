import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedModule } from '../../shared/shared.module';
import { VoiceModule } from '../voice/voice.module';
import { EmergencyController } from './emergency.controller';
import { EmergencyService } from './emergency.service';

// SharedModule → RealtimeService (platform WS alarmı). VoiceModule → VoiceService (self-pull + bağlam).
// PrismaModule global. JwtModule → JwtAuthGuard.
@Module({
  imports: [JwtModule.register({}), SharedModule, VoiceModule],
  controllers: [EmergencyController],
  providers: [EmergencyService],
})
export class EmergencyModule {}
