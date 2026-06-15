<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { useAuthStore } from '@/stores/auth'
import { registerSchema } from '@/lib/validation/auth'
import KvInput from '@/components/ui/KvInput.vue'
import KvButton from '@/components/ui/KvButton.vue'
import BirthDateSelect from './components/BirthDateSelect.vue'
import logoDikey from '@/assets/brand/kankaverse-logo-dikey.png'

const router = useRouter()
const { t, te } = useI18n()
const auth = useAuthStore()

const apiError = ref('')
const loading = ref(false)

const { handleSubmit, defineField, errors, setFieldValue } = useForm({
  validationSchema: toTypedSchema(registerSchema),
})

const [email, emailAttrs] = defineField('email')
const [username, usernameAttrs] = defineField('username')
const [password, passwordAttrs] = defineField('password')
const [birthDate] = defineField('birthDate')

const onSubmit = handleSubmit(async (values) => {
  loading.value = true
  apiError.value = ''
  try {
    await auth.register({
      ...values,
      birthDate: new Date(values.birthDate).toISOString(),
    })
    await router.push({ name: 'app' })
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string; error?: string } } }
    const code = err.response?.data?.error
    if (code === 'USERNAME_TAKEN') {
      apiError.value = t('auth.errors.USERNAME_TAKEN')
    } else if (code === 'EMAIL_TAKEN') {
      apiError.value = t('auth.errors.EMAIL_TAKEN')
    } else {
      apiError.value = err.response?.data?.message ?? t('common.error')
    }
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
    class="min-h-screen flex items-center justify-center py-10"
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
          {{ t('auth.registerTitle') }}
        </h1>
        <p class="mt-1 text-[13px]" style="color: var(--kv-text-muted);">{{ t('auth.registerSubtitle') }}</p>
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
          v-model="username"
          v-bind="usernameAttrs"
          :label="t('auth.username')"
          :placeholder="t('auth.usernamePlaceholder')"
          :error="getError('username')"
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
        <BirthDateSelect
          :model-value="birthDate ?? ''"
          :error="getError('birthDate')"
          @update:model-value="(val) => setFieldValue('birthDate', val)"
        />

        <p v-if="apiError" class="text-[13px] text-center" style="color: var(--kv-danger);">
          {{ apiError }}
        </p>

        <KvButton type="submit" :loading="loading" class="w-full mt-1">
          {{ t('auth.register') }}
        </KvButton>
      </form>

      <p class="mt-6 text-center text-[13px]" style="color: var(--kv-text-muted);">
        {{ t('auth.hasAccount') }}
        <RouterLink to="/login" class="font-medium" style="color: var(--kv-accent-500);">
          {{ t('auth.login') }}
        </RouterLink>
      </p>

      <p class="mt-4 text-center text-[12px]" style="color: var(--kv-text-muted);">
        {{ t('legal.privacy.registerNote') }}
        <RouterLink to="/gizlilik" style="color: var(--kv-text-muted); text-decoration: underline; text-underline-offset: 2px;">
          {{ t('legal.privacy.linkLabel') }}
        </RouterLink>
      </p>
    </div>
  </div>
</template>
