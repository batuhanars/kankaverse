import { z } from 'zod'

// C40 sozlesme §2: kredi 1-100000 tam sayi, not <= 200. Bitis tarihi formdan kalkti (sahip karari 2026-10-31).
// Frontend dogrulamasi yalniz UX icindir, otorite backend.

export const aiGrantSchema = z.object({
  userId: z
    .string({ error: 'admin.aiAccess.form.userRequired' })
    .min(1, 'admin.aiAccess.form.userRequired'),
  budgetCredits: z
    .number({ error: 'admin.aiAccess.form.creditsRequired' })
    .int('admin.aiAccess.form.creditsRequired')
    .min(1, 'admin.aiAccess.form.creditsRequired')
    .max(100000, 'admin.aiAccess.form.creditsRequired'),
  note: z.string().trim().max(200, 'admin.aiAccess.form.noteTooLong').optional(),
})

// C47: kredi ayarla. Miktar her zaman pozitif, yon `mode` ile; sunucuya isaretli `deltaCredits` gider.
export const aiGrantAdjustSchema = z.object({
  mode: z.enum(['ADD', 'REDUCE']),
  amount: z
    .number({ error: 'admin.aiAccess.adjust.amountInvalid' })
    .int('admin.aiAccess.adjust.amountInvalid')
    .min(1, 'admin.aiAccess.adjust.amountInvalid')
    .max(100000, 'admin.aiAccess.adjust.amountInvalid'),
  note: z.string().trim().max(200, 'admin.aiAccess.form.noteTooLong').optional(),
})
