<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import KvInput from '@/components/ui/KvInput.vue'
import KvButton from '@/components/ui/KvButton.vue'
import logoDikey from '@/assets/brand/kankaverse-logo-dikey.png'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const challengeToken = ref('')
const code = ref('')
const loading = ref(false)
const apiError = ref('')
const useRecovery = ref(false)

onMounted(() => {
  challengeToken.value = sessionStorage.getItem('kv_2fa_challenge') ?? ''
  if (!challengeToken.value) {
    router.replace({ name: 'login' })
  }
})

async function submit() {
  if (!code.value.trim()) return
  loading.value = true
  apiError.value = ''
  try {
    await auth.loginTwoFa(challengeToken.value, code.value.trim())
    sessionStorage.removeItem('kv_2fa_challenge')
    await router.push({ name: 'app' })
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    apiError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center"
    style="background-color: var(--kv-bg-rail);"
  >
    <div
      class="w-full max-w-sm rounded-[var(--kv-radius-lg)] p-8"
      style="background-color: var(--kv-bg-sidebar);"
    >
      <div class="mb-6 text-center">
        <img :src="logoDikey" :alt="t('brand.name')" class="mx-auto mb-5" style="width: 120px;" />
        <h1 class="text-[22px] font-semibold" style="color: var(--kv-text-primary);">
          {{ t('twoFactorLogin.title') }}
        </h1>
        <p class="mt-1 text-[13px]" style="color: var(--kv-text-muted);">
          {{ useRecovery ? t('twoFactorLogin.recoverySubtitle') : t('twoFactorLogin.subtitle') }}
        </p>
      </div>

      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <KvInput
          v-model="code"
          :label="useRecovery ? t('twoFactorLogin.recoveryCode') : t('twoFactorLogin.code')"
          :placeholder="useRecovery ? t('twoFactorLogin.recoveryCodePlaceholder') : t('twoFactorLogin.codePlaceholder')"
          autocomplete="one-time-code"
        />

        <p v-if="apiError" class="text-[13px] text-center" style="color: var(--kv-danger);">{{ apiError }}</p>

        <KvButton type="submit" :loading="loading" class="w-full">
          {{ t('twoFactorLogin.submit') }}
        </KvButton>
      </form>

      <div class="mt-4 flex flex-col items-center gap-2">
        <button
          class="text-[13px] cursor-pointer"
          style="color: var(--kv-accent-500);"
          @click="useRecovery = !useRecovery; code = ''"
        >
          {{ useRecovery ? t('twoFactorLogin.useTotp') : t('twoFactorLogin.useRecovery') }}
        </button>
        <RouterLink :to="{ name: 'login' }" class="text-[13px]" style="color: var(--kv-text-muted);">
          {{ t('twoFactorLogin.back') }}
        </RouterLink>
      </div>
    </div>
  </div>
</template>
