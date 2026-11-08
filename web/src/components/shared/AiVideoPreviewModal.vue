<script setup lang="ts">
/**
 * AiVideoPreviewModal (Sprint C14b §4b): TEK bir videonun önizlemesi + düğmeleri. Düğmeler yalnız `row`a bağlıdır;
 * ekranda aynı anda başka videonun düğmesi bulunmaz (üretim formu bu pencere açıkken kapalıdır).
 * Eylem düğmeleri kaydırma alanının altına yapışık: uzun istem metni onları ekran dışına itmez.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTimeoutFn } from '@vueuse/core'
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

// useClipboard yerine doğrudan writeText: useClipboard ClipboardItem ile yazıyor, masaüstünde (Electron)
// bu yol panoya hiçbir şey koymadan "kopyalandı" diyordu. Mesaj kopyalama da writeText kullanıyor.
const copyState = ref<'idle' | 'done' | 'failed'>('idle')
const { start: resetCopyState } = useTimeoutFn(() => (copyState.value = 'idle'), 1500, { immediate: false })
async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(props.row.prompt)
    copyState.value = 'done'
  } catch {
    copyState.value = 'failed'
  }
  resetCopyState()
}
const copyLabel = computed(() =>
  copyState.value === 'done'
    ? t('aiVideo.promptCopied')
    : copyState.value === 'failed'
      ? t('aiVideo.promptCopyFailed')
      : t('aiVideo.copyPrompt'),
)

const meta = computed(() =>
  [props.modelLabel, t('aiVideo.durationOption', { sec: props.row.durationS }), props.row.resolution].filter(Boolean).join(' · '),
)
</script>

<template>
  <KvModal :title="t('aiVideo.previewTitle')" @close="emit('close')">
    <div class="flex flex-col gap-3 min-w-0">
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
        <KvButton variant="ghost" @click="copyPrompt">{{ copyLabel }}</KvButton>
      </div>
      <p class="text-[12px] min-w-0 break-words" style="color: var(--kv-text-muted);">{{ meta }}</p>
      <div
        class="sticky bottom-0 flex flex-col gap-2 pt-3 border-t border-[var(--kv-border-subtle)] bg-[var(--kv-bg-sidebar)]"
      >
        <p v-if="error" class="text-[13px]" style="color: var(--kv-danger);">{{ error }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <AiVideoResultActions :mode="mode" :busy="busy" @save="emit('save')" @primary="emit('primary')" />
          <KvButton variant="ghost" :disabled="busy" @click="emit('new')">{{ t('aiVideo.newOne') }}</KvButton>
          <KvButton variant="danger" :disabled="busy" @click="emit('delete')">{{ t('aiVideo.delete') }}</KvButton>
        </div>
      </div>
    </div>
  </KvModal>
</template>
