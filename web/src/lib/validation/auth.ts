import { z } from 'zod'

// Contract §4 sabitleri: username 3-32 [a-zA-Z0-9_], password ≥8, email format, birthDate geçerli.
// Zod v4: `required_error` kaldırıldı → `{ error: 'key' }` undefined (type hatası) için,
// `.min(1, 'key')` ise boş string için gerekli. Her iki durumu da i18n anahtarıyla yakala.

export const loginSchema = z.object({
  email: z
    .string({ error: 'auth.validation.emailRequired' })
    .min(1, 'auth.validation.emailRequired')
    .email('auth.validation.emailInvalid'),
  password: z
    .string({ error: 'auth.validation.passwordRequired' })
    .min(1, 'auth.validation.passwordRequired')
    .min(8, 'auth.validation.passwordMin'),
})

export const registerSchema = z.object({
  email: z
    .string({ error: 'auth.validation.emailRequired' })
    .min(1, 'auth.validation.emailRequired')
    .email('auth.validation.emailInvalid'),
  username: z
    .string({ error: 'auth.validation.usernameRequired' })
    .min(1, 'auth.validation.usernameRequired')
    .min(3, 'auth.validation.usernameMin')
    .max(32, 'auth.validation.usernameMax')
    .regex(/^[a-zA-Z0-9_]+$/, 'auth.validation.usernamePattern'),
  password: z
    .string({ error: 'auth.validation.passwordRequired' })
    .min(1, 'auth.validation.passwordRequired')
    .min(8, 'auth.validation.passwordMin'),
  birthDate: z
    .string({ error: 'auth.validation.birthDateRequired' })
    .min(1, 'auth.validation.birthDateRequired')
    .refine((val) => !isNaN(new Date(val).getTime()), 'auth.validation.birthDateInvalid'),
})

export type LoginFormValues = z.infer<typeof loginSchema>
export type RegisterFormValues = z.infer<typeof registerSchema>
