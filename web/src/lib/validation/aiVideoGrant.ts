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
