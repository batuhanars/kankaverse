<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { useAuthStore } from '@/stores/auth'
import { loginSchema } from '@/lib/validation/auth'
import KvInput from '@/components/ui/KvInput.vue'
import KvButton from '@/components/ui/KvButton.vue'
import logoDikey from '@/assets/brand/kankaverse-logo-dikey.png'

const router = useRouter()
const { t, te } = useI18n()
const auth = useAuthStore()

const apiError = ref('')
const loading = ref(false)

const { handleSubmit, defineField, errors } = useForm({
  validationSchema: toTypedSchema(loginSchema),
})

const [email, emailAttrs] = defineField('email')
const [password, passwordAttrs] = defineField('password')

const onSubmit = handleSubmit(async (values) => {
  loading.value = true
  apiError.value = ''
  try {
    const challenge = await auth.login(values)
    if (challenge) {
      sessionStorage.setItem('kv_2fa_challenge', challenge.challengeToken)
      await router.push({ name: 'login-2fa' })
    } else {
      await router.push({ name: 'app' })
    }
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string; error?: string } } }
    const code = err.response?.data?.error
    apiError.value =
      code === 'INVALID_CREDENTIALS'
        ? t('auth.errors.INVALID_CREDENTIALS')
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
          style="width: 150px; height: auto;"
        />
        <h1 class="text-[22px] font-semibold" style="color: var(--kv-text-primary);">
          {{ t('auth.loginTitle') }}
        </h1>
        <p class="mt-1 text-[13px]" style="color: var(--kv-text-muted);">{{ t('auth.loginSubtitle') }}</p>
      </div>

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
        <KvInput
          v-model="password"
          v-bind="passwordAttrs"
          :label="t('auth.password')"
          type="password"
          :placeholder="t('auth.passwordPlaceholder')"
          :error="getError('password')"
          :required="true"
        />

        <p v-if="apiError" class="text-[13px] text-center" style="color: var(--kv-danger);">
          {{ apiError }}
        </p>

        <div class="flex justify-end">
          <RouterLink
            :to="{ name: 'forgot-password' }"
            class="text-[12px]"
            style="color: var(--kv-text-muted);"
          >
            {{ t('auth.forgotPassword') }}
          </RouterLink>
        </div>

        <KvButton type="submit" :loading="loading" class="w-full mt-1">
          {{ t('auth.login') }}
        </KvButton>
      </form>

      <div class="my-4 flex items-center gap-3">
        <div class="flex-1 h-px" style="background-color: var(--kv-border-subtle);" />
        <span class="text-[12px]" style="color: var(--kv-text-muted);">{{ t('auth.or') }}</span>
        <div class="flex-1 h-px" style="background-color: var(--kv-border-subtle);" />
      </div>
      <button
        disabled
        class="w-full py-2.5 rounded-[var(--kv-radius-md)] border text-[14px] font-medium cursor-not-allowed opacity-50 flex items-center justify-center gap-2"
        style="border-color: var(--kv-border-strong); color: var(--kv-text-muted);"
        :title="t('auth.edevletComingSoon')"
      >
        {{ t('auth.edevletLogin') }}
      </button>

      <p class="mt-6 text-center text-[13px]" style="color: var(--kv-text-muted);">
        {{ t('auth.noAccount') }}
        <RouterLink to="/register" class="font-medium" style="color: var(--kv-accent-500);">
          {{ t('auth.register') }}
        </RouterLink>
      </p>

      <p class="mt-4 text-center text-[12px]" style="color: var(--kv-text-muted);">
        <RouterLink to="/gizlilik" style="color: var(--kv-text-muted); text-decoration: underline; text-underline-offset: 2px;">
          {{ t('legal.privacy.linkLabel') }}
        </RouterLink>
      </p>
    </div>
  </div>
</template>
