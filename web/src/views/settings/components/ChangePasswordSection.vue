<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { changePasswordSchema } from '@/lib/validation/auth'
import KvInput from '@/components/ui/KvInput.vue'
import KvButton from '@/components/ui/KvButton.vue'

const { t, te } = useI18n()
const auth = useAuthStore()

const loading = ref(false)
const apiError = ref('')
const success = ref(false)

const { handleSubmit, defineField, errors, resetForm } = useForm({
  validationSchema: toTypedSchema(changePasswordSchema),
})

const [currentPassword, cpAttrs] = defineField('currentPassword')
const [newPassword, npAttrs] = defineField('newPassword')
const [totpCode, tcAttrs] = defineField('totpCode')

const onSubmit = handleSubmit(async (values) => {
  loading.value = true
  apiError.value = ''
  success.value = false
  try {
    await authApi.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      totpCode: values.totpCode || undefined,
    })
    success.value = true
    resetForm()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    apiError.value = err.response?.data?.message ?? t('common.error')
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
  <div>
    <h3 class="text-[15px] font-semibold mb-3" style="color: var(--kv-text-primary);">
      {{ t('security.password.title') }}
    </h3>
    <form class="flex flex-col gap-3" @submit.prevent="onSubmit">
      <KvInput
        v-model="currentPassword"
        v-bind="cpAttrs"
        :label="t('security.password.currentPassword')"
        type="password"
        :error="getError('currentPassword')"
        :required="true"
      />
      <KvInput
        v-model="newPassword"
        v-bind="npAttrs"
        :label="t('security.password.newPassword')"
        type="password"
        :error="getError('newPassword')"
        :required="true"
      />
      <KvInput
        v-if="auth.user?.twoFactorEnabled"
        v-model="totpCode"
        v-bind="tcAttrs"
        :label="t('security.password.totpCode')"
        :placeholder="t('security.password.totpCodePlaceholder')"
        autocomplete="one-time-code"
      />
      <p v-if="apiError" class="text-[13px]" style="color: var(--kv-danger);">{{ apiError }}</p>
      <p v-if="success" class="text-[13px]" style="color: #3DB46E;">{{ t('security.password.success') }}</p>
      <KvButton type="submit" :loading="loading" class="self-start">
        {{ t('security.password.submit') }}
      </KvButton>
    </form>
  </div>
</template>
