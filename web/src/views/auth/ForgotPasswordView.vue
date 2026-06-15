<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { authApi } from '@/api/auth'
import { forgotPasswordSchema } from '@/lib/validation/auth'
import KvInput from '@/components/ui/KvInput.vue'
import KvButton from '@/components/ui/KvButton.vue'
import logoDikey from '@/assets/brand/kankaverse-logo-dikey.png'

const { t, te } = useI18n()

const loading = ref(false)
const sent = ref(false)

const { handleSubmit, defineField, errors } = useForm({
  validationSchema: toTypedSchema(forgotPasswordSchema),
})

const [email, emailAttrs] = defineField('email')

const onSubmit = handleSubmit(async (values) => {
  loading.value = true
  try {
    await authApi.forgotPassword(values.email)
  } finally {
    // Her zaman "gönderildi" göster — kullanıcı sayımı sızdırılmaz
    loading.value = false
    sent.value = true
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
          {{ t('forgotPassword.title') }}
        </h1>
        <p class="mt-1 text-[13px]" style="color: var(--kv-text-muted);">
          {{ t('forgotPassword.subtitle') }}
        </p>
      </div>

      <!-- Gönderim sonrası mesaj -->
      <template v-if="sent">
        <p
          class="text-[14px] text-center rounded-[var(--kv-radius-md)] px-4 py-3 mb-4"
          style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
        >
          {{ t('forgotPassword.successMessage') }}
        </p>
        <RouterLink
          :to="{ name: 'login' }"
          class="block text-center text-[13px] mt-4"
          style="color: var(--kv-accent-500);"
        >
          {{ t('forgotPassword.backToLogin') }}
        </RouterLink>
      </template>

      <!-- Form -->
      <template v-else>
        <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
          <KvInput
            v-model="email"
            v-bind="emailAttrs"
            :label="t('auth.email')"
            type="email"
            :placeholder="t('auth.emailPlaceholder')"
            :error="getError('email')"
            :required="true"
          />
          <KvButton type="submit" :loading="loading" class="w-full mt-1">
            {{ t('forgotPassword.submitButton') }}
          </KvButton>
        </form>

        <p class="mt-6 text-center text-[13px]" style="color: var(--kv-text-muted);">
          <RouterLink :to="{ name: 'login' }" style="color: var(--kv-accent-500);">
            {{ t('forgotPassword.backToLogin') }}
          </RouterLink>
        </p>
      </template>
    </div>
  </div>
</template>
