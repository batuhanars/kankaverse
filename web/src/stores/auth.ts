import { defineStore } from 'pinia'
import { ref } from 'vue'
import { authApi, type LoginPayload, type RegisterPayload } from '@/api/auth'
import { setAccessToken, clearAccessToken, announceSignedOut } from '@/api/axios'
import { clearResume } from '@/lib/resumeLastScreen'
import { keepsE2eeDevice } from '@/lib/e2ee/keepDevice'
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
  // C69: masaüstü uygulamasında çıkışta depo korunur; girişte yalnız BAŞKA kullanıcının deposu silinir,
  // aynı kullanıcınınki kalır (motor açılışta park edilmiş cihazı yeniden bağlar, olmazsa kendisi siler).
  const wipeE2eeForLogin = (userId: string) =>
    keepsE2eeDevice() ? useE2eeStore().dropOtherUsers(userId) : useE2eeStore().wipe()
  const wipeE2ee = () => useE2eeStore().wipe()

  async function register(payload: RegisterPayload) {
    const res = await authApi.register(payload)
    await wipeE2eeForLogin(res.data.user.id)
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
    await wipeE2eeForLogin(authData.user.id)
    setAccessToken(authData.accessToken)
    user.value = authData.user
    return null
  }

  async function loginTwoFa(challengeToken: string, code: string) {
    const res = await authApi.loginTwoFa(challengeToken, code)
    await wipeE2eeForLogin(res.data.user.id)
    setAccessToken(res.data.accessToken)
    user.value = res.data.user
  }

  async function logout() {
    const keep = keepsE2eeDevice() // C69: masaüstünde cihaz park edilir, yerel depo silinmez
    try {
      await authApi.logout({ keepE2eeDevice: keep })
    } finally {
      clearResume(user.value?.id)
      clearAccessToken()
      user.value = null
      // Tarayıcı: çıkışta tüm yerel şifreli depo silinir (E1 §4). Masaüstü (C69): motor düşer, depo kalır.
      if (keep) useE2eeStore().release()
      else await wipeE2ee()
      announceSignedOut() // D108: aynı tarayıcıdaki diğer sekmeler giriş ekranına gider
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
