import { z } from 'zod'

// C40 sozlesme §2: kredi 1-100000 tam sayi, not <= 200. Bitis tarihi YYYY-MM-DD (bos = suresiz).
// Frontend dogrulamasi yalniz UX icindir, otorite backend.

/** Secilen gunun yerel 23:59:59'u (bitis o gunun sonunda dolar). */
export function endOfLocalDay(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59)
}

export const aiGrantSchema = z.object({
  userId: z
    .string({ error: 'admin.aiAccess.form.userRequired' })
    .min(1, 'admin.aiAccess.form.userRequired'),
  budgetCredits: z
    .number({ error: 'admin.aiAccess.form.creditsRequired' })
    .int('admin.aiAccess.form.creditsRequired')
    .min(1, 'admin.aiAccess.form.creditsRequired')
    .max(100000, 'admin.aiAccess.form.creditsRequired'),
  expiresOn: z
    .string()
    .optional()
    .refine((v) => !v || endOfLocalDay(v).getTime() > Date.now(), 'admin.aiAccess.form.expiryPast'),
  note: z.string().trim().max(200, 'admin.aiAccess.form.noteTooLong').optional(),
})
