import http from './axios'
import type { UserDto } from '@/types'

export interface RegisterPayload {
  username: string
  email: string
  password: string
  birthDate: string // ISO
}

export interface LoginPayload {
  email: string
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
}
