<script setup lang="ts">
/**
 * AiVideoDialog (Sprint C14 §3.1): istemden (+ isteğe bağlı görselden) 5 sn video üretir.
 * Akış mantığı `useAiVideo`da; burası yalnız görünüm. "Kullan" videoyu File'a çevirip `use` ile verir,
 * sonrası çağıranın akışıdır (mesaj eki ya da hareketli kesit). Kapı yalnız arayüz; sunucu otorite.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'
import { useAiVideo } from '@/composables/useAiVideo'

const props = defineProps<{ useLabel: string }>()
const emit = defineEmits<{ close: []; use: [file: File] }>()

const { t, n } = useI18n()
const ai = useAiVideo()
const fileInput = ref<HTMLInputElement | null>(null)
const previewUrl = ref<string | null>(null)

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const usd = (v: number) =>
  t('aiVideo.amount', { amount: n(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })
const canQuote = computed(() => !ai.busy.value && (ai.prompt.value.trim().length > 0 || !!ai.image.value))
const statusText = computed(() =>
  ai.job.value?.status === 'QUEUED' ? t('aiVideo.queued') : t('aiVideo.running', { sec: ai.elapsedSec.value }),
)
const done = computed(() => ai.job.value?.status === 'COMPLETED' && !!ai.job.value.videoUrl)
const failed = computed(() => ai.job.value?.status === 'FAILED')
const otherRecent = computed(() => ai.recent.value.filter((r) => r.id !== ai.job.value?.id))

watch(ai.image, (f) => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = f ? URL.createObjectURL(f) : null
  ai.quote.value = null // girdi değişti, eski teklif geçersiz
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

async function onUse() {
  const file = await ai.toFile()
  if (file) emit('use', file)
}
</script>

<template>
  <KvModal :title="t('aiVideo.title')" @close="emit('close')">
    <div class="flex flex-col gap-4 min-w-0 overflow-y-auto">
      <!-- Sonuç / ilerleme -->
      <template v-if="ai.job.value">
        <video
          v-if="done"
          :src="ai.job.value.videoUrl"
          class="w-full rounded-[var(--kv-radius-md)] bg-black max-h-[40vh]"
          controls
          autoplay
          loop
          muted
          playsinline
        />
        <p v-else-if="ai.working.value" class="text-[14px]" style="color: var(--kv-text-secondary);">{{ statusText }}</p>
        <p v-else-if="failed" class="text-[13px]" style="color: var(--kv-danger);">
          {{ ai.errorText(ai.job.value.errorCode) }}
        </p>
        <div class="flex flex-wrap gap-2">
          <KvButton v-if="done" :loading="ai.busy.value" @click="onUse">{{ props.useLabel }}</KvButton>
          <KvButton v-if="!ai.working.value" variant="ghost" @click="ai.reset">{{ t('aiVideo.newOne') }}</KvButton>
        </div>
      </template>

      <!-- Form -->
      <template v-else>
        <div>
          <label class="block text-[13px] font-medium mb-1" style="color: var(--kv-text-secondary);" for="ai-video-prompt">
            {{ t('aiVideo.promptLabel') }}
          </label>
          <textarea
            id="ai-video-prompt"
            v-model="ai.prompt.value"
            rows="3"
            maxlength="1000"
            :placeholder="t('aiVideo.promptPlaceholder')"
            class="w-full resize-none rounded-[var(--kv-radius-md)] px-3 py-2 text-[14px] outline-none border border-[var(--kv-border-subtle)] bg-[var(--kv-bg-content)]"
            style="color: var(--kv-text-primary);"
            @input="ai.quote.value = null"
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

        <p v-if="ai.quote.value" class="text-[13px]" style="color: var(--kv-text-secondary);">
          {{ t('aiVideo.quoteLine', { price: usd(ai.quote.value.quoteUsd) }) }}
          {{ t('aiVideo.spentLine', { spent: usd(ai.quote.value.todaySpentUsd), cap: usd(ai.quote.value.dailyCapUsd) }) }}
        </p>
        <KvButton v-if="ai.quote.value" :loading="ai.busy.value" @click="ai.submit">{{ t('aiVideo.generate') }}</KvButton>
        <KvButton v-else :disabled="!canQuote" :loading="ai.busy.value" @click="ai.getQuote">{{ t('aiVideo.seePrice') }}</KvButton>
      </template>

      <p v-if="ai.error.value" class="text-[13px]" style="color: var(--kv-danger);">{{ ai.error.value }}</p>

      <!-- Son üretimler: diyalog kapansa da ödenmiş sonuç kaybolmaz -->
      <section v-if="otherRecent.length" class="min-w-0">
        <h3 class="text-[13px] font-semibold mb-2" style="color: var(--kv-text-secondary);">{{ t('aiVideo.recent') }}</h3>
        <ul class="flex flex-col gap-1">
          <li v-for="r in otherRecent" :key="r.id">
            <button
              type="button"
              class="w-full text-left rounded-[var(--kv-radius-sm)] px-2 py-1.5 transition-colors hover:bg-[var(--kv-bg-elevated)] cursor-pointer min-w-0"
              @click="ai.open(r)"
            >
              <span class="block truncate text-[13px]" style="color: var(--kv-text-primary);">
                {{ r.prompt || t('aiVideo.fromImage') }}
              </span>
              <span class="block text-[11px]" :style="{ color: r.status === 'FAILED' ? 'var(--kv-danger)' : 'var(--kv-text-muted)' }">
                {{ r.status === 'FAILED' ? ai.errorText(r.errorCode) : t(`aiVideo.status.${r.status}`) }}
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </KvModal>
</template>
