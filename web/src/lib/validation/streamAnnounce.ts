import { z } from 'zod'

// C36 sozlesme §4: duyuru kanali zorunlu, rol istege bagli. Frontend dogrulamasi yalniz UX icindir, otorite backend.
export const streamAnnounceSchema = z.object({
  channelId: z
    .string({ error: 'streamAnnounce.validation.channelRequired' })
    .min(1, 'streamAnnounce.validation.channelRequired'),
  mentionRoleId: z.string().nullable().optional(),
  enabled: z.boolean(),
})
