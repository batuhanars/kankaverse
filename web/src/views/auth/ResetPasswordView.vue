<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { authApi } from '@/api/auth'
import { resetPasswordSchema } from '@/lib/validation/auth'
import KvInput from '@/components/ui/KvInput.vue'
import KvButton from '@/components/ui/KvButton.vue'
import logoDikey from '@/assets/brand/kankaverse-logo-dikey.png'

const { t, te } = useI18n()
const route = useRoute()
const router = useRouter()

const token = ref('')
const loading = ref(false)
const success = ref(false)
const tokenError = ref(false)
const apiError = ref('')

onMounted(() => {
  token.value = (route.query.token as string) ?? ''
  if (!token.value) tokenError.value = true
})

const { handleSubmit, defineField, errors } = useForm({
  validationSchema: toTypedSchema(resetPasswordSchema),
})

const [newPassword, newPasswordAttrs] = defineField('newPassword')

const onSubmit = handleSubmit(async (values) => {
  loading.value = true
  apiError.value = ''
  try {
    await authApi.resetPassword(token.value, values.newPassword)
    success.value = true
    setTimeout(() => router.push({ name: 'login' }), 3000)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    const code = err.response?.data?.error
    apiError.value =
      code === 'INVALID_TOKEN'
        ? t('auth.errors.INVALID_TOKEN')
        : err.response?.data?.message ?? t('common.error')
  } finally {
    loading.value = false
  }
})

function getError(field: string): string | undefined {
  const msg = errors.value[field as keyof typeof errors.value]
  if (!msg) return undefined
  return te(msg) ? t(msg) : msg
}
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center"
    style="background-color: var(--kv-bg-rail);"
  >
    <div
      class="w-full max-w-sm rounded-[var(--kv-radius-lg)] p-8"
      style="background-color: var(--kv-bg-sidebar); border: 1px solid var(--kv-border-subtle); border-top: 3px solid var(--kv-accent-500);"
    >
      <div class="mb-6 text-center">
        <img
          :src="logoDikey"
          :alt="t('brand.name')"
          class="mx-auto mb-5"
          style="width: 120px; height: auto;"
        />
        <h1 class="text-[22px] font-semibold" style="color: var(--kv-text-primary);">
          {{ t('resetPassword.title') }}
        </h1>
        <p class="mt-1 text-[13px]" style="color: var(--kv-text-muted);">
          {{ t('resetPassword.subtitle') }}
        </p>
      </div>

      <!-- Token yok / geçersiz link -->
      <template v-if="tokenError">
        <p class="text-[14px] text-center mb-4" style="color: var(--kv-danger);">
          {{ t('resetPassword.invalidToken') }}
        </p>
        <RouterLink
          :to="{ name: 'forgot-password' }"
          class="block text-center text-[13px]"
          style="color: var(--kv-accent-500);"
        >
          {{ t('forgotPassword.title') }}
        </RouterLink>
      </template>

      <!-- Başarı -->
      <template v-else-if="success">
        <p
          class="text-[14px] text-center rounded-[var(--kv-radius-md)] px-4 py-3 mb-4"
          style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
        >
          {{ t('resetPassword.successMessage') }}
        </p>
        <KvButton class="w-full" @click="router.push({ name: 'login' })">
          {{ t('resetPassword.goToLogin') }}
        </KvButton>
      </template>

      <!-- Form -->
      <template v-else>
        <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
          <KvInput
            v-model="newPassword"
            v-bind="newPasswordAttrs"
            :label="t('resetPassword.newPassword')"
            type="password"
            :placeholder="t('resetPassword.newPasswordPlaceholder')"
            :error="getError('newPassword')"
            :required="true"
          />

          <p v-if="apiError" class="text-[13px] text-center" style="color: var(--kv-danger);">
            {{ apiError }}
          </p>

          <KvButton type="submit" :loading="loading" class="w-full mt-1">
            {{ t('resetPassword.submitButton') }}
          </KvButton>
        </form>
      </template>
    </div>
  </div>
</template>
