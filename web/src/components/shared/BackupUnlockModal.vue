<script setup lang="ts">
/** Yedek şifresini bir kez sorar (bu cihazda aç / geri yükle). Şifre yalnız yukarı taşınır. */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import KvModal from '@/components/ui/KvModal.vue'
import KvInput from '@/components/ui/KvInput.vue'
import KvButton from '@/components/ui/KvButton.vue'

defineProps<{ loading?: boolean; error?: string }>()
const emit = defineEmits<{ submit: [password: string]; cancel: [] }>()

const { t } = useI18n()
const password = ref('')

function submit() {
  if (password.value) emit('submit', password.value)
}
</script>

<template>
  <KvModal :title="t('e2ee.backup.unlock.title')" @close="emit('cancel')">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <p class="text-[13px]" style="color: var(--kv-text-secondary);">{{ t('e2ee.backup.unlock.body') }}</p>
      <KvInput v-model="password" :label="t('e2ee.backup.fields.password')" type="password" :error="error" />
      <p v-if="loading" class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('e2ee.backup.deriving') }}</p>
      <div class="flex flex-wrap gap-3 justify-end">
        <KvButton variant="ghost" type="button" :disabled="loading" @click="emit('cancel')">{{ t('common.cancel') }}</KvButton>
        <KvButton type="submit" :loading="loading" :disabled="!password">{{ t('e2ee.backup.unlock.submit') }}</KvButton>
      </div>
    </form>
  </KvModal>
</template>
