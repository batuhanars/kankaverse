import { defineStore } from 'pinia'
import { ref } from 'vue'
import { authApi, type LoginPayload, type RegisterPayload } from '@/api/auth'
import { setAccessToken, clearAccessToken } from '@/api/axios'
import type { UserDto, LoginChallengeDto } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserDto | null>(null)
  const ready = ref(false) // uygulama başlangıcında /me kontrolü bitti mi

  async function init() {
    try {
      const res = await authApi.me()
      user.value = res.data
    } catch {
      user.value = null
    } finally {
      ready.value = true
    }
  }

  async function register(payload: RegisterPayload) {
    const res = await authApi.register(payload)
    setAccessToken(res.data.accessToken)
    user.value = res.data.user
  }

  // Sprint 2B: login artık 2FA challenge dönebilir
  async function login(payload: LoginPayload): Promise<LoginChallengeDto | null> {
    const res = await authApi.loginWithChallenge(payload)
    const data = res.data as LoginChallengeDto | { user: UserDto; accessToken: string }
    if ('twoFactorRequired' in data) {
      return data as LoginChallengeDto
    }
    const authData = data as { user: UserDto; accessToken: string }
    setAccessToken(authData.accessToken)
    user.value = authData.user
    return null
  }

  async function loginTwoFa(challengeToken: string, code: string) {
    const res = await authApi.loginTwoFa(challengeToken, code)
    setAccessToken(res.data.accessToken)
    user.value = res.data.user
  }

  async function logout() {
    try {
      await authApi.logout()
    } finally {
      clearAccessToken()
      user.value = null
    }
  }

  const isAuthenticated = () => !!user.value
  const isEmailVerified = () => user.value?.emailVerified === true

  function updateUser(updated: UserDto) {
    user.value = updated
  }

  // Tüm oturum kapatıldığında (hesap silme vb.) API çağrısı olmadan local state temizler
  function clearAuth() {
    clearAccessToken()
    user.value = null
  }

  return { user, ready, init, register, login, loginTwoFa, logout, clearAuth, isAuthenticated, isEmailVerified, updateUser }
})
