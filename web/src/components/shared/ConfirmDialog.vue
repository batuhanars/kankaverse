<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'

const props = defineProps<{
  title?: string
  message: string
  confirmLabel?: string
  loading?: boolean
}>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const { t } = useI18n()
</script>

<template>
  <KvModal :title="props.title ?? t('common.confirm')" @close="emit('cancel')">
    <p class="text-[14px] mb-6" style="color: var(--kv-text-body);">{{ message }}</p>
    <div class="flex gap-3 justify-end">
      <KvButton variant="ghost" @click="emit('cancel')">{{ t('common.cancel') }}</KvButton>
      <KvButton variant="danger" :loading="loading" @click="emit('confirm')">
        {{ confirmLabel ?? t('common.confirm') }}
      </KvButton>
    </div>
  </KvModal>
</template>
