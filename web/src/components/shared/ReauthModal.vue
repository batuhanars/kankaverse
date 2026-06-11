<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import KvModal from '@/components/ui/KvModal.vue'
import KvInput from '@/components/ui/KvInput.vue'
import KvButton from '@/components/ui/KvButton.vue'

const props = defineProps<{
  title: string
  hasTwoFactor?: boolean
  loading?: boolean
  error?: string
}>()

const emit = defineEmits<{
  confirm: [payload: { currentPassword: string; totpCode?: string }]
  cancel: []
}>()

const { t } = useI18n()
const currentPassword = ref('')
const totpCode = ref('')

function submit() {
  if (!currentPassword.value) return
  emit('confirm', {
    currentPassword: currentPassword.value,
    totpCode: props.hasTwoFactor ? totpCode.value || undefined : undefined,
  })
}
</script>

<template>
  <KvModal :title="title" @close="emit('cancel')">
    <p class="text-[13px] mb-4" style="color: var(--kv-text-muted);">{{ t('reauth.subtitle') }}</p>
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <KvInput
        v-model="currentPassword"
        :label="t('reauth.currentPassword')"
        type="password"
        :required="true"
      />
      <KvInput
        v-if="hasTwoFactor"
        v-model="totpCode"
        :label="t('reauth.totpCode')"
        :placeholder="t('reauth.totpCodePlaceholder')"
        autocomplete="one-time-code"
      />
      <p v-if="error" class="text-[13px]" style="color: var(--kv-danger);">{{ error }}</p>
      <div class="flex gap-3 justify-end">
        <KvButton variant="ghost" type="button" @click="emit('cancel')">{{ t('common.cancel') }}</KvButton>
        <KvButton type="submit" :loading="loading">{{ t('reauth.confirm') }}</KvButton>
      </div>
    </form>
  </KvModal>
</template>
