import { defineStore } from 'pinia'
import { ref } from 'vue'
import { authApi, type LoginPayload, type RegisterPayload } from '@/api/auth'
import { setAccessToken, clearAccessToken } from '@/api/axios'
import type { UserDto } from '@/types'

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

  async function login(payload: LoginPayload) {
    const res = await authApi.login(payload)
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

  return { user, ready, init, register, login, logout, isAuthenticated, isEmailVerified, updateUser }
})
