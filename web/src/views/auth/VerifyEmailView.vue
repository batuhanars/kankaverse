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
  if (!token) {
    state.value = 'error'
    return
  }
  try {
    const res = await authApi.verifyEmail(token)
    auth.updateUser(res.data.user)
    state.value = 'success'
  } catch {
    state.value = 'error'
  }
})

function goNext() {
  if (auth.isAuthenticated()) {
    router.push({ name: 'app' })
  } else {
    router.push({ name: 'login' })
  }
}
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center"
    style="background-color: var(--kv-bg-rail);"
  >
    <div
      class="w-full max-w-sm rounded-[var(--kv-radius-lg)] p-8 text-center"
      style="background-color: var(--kv-bg-sidebar); border: 1px solid var(--kv-border-subtle); border-top: 3px solid var(--kv-accent-500);"
    >
      <img
        :src="logoDikey"
        :alt="t('brand.name')"
        class="mx-auto mb-6"
        style="width: 120px; height: auto;"
      />

      <!-- Yükleniyor -->
      <template v-if="state === 'loading'">
        <p class="text-[15px]" style="color: var(--kv-text-secondary);">{{ t('common.loading') }}</p>
      </template>

      <!-- Başarı -->
      <template v-else-if="state === 'success'">
        <h1 class="text-[20px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('emailVerification.verifyTitle') }}
        </h1>
        <p class="text-[14px] mb-6" style="color: var(--kv-text-secondary);">
          {{ t('emailVerification.verifySuccess') }}
        </p>
        <KvButton class="w-full" @click="goNext">
          {{ auth.isAuthenticated() ? t('emailVerification.goToApp') : t('emailVerification.goToLogin') }}
        </KvButton>
      </template>

      <!-- Hata -->
      <template v-else>
        <h1 class="text-[20px] font-semibold mb-2" style="color: var(--kv-text-primary);">
          {{ t('emailVerification.verifyTitle') }}
        </h1>
        <p class="text-[14px] mb-6" style="color: var(--kv-danger);">
          {{ t('emailVerification.verifyError') }}
        </p>
        <div class="flex flex-col gap-3">
          <RouterLink
            :to="{ name: 'app' }"
            v-if="auth.isAuthenticated()"
            class="text-[13px]"
            style="color: var(--kv-accent-500);"
          >
            {{ t('emailVerification.resendLink') }}
          </RouterLink>
          <KvButton variant="ghost" @click="router.push({ name: 'login' })">
            {{ t('emailVerification.goToLogin') }}
          </KvButton>
        </div>
      </template>
    </div>
  </div>
</template>
