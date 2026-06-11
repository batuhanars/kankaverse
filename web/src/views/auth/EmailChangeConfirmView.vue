<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import KvButton from '@/components/ui/KvButton.vue'
import logoDikey from '@/assets/brand/kankaverse-logo-dikey.png'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

type State = 'loading' | 'success' | 'error'
const state = ref<State>('loading')

onMounted(async () => {
  const token = route.query.token as string | undefined
  if (!token) { state.value = 'error'; return }
  try {
    const res = await authApi.confirmEmailChange(token)
    auth.updateUser(res.data.user)
    state.value = 'success'
  } catch {
    state.value = 'error'
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center" style="background-color: var(--kv-bg-rail);">
    <div class="w-full max-w-sm rounded-[var(--kv-radius-lg)] p-8 text-center" style="background-color: var(--kv-bg-sidebar);">
      <img :src="logoDikey" :alt="t('brand.name')" class="mx-auto mb-6" style="width: 120px;" />

      <template v-if="state === 'loading'">
        <p class="text-[15px]" style="color: var(--kv-text-secondary);">{{ t('common.loading') }}</p>
      </template>

      <template v-else-if="state === 'success'">
        <h1 class="text-[20px] font-semibold mb-2" style="color: var(--kv-text-primary);">{{ t('emailChange.confirmTitle') }}</h1>
        <p class="text-[14px] mb-6" style="color: var(--kv-text-secondary);">{{ t('emailChange.confirmSuccess') }}</p>
        <KvButton class="w-full" @click="auth.isAuthenticated() ? router.push({ name: 'app' }) : router.push({ name: 'login' })">
          {{ auth.isAuthenticated() ? t('emailChange.goToApp') : t('emailChange.goToLogin') }}
        </KvButton>
      </template>

      <template v-else>
        <h1 class="text-[20px] font-semibold mb-2" style="color: var(--kv-text-primary);">{{ t('emailChange.confirmTitle') }}</h1>
        <p class="text-[14px] mb-6" style="color: var(--kv-danger);">{{ t('emailChange.confirmError') }}</p>
        <KvButton variant="ghost" class="w-full" @click="router.push({ name: 'login' })">{{ t('emailChange.goToLogin') }}</KvButton>
      </template>
    </div>
  </div>
</template>
