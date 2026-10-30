import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedModule } from '../../shared/shared.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VoiceModule } from '../voice/voice.module';
import { MessagesController, PinsController, GuildSearchController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './gateway/messages.gateway';

// SharedModule ModerationService'i export eder — enforcement bağlantısı buradan gelir
// M5a §4 — VoiceModule: `voice:group_call_ring` hedefin ODADA olup olmadığını (§4.4)
// VoiceService.getLiveParticipation ile sorar (LiveKit tarafı, tek doğruluk kaynağı — kopya
// presence sorgusu yazılmadı). VoiceModule → MessagesModule bağımlılığı YOK, döngü riski yok.
@Module({
  imports: [JwtModule.register({}), SharedModule, NotificationsModule, VoiceModule],
  controllers: [MessagesController, PinsController, GuildSearchController],
  providers: [MessagesService, MessagesGateway],
  // C35: WebhooksModule ortak çekirdeği (kapılar, DTO, yayın) bu iki servisten kullanır
  exports: [MessagesService, MessagesGateway],
})
export class MessagesModule {}
