import http from './axios'
import type { UserDto, SessionDto, TwoFactorSetupDto, RecoveryCodesDto, LoginChallengeDto } from '@/types'

export interface RegisterPayload {
  username: string
  email: string
  password: string
  birthDate: string // ISO
}

export interface LoginPayload {
  identifier: string // kullanıcı adı veya e-posta
  password: string
}

export const authApi = {
  register(payload: RegisterPayload) {
    return http.post<{ user: UserDto; accessToken: string }>('/auth/register', payload)
  },
  login(payload: LoginPayload) {
    return http.post<{ user: UserDto; accessToken: string }>('/auth/login', payload)
  },
  refresh() {
    return http.post<{ accessToken: string }>('/auth/refresh')
  },
  logout() {
    return http.post<null>('/auth/logout')
  },
  me() {
    return http.get<UserDto>('/auth/me')
  },
  // Sprint 2A — e-posta doğrulama
  verifyEmail(token: string) {
    return http.post<{ user: UserDto }>('/auth/verify-email', { token })
  },
  resendVerification() {
    return http.post<null>('/auth/resend-verification')
  },
  // Sprint 2A — şifre sıfırlama
  forgotPassword(email: string) {
    return http.post<null>('/auth/forgot-password', { email })
  },
  resetPassword(token: string, newPassword: string) {
    return http.post<null>('/auth/reset-password', { token, newPassword })
  },
  // Sprint 2B — 2FA
  twoFaSetup(currentPassword: string) {
    return http.post<TwoFactorSetupDto>('/auth/2fa/setup', { currentPassword })
  },
  twoFaEnable(code: string) {
    return http.post<RecoveryCodesDto>('/auth/2fa/enable', { code })
  },
  twoFaDisable(currentPassword: string, totpCode: string) {
    return http.post<null>('/auth/2fa/disable', { currentPassword, totpCode })
  },
  loginTwoFa(challengeToken: string, code: string) {
    return http.post<{ user: UserDto; accessToken: string }>('/auth/login/2fa', { challengeToken, code })
  },
  // Sprint 2B — oturumlar
  getSessions() {
    return http.get<SessionDto[]>('/auth/sessions')
  },
  deleteSession(id: string) {
    return http.delete<null>(`/auth/sessions/${id}`)
  },
  revokeOtherSessions() {
    return http.post<null>('/auth/sessions/revoke-others')
  },
  // Sprint 2B — şifre / e-posta değişimi
  changePassword(body: { currentPassword: string; newPassword: string; totpCode?: string }) {
    return http.post<null>('/auth/password/change', body)
  },
  changeEmail(body: { currentPassword: string; newEmail: string; totpCode?: string }) {
    return http.post<null>('/auth/email/change', body)
  },
  confirmEmailChange(token: string) {
    return http.post<{ user: UserDto }>('/auth/email/change/confirm', { token })
  },
  undoEmailChange(token: string) {
    return http.post<null>('/auth/email/change/undo', { token })
  },
  // Sprint 2B — hesap silme
  deleteAccount(body: { currentPassword: string; totpCode?: string }) {
    return http.post<null>('/auth/account/delete', body)
  },
  cancelDeleteAccount() {
    return http.post<null>('/auth/account/delete/cancel')
  },
  // Sprint 2B — login (union dönüşü: normal | 2FA challenge)
  loginWithChallenge(payload: { email: string; password: string }) {
    return http.post<{ user: UserDto; accessToken: string } | LoginChallengeDto>('/auth/login', payload)
  },
}
