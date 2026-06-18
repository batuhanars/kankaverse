import { z } from 'zod'

// Contract §4 sabitleri: username 3-32 [a-zA-Z0-9_], password ≥8, email format, birthDate geçerli.
// Zod v4: `required_error` kaldırıldı → `{ error: 'key' }` undefined (type hatası) için,
// `.min(1, 'key')` ise boş string için gerekli. Her iki durumu da i18n anahtarıyla yakala.

export const loginSchema = z.object({
  // Tek alan: kullanıcı adı VEYA e-posta (format zorunlu değil — backend ayırır)
  identifier: z
    .string({ error: 'auth.validation.identifierRequired' })
    .min(1, 'auth.validation.identifierRequired'),
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
  // Sprint Kapalı-Kayıt: invite modda 8-char zorunlu, open/diğer modlarda opsiyonel.
  // Zorunluluk RegisterView'da mode bilgisine göre dinamik Zod şemasıyla kontrol edilir.
  inviteCode: z.string().optional(),
})

// invite modunda inviteCode zorunlu (8 karakter), diğer modlarda opsiyonel
export function makeRegisterSchema(mode: 'open' | 'invite' | 'closed') {
  if (mode === 'invite') {
    return registerSchema.extend({
      inviteCode: z
        .string({ error: 'register.invite.validation.required' })
        .min(1, 'register.invite.validation.required')
        .length(8, 'register.invite.validation.length'),
    })
  }
  return registerSchema
}

// Sprint 2A — şifre sıfırlama şemaları
export const forgotPasswordSchema = z.object({
  email: z
    .string({ error: 'auth.validation.emailRequired' })
    .min(1, 'auth.validation.emailRequired')
    .email('auth.validation.emailInvalid'),
})

export const resetPasswordSchema = z.object({
  newPassword: z
    .string({ error: 'auth.validation.newPasswordRequired' })
    .min(1, 'auth.validation.newPasswordRequired')
    .min(8, 'auth.validation.newPasswordMin'),
})

// Sprint 2B — güvenlik ayarları şemaları
export const changePasswordSchema = z.object({
  currentPassword: z
    .string({ error: 'reauth.validation.passwordRequired' })
    .min(1, 'reauth.validation.passwordRequired'),
  newPassword: z
    .string({ error: 'auth.validation.newPasswordRequired' })
    .min(1, 'auth.validation.newPasswordRequired')
    .min(8, 'auth.validation.newPasswordMin'),
  totpCode: z.string().optional(),
})

export const changeEmailSchema = z.object({
  currentPassword: z
    .string({ error: 'reauth.validation.passwordRequired' })
    .min(1, 'reauth.validation.passwordRequired'),
  newEmail: z
    .string({ error: 'security.email.validation.newEmailRequired' })
    .min(1, 'security.email.validation.newEmailRequired')
    .email('security.email.validation.newEmailInvalid'),
  totpCode: z.string().optional(),
})

export const changeUsernameSchema = z.object({
  currentPassword: z
    .string({ error: 'reauth.validation.passwordRequired' })
    .min(1, 'reauth.validation.passwordRequired'),
  newUsername: z
    .string({ error: 'security.username.validation.required' })
    .min(3, 'security.username.validation.min')
    .max(32, 'security.username.validation.max')
    .regex(/^[a-zA-Z0-9_]+$/, 'security.username.validation.pattern'),
  totpCode: z.string().optional(),
})

export type LoginFormValues = z.infer<typeof loginSchema>
export type RegisterFormValues = z.infer<typeof registerSchema>
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>
