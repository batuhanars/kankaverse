<script setup lang="ts">
/**
 * Yedek şifresi belirleme modalı (E5a §4.4): kurulum, şifre değiştirme, sıfırlama. Kurallar canlı denetlenir
 * (`checkBackupPassword`, tek fonksiyon); kural ihlali, eşleşmeme ya da onay kutusu boşken gönder pasif.
 * Şifre yalnız bu bileşenin state'inde yaşar, yukarı `submit` ile taşınır; saklanmaz, loglanmaz.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { checkBackupPassword } from '@kankaverse/e2ee-core'
import { useAuthStore } from '@/stores/auth'
import KvModal from '@/components/ui/KvModal.vue'
import KvInput from '@/components/ui/KvInput.vue'
import KvButton from '@/components/ui/KvButton.vue'

const props = defineProps<{
  mode: 'setup' | 'change' | 'reset'
  loading?: boolean
  error?: string
}>()
const emit = defineEmits<{
  submit: [payload: { oldPassword?: string; password: string }]
  cancel: []
}>()

const { t } = useI18n()
const auth = useAuthStore()

const oldPassword = ref('')
const password = ref('')
const repeat = ref('')
const acked = ref(false)

const needsOld = computed(() => props.mode === 'change')
const needsAck = computed(() => props.mode !== 'change')
const check = computed(() =>
  password.value
    ? checkBackupPassword(password.value, { username: auth.user?.username ?? '', email: auth.user?.email ?? '' })
    : null,
)
const ruleText = computed(() =>
  check.value && !check.value.ok ? t(`e2ee.backup.rules.${check.value.reason}`) : '',
)
const mismatch = computed(() => repeat.value !== '' && repeat.value !== password.value)
const canSubmit = computed(
  () =>
    check.value?.ok === true &&
    repeat.value === password.value &&
    (!needsOld.value || oldPassword.value !== '') &&
    (!needsAck.value || acked.value),
)

function submit() {
  if (!canSubmit.value || props.loading) return
  emit('submit', { oldPassword: needsOld.value ? oldPassword.value : undefined, password: password.value })
}
</script>

<template>
  <KvModal :title="t(`e2ee.backup.${mode}.title`)" @close="emit('cancel')">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <p v-if="mode === 'reset'" class="text-[13px]" style="color: var(--kv-danger);">
        {{ t('e2ee.backup.reset.warning') }}
      </p>
      <p v-if="mode !== 'change'" class="text-[13px]" style="color: var(--kv-text-secondary);">
        {{ t('e2ee.backup.warning') }}
      </p>

      <KvInput
        v-if="needsOld"
        v-model="oldPassword"
        :label="t('e2ee.backup.fields.oldPassword')"
        type="password"
      />
      <KvInput
        v-model="password"
        :label="t(needsOld ? 'e2ee.backup.fields.newPassword' : 'e2ee.backup.fields.password')"
        type="password"
        :error="ruleText"
      />
      <KvInput
        v-model="repeat"
        :label="t(needsOld ? 'e2ee.backup.fields.newRepeat' : 'e2ee.backup.fields.repeat')"
        type="password"
        :error="mismatch ? t('e2ee.backup.rules.mismatch') : ''"
      />

      <label v-if="needsAck" class="flex items-start gap-2 text-[13px] cursor-pointer" style="color: var(--kv-text-primary);">
        <input v-model="acked" type="checkbox" class="mt-0.5 shrink-0" />
        <span class="min-w-0">{{ t('e2ee.backup.ack') }}</span>
      </label>

      <p v-if="loading" class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('e2ee.backup.deriving') }}</p>
      <p v-if="error" class="text-[13px]" style="color: var(--kv-danger);">{{ error }}</p>

      <div class="flex flex-wrap gap-3 justify-end">
        <KvButton variant="ghost" type="button" :disabled="loading" @click="emit('cancel')">
          {{ mode === 'setup' ? t('e2ee.backup.setup.later') : t('common.cancel') }}
        </KvButton>
        <KvButton type="submit" :loading="loading" :disabled="!canSubmit">
          {{ t(`e2ee.backup.${mode}.submit`) }}
        </KvButton>
      </div>
    </form>
  </KvModal>
</template>
