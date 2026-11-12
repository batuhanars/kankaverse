<script setup lang="ts">
/**
 * Yedek şifresini bir kez sorar (bu cihazda aç / geri yükle). Şifre yalnız yukarı taşınır.
 * E5a Rev.3: "Eski mesajları da geri yükle" ayrı seçim (banttan gelince işaretli, ayarlardan gelince işaretsiz).
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import KvModal from '@/components/ui/KvModal.vue'
import KvInput from '@/components/ui/KvInput.vue'
import KvButton from '@/components/ui/KvButton.vue'

const props = defineProps<{ loading?: boolean; error?: string; restoreDefault?: boolean }>()
const emit = defineEmits<{ submit: [password: string, restoreHistory: boolean]; cancel: [] }>()

const { t } = useI18n()
const password = ref('')
const restoreHistory = ref(props.restoreDefault ?? true)

function submit() {
  if (password.value) emit('submit', password.value, restoreHistory.value)
}
</script>

<template>
  <KvModal :title="t('e2ee.backup.unlock.title')" @close="emit('cancel')">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <p class="text-[13px]" style="color: var(--kv-text-secondary);">{{ t('e2ee.backup.unlock.body') }}</p>
      <KvInput v-model="password" :label="t('e2ee.backup.fields.password')" type="password" :error="error" />
      <label class="flex items-start gap-2 text-[13px] cursor-pointer" style="color: var(--kv-text-primary);">
        <input v-model="restoreHistory" type="checkbox" class="mt-0.5 shrink-0" />
        <span class="min-w-0">{{ t('e2ee.backup.history.restoreToo') }}</span>
      </label>
      <p v-if="loading" class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('e2ee.backup.deriving') }}</p>
      <div class="flex flex-wrap gap-3 justify-end">
        <KvButton variant="ghost" type="button" :disabled="loading" @click="emit('cancel')">{{ t('common.cancel') }}</KvButton>
        <KvButton type="submit" :loading="loading" :disabled="!password">{{ t('e2ee.backup.unlock.submit') }}</KvButton>
      </div>
    </form>
  </KvModal>
</template>
