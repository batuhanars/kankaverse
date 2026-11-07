<script setup lang="ts">
/**
 * AiVideoDialog (Sprint C14b §3.1): model/çözünürlük/süre + istem (+ isteğe bağlı görsel) → video üretir.
 * İki görünüm, aynı anda biri: `form` (seçici/istem/ilerleme/son üretimler, düğmesiz) ve `preview` (tek videonun
 * düğmeleri, §4b). Önizlenen satır açık `previewRow`da tutulur. Akış mantığı `useAiVideo`/`useAiVideoForm`da; burası yalnız görünüm. Sonuç düğmeleri bağlama göre:
 * mode=chat → `send` (attachmentId, çağıran mevcut mesaj yoluna verir) · mode=media → `use` (File).
 * Kapı yalnız arayüz; sunucu otorite.
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'
import AiVideoOptions from '@/components/shared/AiVideoOptions.vue'
import AiVideoRefStrip from '@/components/shared/AiVideoRefStrip.vue'
import AiVideoPromptBox from '@/components/shared/AiVideoPromptBox.vue'
import AiVideoCostBar from '@/components/shared/AiVideoCostBar.vue'
import AiVideoRecentList from '@/components/shared/AiVideoRecentList.vue'
import AiVideoPreviewModal from '@/components/shared/AiVideoPreviewModal.vue'
import { useAiVideo } from '@/composables/useAiVideo'
import { aiVideoApi, type AiVideoDto } from '@/api/aiVideo'

const props = defineProps<{ mode: 'chat' | 'media' }>()
const emit = defineEmits<{ close: []; use: [file: File]; send: [attachmentId: string] }>()
const router = useRouter()

// C39: kilitli kullanıcı davet ekranına gider (mevcut /invite/:code akışı), pencere kapanır
function joinAccessGuild() {
  const code = form.options.value?.accessInviteCode
  if (!code) return
  emit('close')
  void router.push(`/invite/${code}`)
}

const { t } = useI18n()
const ai = useAiVideo()
const form = ai.form
const refs = ai.refs

const PROMPT_MAX = 1000
const view = ref<'form' | 'preview'>('form')
const previewRow = ref<AiVideoDto | null>(null)
let previewOpenedAt = 0
const STALE_MS = 10 * 60 * 1000 // presigned adres 15 dk; 10 dk sonra tazele

// Boş istem yalnız tek görsel (inputKey) kipinde serbest; referans kipinde sunucu 400 döner (C42)
const canSubmit = computed(
  () =>
    !ai.busy.value &&
    !refs.uploading.value &&
    refs.allReady.value &&
    (ai.prompt.value.trim().length > 0 || refs.singleImage.value),
)
const statusText = computed(() => {
  if (ai.saving.value) return t('aiVideo.saving')
  return ai.job.value?.status === 'QUEUED' ? t('aiVideo.queued') : t('aiVideo.running', { sec: ai.elapsedSec.value })
})
const failed = computed(() => ai.job.value?.status === 'FAILED')
const otherRecent = computed(() => ai.recent.value.filter((r) => r.id !== ai.job.value?.id))

// C42 §2: tek model açıkken model adı gösterilmez
const modelLabel = computed(() =>
  (form.options.value?.models.length ?? 0) > 1
    ? form.options.value?.models.find((m) => m.key === previewRow.value?.model)?.label
    : undefined,
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
  <KvModal v-else wide :title="t('aiVideo.title')" @close="emit('close')">
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
          :aspect-ratio="form.aspectRatio.value"
          :aspect-ratios="form.aspectRatios.value"
          :with-image="ai.withImage.value"
          @update:model="form.pickModel"
          @update:resolution="form.resolution.value = $event"
          @update:duration-s="form.durationS.value = $event"
          @update:aspect-ratio="form.aspectRatio.value = $event"
        >
          <AiVideoRefStrip
            :items="refs.items.value"
            :counts="refs.counts.value"
            :limits="refs.limits.value"
            :accept="refs.accept.value"
            :single-image="refs.singleImage.value"
            :error="refs.addError.value"
            :locked="ai.locked"
            @add="refs.addFiles"
            @remove="refs.remove"
          />

          <div class="w-full">
            <label class="block text-[13px] font-medium mb-1" style="color: var(--kv-text-secondary);" for="ai-video-prompt">
              {{ t('aiVideo.promptLabel') }}
            </label>
            <AiVideoPromptBox
              v-model="ai.prompt.value"
              :items="refs.items.value"
              :maxlength="PROMPT_MAX"
              :disabled="ai.locked"
              :placeholder="t('aiVideo.promptPlaceholder')"
            />
          </div>
        </AiVideoOptions>

        <AiVideoCostBar
          :duration-s="form.durationS.value"
          :estimate-credits="form.estimateCredits.value"
          :estimating="form.estimating.value"
          :estimate-failed="form.estimateFailed.value"
          :can-submit="canSubmit"
          :in-progress="ai.inProgress.value"
          :busy="ai.busy.value"
          :locked="ai.locked"
          :invite-code="form.options.value?.accessInviteCode ?? null"
          :grant="form.options.value?.grant ?? null"
          :has-video="refs.hasVideo.value"
          @submit="ai.submit"
          @join="joinAccessGuild"
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
