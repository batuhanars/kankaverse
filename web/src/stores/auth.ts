import { defineStore } from 'pinia'
import { ref } from 'vue'
import { authApi, type LoginPayload, type RegisterPayload } from '@/api/auth'
import { setAccessToken, clearAccessToken } from '@/api/axios'
import { clearResume } from '@/lib/resumeLastScreen'
import { useE2eeStore } from '@/stores/e2ee'
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

  // E1: yeni giriş = yeni oturum zinciri = yeni şifreleme cihazı. Eski oturumdan kalan yerel şifreli
  // depo bu oturuma ait değildir (cihaz kimliği/anahtarı uyuşmaz) ve başka hesaba ait olabilir: silinir.
  const wipeE2ee = () => useE2eeStore().wipe()

  async function register(payload: RegisterPayload) {
    const res = await authApi.register(payload)
    await wipeE2ee()
    setAccessToken(res.data.accessToken)
    user.value = res.data.user
  }

  // Sprint 2B: login artık 2FA challenge dönebilir
  async function login(payload: LoginPayload): Promise<LoginChallengeDto | null> {
    const res = await authApi.loginWithChallenge(payload)
    const data = res.data
    if ('twoFactorRequired' in data) {
      return data
    }
    const authData = data
    await wipeE2ee()
    setAccessToken(authData.accessToken)
    user.value = authData.user
    return null
  }

  async function loginTwoFa(challengeToken: string, code: string) {
    const res = await authApi.loginTwoFa(challengeToken, code)
    await wipeE2ee()
    setAccessToken(res.data.accessToken)
    user.value = res.data.user
  }

  async function logout() {
    try {
      await authApi.logout()
    } finally {
      clearResume(user.value?.id)
      clearAccessToken()
      user.value = null
      await wipeE2ee() // çıkışta tüm yerel şifreli depo silinir (E1 §4)
    }
  }

  const isAuthenticated = () => !!user.value
  const isEmailVerified = () => user.value?.emailVerified === true

  function updateUser(updated: UserDto) {
    user.value = updated
  }

  // Tüm oturum kapatıldığında (hesap silme vb.) API çağrısı olmadan local state temizler
  function clearAuth() {
    clearResume(user.value?.id)
    clearAccessToken()
    user.value = null
    void wipeE2ee()
  }

  return {
    user,
    ready,
    init,
    register,
    login,
    loginTwoFa,
    logout,
    clearAuth,
    isAuthenticated,
    isEmailVerified,
    updateUser,
  }
})
