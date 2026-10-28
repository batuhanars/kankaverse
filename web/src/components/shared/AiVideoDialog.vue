<script setup lang="ts">
/**
 * AiVideoDialog (Sprint C14b §3.1): model/çözünürlük/süre + istem (+ isteğe bağlı görsel) → video üretir.
 * İki görünüm, aynı anda biri: `form` (seçici/istem/ilerleme/son üretimler, düğmesiz) ve `preview` (tek videonun
 * düğmeleri, §4b). Önizlenen satır açık `previewRow`da tutulur. Akış mantığı `useAiVideo`/`useAiVideoForm`da; burası yalnız görünüm. Sonuç düğmeleri bağlama göre:
 * mode=chat → `send` (attachmentId, çağıran mevcut mesaj yoluna verir) · mode=media → `use` (File).
 * Kapı yalnız arayüz; sunucu otorite.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'
import AiVideoOptions from '@/components/shared/AiVideoOptions.vue'
import AiVideoCostBar from '@/components/shared/AiVideoCostBar.vue'
import AiVideoRecentList from '@/components/shared/AiVideoRecentList.vue'
import AiVideoPreviewModal from '@/components/shared/AiVideoPreviewModal.vue'
import { useAiVideo } from '@/composables/useAiVideo'
import { aiVideoApi, type AiVideoDto } from '@/api/aiVideo'

const props = defineProps<{ mode: 'chat' | 'media' }>()
const emit = defineEmits<{ close: []; use: [file: File]; send: [attachmentId: string] }>()

const { t } = useI18n()
const ai = useAiVideo()
const form = ai.form
const fileInput = ref<HTMLInputElement | null>(null)
const previewUrl = ref<string | null>(null)

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const PROMPT_MAX = 1000
const view = ref<'form' | 'preview'>('form')
const previewRow = ref<AiVideoDto | null>(null)
let previewOpenedAt = 0
const STALE_MS = 10 * 60 * 1000 // presigned adres 15 dk; 10 dk sonra tazele

const canSubmit = computed(
  () => !ai.busy.value && (ai.prompt.value.trim().length > 0 || !!ai.image.value),
)
const statusText = computed(() => {
  if (ai.saving.value) return t('aiVideo.saving')
  return ai.job.value?.status === 'QUEUED' ? t('aiVideo.queued') : t('aiVideo.running', { sec: ai.elapsedSec.value })
})
const failed = computed(() => ai.job.value?.status === 'FAILED')
const otherRecent = computed(() => ai.recent.value.filter((r) => r.id !== ai.job.value?.id))

watch(ai.image, (f) => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = f ? URL.createObjectURL(f) : null
})
onUnmounted(() => previewUrl.value && URL.revokeObjectURL(previewUrl.value))

function onImage(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  if (!IMAGE_TYPES.includes(f.type)) ai.error.value = t('aiVideo.errors.imageType')
  else if (f.size > MAX_IMAGE_BYTES) ai.error.value = t('aiVideo.errors.imageSize')
  else {
    ai.error.value = ''
    ai.image.value = f
  }
}

const modelLabel = computed(() =>
  form.options.value?.models.find((m) => m.key === previewRow.value?.model)?.label,
)

function showPreview(row: AiVideoDto) {
  ai.error.value = ''
  previewRow.value = row
  previewOpenedAt = Date.now()
  view.value = 'preview'
}

/** Presigned adresler tazelensin diye satırı sunucudan çeker; olmazsa eldeki satır yedek. */
async function refreshed(row: AiVideoDto): Promise<AiVideoDto> {
  try {
    return (await aiVideoApi.get(row.id)).data
  } catch {
    return row
  }
}

/** Eylemden hemen önce: önizleme 10 dk'dan eskiyse satırı tazele. */
async function currentRow(): Promise<AiVideoDto | null> {
  const row = previewRow.value
  if (!row) return null
  if (Date.now() - previewOpenedAt < STALE_MS) return row
  const fresh = await refreshed(row)
  previewRow.value = fresh
  previewOpenedAt = Date.now()
  return fresh
}

async function onSave() {
  const row = await currentRow()
  if (row) ai.save(row)
}

// Yoklamayla biten üretim önizlemeye geçer (form kapanır).
watch(
  () => ai.job.value?.status,
  (s) => {
    const row = ai.job.value
    if (s === 'COMPLETED' && row?.videoUrl) showPreview(row)
  },
)

function newOne() {
  ai.reset()
  previewRow.value = null
  view.value = 'form'
}

/** Satır tıklaması: biten → önizleme; süren → formda ilerleme. Başarısız satır tıklanmaz. */
async function onRecent(r: AiVideoDto) {
  if (r.status === 'COMPLETED' && r.videoUrl) showPreview(await refreshed(r))
  else if (r.status === 'QUEUED' || r.status === 'RUNNING') ai.open(r)
}

/** Silinen satır önizlemedeyse önizleme kapanır, forma dönülür. */
async function onRemove(id: string) {
  await ai.remove(id)
  if (previewRow.value?.id === id && !ai.recent.value.some((r) => r.id === id)) newOne()
}

async function onClear() {
  await ai.clearAll()
  newOne()
}

/** Kullan (media): önizlenen satırın videosu → File → çağıran. Kaydet ve gönder (chat): ek üret → çağıran gönderir. */
async function onPrimary() {
  const row = await currentRow()
  if (!row) return
  if (props.mode === 'media') {
    const file = await ai.toFile(row)
    if (file) emit('use', file)
    return
  }
  const id = await ai.saveAndAttach(row)
  if (id) emit('send', id)
}
</script>

<template>
  <AiVideoPreviewModal
    v-if="view === 'preview' && previewRow"
    :row="previewRow"
    :mode="mode"
    :busy="ai.busy.value"
    :error="ai.error.value"
    :model-label="modelLabel"
    @close="emit('close')"
    @save="onSave"
    @primary="onPrimary"
    @new="newOne"
    @delete="previewRow && onRemove(previewRow.id)"
  />
  <KvModal v-else :title="t('aiVideo.title')" @close="emit('close')">
    <div class="flex flex-col gap-4 min-w-0 overflow-y-auto">
      <!-- İlerleme / hata -->
      <template v-if="ai.job.value">
        <template v-if="ai.working.value">
          <p class="text-[14px]" style="color: var(--kv-text-secondary);">{{ statusText }}</p>
          <p class="text-[12px]" style="color: var(--kv-text-muted);">{{ t('aiVideo.waitNote') }}</p>
        </template>
        <template v-else>
          <p v-if="failed" class="text-[13px]" style="color: var(--kv-danger);">
            {{ ai.errorText(ai.job.value.errorCode) }}
          </p>
          <div><KvButton variant="ghost" @click="newOne">{{ t('aiVideo.newOne') }}</KvButton></div>
        </template>
      </template>

      <!-- Form -->
      <template v-else>
        <AiVideoOptions
          :models="form.options.value?.models ?? []"
          :current="form.current.value"
          :model="form.model.value"
          :resolution="form.resolution.value"
          :duration-s="form.durationS.value"
          @update:model="form.pickModel"
          @update:resolution="form.resolution.value = $event"
          @update:duration-s="form.durationS.value = $event"
        />

        <div>
          <label class="block text-[13px] font-medium mb-1" style="color: var(--kv-text-secondary);" for="ai-video-prompt">
            {{ t('aiVideo.promptLabel') }}
          </label>
          <textarea
            id="ai-video-prompt"
            v-model="ai.prompt.value"
            rows="3"
            :maxlength="PROMPT_MAX"
            :placeholder="t('aiVideo.promptPlaceholder')"
            class="w-full resize-none rounded-[var(--kv-radius-md)] px-3 py-2 text-[14px] outline-none border border-[var(--kv-border-subtle)] bg-[var(--kv-bg-content)]"
            style="color: var(--kv-text-primary);"
          />
        </div>

        <div class="flex flex-wrap items-center gap-2 min-w-0">
          <img v-if="previewUrl" :src="previewUrl" alt="" class="h-12 w-12 shrink-0 rounded-[var(--kv-radius-sm)] object-cover" />
          <KvButton size="sm" variant="ghost" @click="fileInput?.click()">
            {{ ai.image.value ? t('aiVideo.imageChange') : t('aiVideo.imageAdd') }}
          </KvButton>
          <KvButton v-if="ai.image.value" size="sm" variant="ghost" @click="ai.image.value = null">
            {{ t('aiVideo.imageRemove') }}
          </KvButton>
          <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="onImage" />
        </div>
        <p class="text-[12px] -mt-2" style="color: var(--kv-text-muted);">{{ t('aiVideo.imageHint') }}</p>

        <AiVideoCostBar
          :duration-s="form.durationS.value"
          :estimate-usd="form.estimateUsd.value"
          :estimating="form.estimating.value"
          :estimate-failed="form.estimateFailed.value"
          :over-cap="form.overCap.value"
          :today-spent-usd="form.options.value?.todaySpentUsd ?? 0"
          :daily-cap-usd="form.options.value?.dailyCapUsd ?? 0"
          :can-submit="canSubmit"
          :busy="ai.busy.value"
          @submit="ai.submit"
        />
      </template>

      <p v-if="ai.error.value" class="text-[13px]" style="color: var(--kv-danger);">{{ ai.error.value }}</p>

      <AiVideoRecentList
        :rows="otherRecent"
        :status-label="ai.statusLabel"
        @open="onRecent"
        @remove="onRemove"
        @clear="onClear"
      />
    </div>
  </KvModal>
</template>
