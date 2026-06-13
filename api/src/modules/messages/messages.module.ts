import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SharedModule } from '../../shared/shared.module';
import { MessagesController, PinsController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './gateway/messages.gateway';

// SharedModule ModerationService'i export eder — enforcement bağlantısı buradan gelir
@Module({
  imports: [JwtModule.register({}), SharedModule],
  controllers: [MessagesController, PinsController],
  providers: [MessagesService, MessagesGateway],
})
export class MessagesModule {}
