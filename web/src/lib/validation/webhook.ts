import { z } from 'zod'

// C35 sozlesme §4: webhook adi 1-32 karakter (sunucu CreateWebhookDto ile ayni sinir); kanal zorunlu.
// Frontend dogrulamasi yalniz UX icindir, otorite backend.
export const webhookSchema = z.object({
  name: z
    .string({ error: 'webhooks.validation.nameRequired' })
    .trim()
    .min(1, 'webhooks.validation.nameRequired')
    .max(32, 'webhooks.validation.nameTooLong'),
  channelId: z
    .string({ error: 'webhooks.validation.channelRequired' })
    .min(1, 'webhooks.validation.channelRequired'),
})
