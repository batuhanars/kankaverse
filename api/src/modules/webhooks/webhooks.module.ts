import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { MessagesModule } from '../messages/messages.module';
import { WebhooksController } from './webhooks.controller';
import { WebhookExecController } from './webhook-exec.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookExecService } from './webhook-exec.service';
import { WebhookRateLimiter } from './webhook-rate-limiter';

// C35: kapılar/DTO/yayın çekirdeği MessagesModule'den (MessagesService + MessagesGateway) gelir; kopya yok.
@Module({
  imports: [SharedModule, MessagesModule],
  controllers: [WebhooksController, WebhookExecController],
  providers: [WebhooksService, WebhookExecService, WebhookRateLimiter],
  exports: [WebhooksService], // C36: duyuru göndericisi resolveSender kapısını yeniden kullanır
})
export class WebhooksModule {}
