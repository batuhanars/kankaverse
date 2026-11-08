<script setup lang="ts">
/**
 * AiVideoResultActions (Sprint C14b §0-6): sonuç düğmeleri bağlama göre.
 * chat → Kaydet + Kaydet ve gönder · media → Kaydet + Kullan · view (C49, bildirimden) → Kaydet + Kaydet ve gönder (hedef seçici açılır).
 */
import { useI18n } from 'vue-i18n'
import KvButton from '@/components/ui/KvButton.vue'

defineProps<{ mode: 'chat' | 'media' | 'view'; busy: boolean }>()
const emit = defineEmits<{ save: []; primary: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <KvButton variant="ghost" :disabled="busy" @click="emit('save')">{{ t('aiVideo.save') }}</KvButton>
    <KvButton :loading="busy" @click="emit('primary')">
      {{ mode !== 'media' ? t('aiVideo.saveAndSend') : t('aiVideo.useAsMedia') }}
    </KvButton>
  </div>
</template>
