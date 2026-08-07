<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { authApi } from '@/api/auth'

const { t } = useI18n()

const loading = ref(false)
const sent = ref(false)
const error = ref('')

async function resend() {
  loading.value = true
  error.value = ''
  try {
    await authApi.resendVerification()
    sent.value = true
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    const code = err.response?.data?.error
    if (code === 'EMAIL_ALREADY_VERIFIED') {
      // Sayfa yenilemeden kullanıcı durumunu yansıtmak için basit yönlendirme yeterli;
      // gerçek güncelleme /me çağrısına bırakıldı (sonraki navigasyonda)
      sent.value = true
    } else {
      error.value = err.response?.data?.message ?? t('common.error')
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="flex items-center justify-between gap-4 px-4 py-2 text-[13px] shrink-0"
    style="background-color: var(--kv-warning-subtle, #3D2E0E); color: var(--kv-warning, #E8A33D); border-bottom: 1px solid var(--kv-border-strong);"
  >
    <span v-if="sent">{{ t('emailVerification.resendSuccess') }}</span>
    <template v-else>
      <span>{{ t('emailVerification.bannerMessage') }}</span>
      <div class="flex items-center gap-3 shrink-0">
        <span v-if="error" style="color: var(--kv-danger);">{{ error }}</span>
        <button
          class="font-medium underline cursor-pointer disabled:opacity-50"
          :disabled="loading"
          @click="resend"
        >
          {{ loading ? t('common.loading') : t('emailVerification.resend') }}
        </button>
      </div>
    </template>
  </div>
</template>
