<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import KvButton from '@/components/ui/KvButton.vue'
import ReauthModal from '@/components/shared/ReauthModal.vue'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const showConfirm = ref(false)
const showReauth = ref(false)
const reauthLoading = ref(false)
const reauthError = ref('')

async function onReauth(payload: { currentPassword: string; totpCode?: string }) {
  reauthLoading.value = true
  reauthError.value = ''
  try {
    await authApi.deleteAccount({
      currentPassword: payload.currentPassword,
      totpCode: payload.totpCode,
    })
    // Tüm oturumlar sunucu tarafında düşürüldü — local temizle
    auth.clearAuth()
    await router.push({ name: 'login', query: { deleted: '1' } })
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    reauthError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    reauthLoading.value = false
  }
}
</script>

<template>
  <div>
    <h3 class="text-[15px] font-semibold mb-2" style="color: var(--kv-danger);">
      {{ t('security.deleteAccount.title') }}
    </h3>

    <template v-if="!showConfirm">
      <p class="text-[13px] mb-3" style="color: var(--kv-text-muted);">
        {{ t('security.deleteAccount.warning') }}
      </p>
      <KvButton variant="ghost" class="border-[var(--kv-danger)] text-[var(--kv-danger)]" @click="showConfirm = true">
        {{ t('security.deleteAccount.confirm') }}
      </KvButton>
    </template>

    <template v-else>
      <div
        class="px-4 py-3 rounded-[var(--kv-radius-md)] mb-3 text-[13px]"
        style="background: rgba(242,59,75,0.1); color: var(--kv-danger);"
      >
        {{ t('security.deleteAccount.grace') }}
      </div>
      <div class="flex gap-3">
        <KvButton variant="ghost" @click="showConfirm = false">{{ t('common.cancel') }}</KvButton>
        <KvButton @click="showReauth = true" class="bg-[var(--kv-danger)] hover:opacity-90">
          {{ t('security.deleteAccount.confirm') }}
        </KvButton>
      </div>
    </template>
  </div>

  <ReauthModal
    v-if="showReauth"
    :title="t('security.deleteAccount.title')"
    :has-two-factor="auth.user?.twoFactorEnabled ?? false"
    :loading="reauthLoading"
    :error="reauthError"
    @confirm="onReauth"
    @cancel="showReauth = false; reauthError = ''"
  />
</template>
