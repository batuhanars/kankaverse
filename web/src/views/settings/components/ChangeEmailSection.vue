<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { changeEmailSchema } from '@/lib/validation/auth'
import KvInput from '@/components/ui/KvInput.vue'
import KvButton from '@/components/ui/KvButton.vue'

// inModal: KvModal içinde başlığını gizler. E-posta değişimi doğrulama linki gönderir;
// başarı mesajı modalda kalsın diye 'saved' ile otomatik kapanma YAPILMAZ (kullanıcı X ile kapatır).
defineProps<{ inModal?: boolean }>()

const { t, te } = useI18n()
const auth = useAuthStore()

const loading = ref(false)
const apiError = ref('')
const success = ref(false)

const { handleSubmit, defineField, errors, resetForm } = useForm({
  validationSchema: toTypedSchema(changeEmailSchema),
})

const [currentPassword, cpAttrs] = defineField('currentPassword')
const [newEmail, neAttrs] = defineField('newEmail')
const [totpCode, tcAttrs] = defineField('totpCode')

const onSubmit = handleSubmit(async (values) => {
  loading.value = true
  apiError.value = ''
  success.value = false
  try {
    await authApi.changeEmail({
      currentPassword: values.currentPassword,
      newEmail: values.newEmail,
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
    <h3 v-if="!inModal" class="text-[15px] font-semibold mb-1" style="color: var(--kv-text-primary);">
      {{ t('security.email.title') }}
    </h3>
    <p class="text-[13px] mb-3" style="color: var(--kv-text-muted);">
      {{ t('security.email.current') }}: <strong style="color: var(--kv-text-secondary);">{{ auth.user?.email }}</strong>
    </p>
    <form class="flex flex-col gap-3" @submit.prevent="onSubmit">
      <KvInput
        v-model="currentPassword"
        v-bind="cpAttrs"
        :label="t('reauth.currentPassword')"
        type="password"
        :error="getError('currentPassword')"
        :required="true"
      />
      <KvInput
        v-model="newEmail"
        v-bind="neAttrs"
        :label="t('security.email.newEmail')"
        type="email"
        :error="getError('newEmail')"
        :required="true"
      />
      <KvInput
        v-if="auth.user?.twoFactorEnabled"
        v-model="totpCode"
        v-bind="tcAttrs"
        :label="t('security.email.totpCode')"
        :placeholder="t('security.email.totpCodePlaceholder')"
        autocomplete="one-time-code"
      />
      <p v-if="apiError" class="text-[13px]" style="color: var(--kv-danger);">{{ apiError }}</p>
      <p v-if="success" class="text-[13px]" style="color: #3DB46E;">{{ t('security.email.success') }}</p>
      <KvButton type="submit" :loading="loading" class="self-start">
        {{ t('security.email.submit') }}
      </KvButton>
    </form>
  </div>
</template>
