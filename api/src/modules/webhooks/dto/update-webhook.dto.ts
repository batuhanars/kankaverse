import { PartialType } from '@nestjs/swagger';
import { CreateWebhookDto } from './create-webhook.dto';

/** C35 §4.3: `{ name?, channelId? }` — kanal taşıma aynı ortam içinde. */
export class UpdateWebhookDto extends PartialType(CreateWebhookDto) {}
