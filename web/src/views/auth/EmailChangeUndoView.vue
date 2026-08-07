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
    await authApi.undoEmailChange(token)
    // Tüm oturumlar düşürüldü — local auth'u temizle
    auth.clearAuth()
    state.value = 'success'
  } catch {
    state.value = 'error'
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center" style="background-color: var(--kv-bg-rail);">
    <div class="w-full max-w-sm rounded-[var(--kv-radius-lg)] p-8 text-center" style="background-color: var(--kv-bg-sidebar); border: 1px solid var(--kv-border-subtle); border-top: 3px solid var(--kv-accent-500);">
      <img :src="logoDikey" :alt="t('brand.name')" class="mx-auto mb-6" style="width: 120px;" />

      <template v-if="state === 'loading'">
        <p class="text-[15px]" style="color: var(--kv-text-secondary);">{{ t('common.loading') }}</p>
      </template>

      <template v-else-if="state === 'success'">
        <h1 class="text-[20px] font-semibold mb-2" style="color: var(--kv-text-primary);">{{ t('emailChange.undoTitle') }}</h1>
        <p class="text-[14px] mb-6" style="color: var(--kv-text-secondary);">{{ t('emailChange.undoSuccess') }}</p>
        <KvButton class="w-full" @click="router.push({ name: 'login' })">{{ t('emailChange.goToLogin') }}</KvButton>
      </template>

      <template v-else>
        <h1 class="text-[20px] font-semibold mb-2" style="color: var(--kv-text-primary);">{{ t('emailChange.undoTitle') }}</h1>
        <p class="text-[14px] mb-6" style="color: var(--kv-danger);">{{ t('emailChange.undoError') }}</p>
        <KvButton variant="ghost" class="w-full" @click="router.push({ name: 'login' })">{{ t('emailChange.goToLogin') }}</KvButton>
      </template>
    </div>
  </div>
</template>
