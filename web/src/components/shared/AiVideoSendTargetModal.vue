<script setup lang="ts">
/**
 * AiVideoSendTargetModal (C49 Revize 1): bildirimden açılan videoyu göndermek için hedef seçici.
 * Hedef listesi DM + grup DM + ortam metin kanalları (DmTargetList, withGuildChannels); yalnız seçimi emit eder, gönderim çağıranda.
 */
import { useI18n } from 'vue-i18n'
import KvModal from '@/components/ui/KvModal.vue'
import DmTargetList from '@/components/shared/DmTargetList.vue'

defineProps<{ busy: boolean }>()
const emit = defineEmits<{ close: []; pick: [channelId: string] }>()
const { t } = useI18n()
</script>

<template>
  <KvModal :title="t('aiVideo.sendTargetTitle')" @close="emit('close')">
    <div class="min-w-0" style="width: 360px; max-width: 100%;">
      <DmTargetList
        :disabled="busy"
        sent-label=""
        with-guild-channels
        @pick="emit('pick', $event.id)"
        @pick-channel="emit('pick', $event)"
      />
    </div>
  </KvModal>
</template>
