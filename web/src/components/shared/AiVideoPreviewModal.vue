<script setup lang="ts">
/**
 * AiVideoPreviewModal (Sprint C14b §4b): TEK bir videonun önizlemesi + düğmeleri. Düğmeler yalnız `row`a bağlıdır;
 * ekranda aynı anda başka videonun düğmesi bulunmaz (üretim formu bu pencere açıkken kapalıdır).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClipboard } from '@vueuse/core'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'
import AiVideoResultActions from '@/components/shared/AiVideoResultActions.vue'
import type { AiVideoDto } from '@/api/aiVideo'

const props = defineProps<{
  row: AiVideoDto
  mode: 'chat' | 'media'
  busy: boolean
  error: string
  modelLabel?: string
}>()
const emit = defineEmits<{ close: []; save: []; primary: []; new: []; delete: [] }>()
const { t } = useI18n()
const { copy, copied } = useClipboard({ legacy: true })

const meta = computed(() =>
  [props.modelLabel, t('aiVideo.durationOption', { sec: props.row.durationS }), props.row.resolution].filter(Boolean).join(' · '),
)
</script>

<template>
  <KvModal :title="t('aiVideo.previewTitle')" @close="emit('close')">
    <div class="flex flex-col gap-3 min-w-0 overflow-y-auto">
      <video
        :src="row.videoUrl"
        class="w-full rounded-[var(--kv-radius-md)] bg-black max-h-[40vh]"
        controls
        autoplay
        loop
        muted
        playsinline
      />
      <p class="whitespace-pre-wrap break-words select-text text-[14px]" style="color: var(--kv-text-primary);">
        {{ row.prompt || t('aiVideo.fromImage') }}
      </p>
      <div v-if="row.prompt">
        <KvButton variant="ghost" @click="copy(row.prompt)">
          {{ copied ? t('aiVideo.promptCopied') : t('aiVideo.copyPrompt') }}
        </KvButton>
      </div>
      <p class="text-[12px] min-w-0 break-words" style="color: var(--kv-text-muted);">{{ meta }}</p>
      <p v-if="error" class="text-[13px]" style="color: var(--kv-danger);">{{ error }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <AiVideoResultActions :mode="mode" :busy="busy" @save="emit('save')" @primary="emit('primary')" />
        <KvButton variant="ghost" :disabled="busy" @click="emit('new')">{{ t('aiVideo.newOne') }}</KvButton>
        <KvButton variant="danger" :disabled="busy" @click="emit('delete')">{{ t('aiVideo.delete') }}</KvButton>
      </div>
    </div>
  </KvModal>
</template>
