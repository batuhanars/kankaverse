<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { makeRegisterSchema } from '@/lib/validation/auth'
import { authApi } from '@/api/auth'
import KvInput from '@/components/ui/KvInput.vue'
import KvButton from '@/components/ui/KvButton.vue'
import KvModal from '@/components/ui/KvModal.vue'
import BirthDateSelect from './components/BirthDateSelect.vue'
import logoDikey from '@/assets/brand/kankaverse-logo-dikey.png'

const router = useRouter()
const { t, te } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

const apiError = ref('')
const loading = ref(false)
const showConsent = ref(false)
type RegisterValues = {
  email: string
  username: string
  password: string
  birthDate: string
  inviteCode?: string
}
const pendingValues = ref<RegisterValues | null>(null)

// ── Kayıt modu: mount'ta çek, moduna göre form davranışı ──────────────────
type RegistrationMode = 'open' | 'invite' | 'closed'
const registrationMode = ref<RegistrationMode>('open')
const modeLoading = ref(true)

const validationSchema = computed(() => toTypedSchema(makeRegisterSchema(registrationMode.value)))

const { handleSubmit, defineField, errors, setFieldValue } = useForm({
  validationSchema,
})

const [email, emailAttrs] = defineField('email')
const [username, usernameAttrs] = defineField('username')
const [password, passwordAttrs] = defineField('password')
const [birthDate] = defineField('birthDate')
const [inviteCode, inviteCodeAttrs] = defineField('inviteCode')

onMounted(async () => {
  try {
    const res = await authApi.getRegistrationMode()
    registrationMode.value = res.data.mode
  } catch {
    // Hata durumunda güvenli taraf: formu açık bırak (backend doğrulayacak)
    registrationMode.value = 'open'
  } finally {
    modeLoading.value = false
  }
})

// Kayıt Ol → form doğrula → geçerliyse onay modalını aç (asıl kayıt modal onayında olur).
const onSubmit = handleSubmit((values) => {
  pendingValues.value = values
  apiError.value = ''
  showConsent.value = true
})

// Modal "Okudum, kabul ediyorum" → asıl kayıt.
async function confirmRegister() {
  const values = pendingValues.value
  if (!values) return
  loading.value = true
  apiError.value = ''
  try {
    await auth.register({
      ...values,
      birthDate: new Date(values.birthDate).toISOString(),
      inviteCode: values.inviteCode || undefined,
    })
    toast.success(t('auth.registerSuccess'))
    await router.push({ name: 'app' })
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string; error?: string } } }
    const code = err.response?.data?.error
    if (code === 'USERNAME_TAKEN') {
      apiError.value = t('auth.errors.USERNAME_TAKEN')
    } else if (code === 'EMAIL_TAKEN') {
      apiError.value = t('auth.errors.EMAIL_TAKEN')
    } else if (code === 'REGISTRATION_CLOSED') {
      apiError.value = t('auth.errors.REGISTRATION_CLOSED')
    } else if (code === 'INVITE_CODE_REQUIRED') {
      apiError.value = t('auth.errors.INVITE_CODE_REQUIRED')
    } else if (code === 'INVITE_CODE_INVALID') {
      apiError.value = t('auth.errors.INVITE_CODE_INVALID')
    } else {
      apiError.value = err.response?.data?.message ?? t('common.error')
    }
    showConsent.value = false // hata → modalı kapat, kullanıcı formdaki hatayı görsün
  } finally {
    loading.value = false
  }
}

function getError(field: string): string | undefined {
  const msg = errors.value[field as keyof typeof errors.value]
  if (!msg) return undefined
  return te(msg) ? t(msg) : msg
}
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center py-10"
    style="background-color: var(--kv-bg-rail)"
  >
    <div
      class="w-full max-w-sm rounded-[var(--kv-radius-lg)] p-8"
      style="
        background-color: var(--kv-bg-sidebar);
        border: 1px solid var(--kv-border-subtle);
        border-top: 3px solid var(--kv-accent-500);
      "
    >
      <div class="mb-6 text-center">
        <img
          :src="logoDikey"
          :alt="t('brand.name')"
          class="mx-auto mb-5"
          style="width: 150px; height: auto"
        />
        <h1 class="text-[22px] font-semibold" style="color: var(--kv-text-primary)">
          {{ t('auth.registerTitle') }}
        </h1>
        <p class="mt-1 text-[13px]" style="color: var(--kv-text-muted)">
          {{ t('auth.registerSubtitle') }}
        </p>
      </div>

      <!-- Yükleniyor durumu -->
      <div v-if="modeLoading" class="flex justify-center py-8">
        <span class="text-[14px]" style="color: var(--kv-text-muted)">{{
          t('common.loading')
        }}</span>
      </div>

      <!-- Kapalı kayıt bilgi kartı -->
      <div
        v-else-if="registrationMode === 'closed'"
        class="rounded-[var(--kv-radius-md)] p-5 text-center"
        style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle)"
      >
        <svg
          class="mx-auto mb-3"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          style="color: var(--kv-text-muted)"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <p class="text-[15px] font-semibold mb-1" style="color: var(--kv-text-primary)">
          {{ t('register.invite.closedTitle') }}
        </p>
        <p class="text-[13px]" style="color: var(--kv-text-muted)">
          {{ t('register.invite.closedDesc') }}
        </p>
      </div>

      <!-- Kayıt formu (open veya invite) -->
      <form v-else class="flex flex-col gap-4" @submit.prevent="onSubmit">
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

        <!-- Davet kodu alanı: yalnız invite modunda göster.
             type=password → varsayılan gizli (yayında ekrana düşse kod sızmaz); göz ikonuyla görülebilir. -->
        <KvInput
          v-if="registrationMode === 'invite'"
          v-model="inviteCode"
          v-bind="inviteCodeAttrs"
          :label="t('register.invite.codeLabel')"
          type="password"
          :placeholder="t('register.invite.codePlaceholder')"
          :error="getError('inviteCode')"
          :required="true"
        />

        <p v-if="apiError" class="text-[13px] text-center" style="color: var(--kv-danger)">
          {{ apiError }}
        </p>

        <KvButton type="submit" :loading="loading" class="w-full mt-1">
          {{ t('auth.register') }}
        </KvButton>
      </form>

      <p class="mt-6 text-center text-[13px]" style="color: var(--kv-text-muted)">
        {{ t('auth.hasAccount') }}
        <RouterLink to="/login" class="font-medium" style="color: var(--kv-accent-500)">
          {{ t('auth.login') }}
        </RouterLink>
      </p>
    </div>

    <!-- Onay modalı: Kayıt Ol (form geçerli) → açılır; "Okudum, kabul ediyorum" asıl kaydı yapar.
         Form kısa kalır, onay tam karar anında + açık → "görmedim duymadım" savunması kapanır. -->
    <KvModal v-if="showConsent" :title="t('legal.consentTitle')" @close="showConsent = false">
      <p class="text-[13px] leading-relaxed mb-3" style="color: var(--kv-text-body)">
        {{ t('legal.consentAccess') }}
      </p>
      <p class="text-[13px] leading-relaxed mb-4" style="color: var(--kv-text-body)">
        {{ t('legal.consentScanning') }}
      </p>
      <p class="text-[13px] leading-relaxed mb-5" style="color: var(--kv-text-secondary)">
        {{ t('legal.consentAgreePre') }}
        <a
          href="/kurallar"
          target="_blank"
          rel="noopener"
          style="color: var(--kv-accent-500); text-decoration: underline"
          >{{ t('legal.rules.linkLabel') }}</a
        >
        {{ t('legal.and') }}
        <a
          href="/gizlilik"
          target="_blank"
          rel="noopener"
          style="color: var(--kv-accent-500); text-decoration: underline"
          >{{ t('legal.privacy.linkLabel') }}</a
        >
        {{ t('legal.consentAgreePost') }}
      </p>
      <div class="flex gap-3 justify-end">
        <KvButton variant="ghost" @click="showConsent = false">{{ t('common.cancel') }}</KvButton>
        <KvButton variant="primary" :loading="loading" @click="confirmRegister">{{
          t('legal.consentConfirm')
        }}</KvButton>
      </div>
    </KvModal>
  </div>
</template>
