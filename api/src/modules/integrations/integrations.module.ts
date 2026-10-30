import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { MessagesModule } from '../messages/messages.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { IntegrationsController } from './integrations.controller';
import { StreamWebhookController } from './stream-webhook.controller';
import { StreamAnnounceController } from './stream-announce.controller';
import { IntegrationsService } from './integrations.service';
import { StreamAnnounceConfigService } from './stream-announce-config.service';
import { StreamAnnouncerService } from './stream-announcer.service';
import { StreamEventsService } from './stream-events.service';
import { StreamReconcileJob } from './stream-reconcile.job';
import { StreamProvidersRegistry } from './stream-providers.registry';
import { KickProvider } from './providers/kick.provider';
import { TwitchProvider } from './providers/twitch.provider';

// C36: sağlayıcıya özgü kod adaptörlerde (providers/), ortak akış tek yerde. Mesaj çekirdeği C35'ten.
@Module({
  imports: [SharedModule, MessagesModule, WebhooksModule],
  controllers: [IntegrationsController, StreamWebhookController, StreamAnnounceController],
  providers: [
    KickProvider,
    TwitchProvider,
    StreamProvidersRegistry,
    IntegrationsService,
    StreamAnnounceConfigService,
    StreamAnnouncerService,
    StreamEventsService,
    StreamReconcileJob,
  ],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
