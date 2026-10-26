<script setup lang="ts">
/**
 * AnimatedClipModal — Sprint C13 §5: GIF önizleme veya video kesit seçici + yükleme.
 * Akış: presign → S3 PUT → işle (sunucu hareketli WebP üretir). Sonuç UserDto olarak yukarı çıkar.
 */
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { usersApi, type AnimatedTarget } from '@/api/users'
import { attachmentsApi } from '@/api/attachments'
import {
  ANIMATED_MIN_MS,
  ANIMATED_MAX_MS,
  ANIMATED_DEFAULT_MS,
} from '@/utils/animatedMedia'
import type { UserDto } from '@/types'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'

const props = defineProps<{ file: File; target: AnimatedTarget }>()
const emit = defineEmits<{ close: []; done: [user: UserDto]; disabled: [] }>()

const i18n = useI18n()
const { t } = i18n

const isVideo = props.file.type.startsWith('video/')
const objectUrl = URL.createObjectURL(props.file)
onUnmounted(() => URL.revokeObjectURL(objectUrl))

const videoEl = ref<HTMLVideoElement | null>(null)
const durationSec = ref(0) // 0 = bilinmiyor (önizlenemeyen video)
const previewFailed = ref(false)
const startSec = ref(0)
const lenSec = ref(ANIMATED_DEFAULT_MS / 1000)

const minLen = ANIMATED_MIN_MS / 1000
const maxLen = computed(() => Math.min(ANIMATED_MAX_MS / 1000, durationSec.value || ANIMATED_MAX_MS / 1000))
const maxStart = computed(() => Math.max(0, durationSec.value - lenSec.value))

const busy = ref(false)
const phase = ref<'upload' | 'process'>('upload')
const pct = ref(0)
const error = ref('')

function onMeta() {
  const d = videoEl.value?.duration ?? 0
  if (!Number.isFinite(d) || d <= 0) {
    previewFailed.value = true
    return
  }
  durationSec.value = d
  lenSec.value = Math.max(minLen, Math.min(ANIMATED_DEFAULT_MS / 1000, d))
  startSec.value = 0
}

function onVideoError() {
  previewFailed.value = true
}

// Seçili aralığı döngüde oynat
function restart() {
  if (videoEl.value) videoEl.value.currentTime = startSec.value
}
function onTimeUpdate() {
  const v = videoEl.value
  if (v && v.currentTime >= startSec.value + lenSec.value) v.currentTime = startSec.value
}
function onStartInput() {
  restart()
}
function onLenInput() {
  if (startSec.value > maxStart.value) startSec.value = maxStart.value
  restart()
}

async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  phase.value = 'upload'
  pct.value = 0
  try {
    const { data: presigned } = await usersApi.animatedPresign(props.target, props.file.type, props.file.size)
    await attachmentsApi.uploadToS3(presigned.uploadUrl, props.file, (p) => {
      pct.value = p
    })
    phase.value = 'process'
    const payload: { stagingKey: string; startMs?: number; durationMs?: number } = {
      stagingKey: presigned.stagingKey,
    }
    if (isVideo && durationSec.value > 0) {
      payload.startMs = Math.round(startSec.value * 1000)
      payload.durationMs = Math.round(lenSec.value * 1000)
    }
    const { data } =
      props.target === 'AVATAR'
        ? await usersApi.setAnimatedAvatar(payload)
        : await usersApi.setAnimatedBanner(payload)
    emit('done', data)
  } catch (err: unknown) {
    const e2 = err as { response?: { data?: { error?: string; message?: string } } }
    if (e2.response?.data?.error === 'ANIMATED_DISABLED') {
      emit('disabled')
      return
    }
    const code = e2.response?.data?.error
    error.value =
      code && i18n.te(`profile.animated.errors.${code}`)
        ? t(`profile.animated.errors.${code}`)
        : (e2.response?.data?.message ?? t('profile.animated.errorUpload'))
  } finally {
    busy.value = false
  }
}

function close() {
  if (!busy.value) emit('close')
}

const shapeClass = computed(() =>
  props.target === 'AVATAR' ? 'rounded-full aspect-square w-40 mx-auto' : 'rounded-[var(--kv-radius-md)] w-full',
)
const shapeStyle = computed(() => (props.target === 'BANNER' ? { aspectRatio: '5 / 2' } : {}))
</script>

<template>
  <KvModal :title="t('profile.animated.title')" @close="close">
    <div class="flex flex-col gap-4 min-w-0">
      <p class="text-[13px]" style="color: var(--kv-text-muted);">
        {{ t(isVideo ? 'profile.animated.hintVideo' : 'profile.animated.hintGif') }}
      </p>

      <div class="overflow-hidden shrink-0" :class="shapeClass" :style="shapeStyle">
        <video
          v-if="isVideo"
          ref="videoEl"
          :src="objectUrl"
          class="w-full h-full object-cover"
          style="background-color: var(--kv-bg-elevated);"
          muted
          autoplay
          loop
          playsinline
          @loadedmetadata="onMeta"
          @error="onVideoError"
          @timeupdate="onTimeUpdate"
        />
        <img v-else :src="objectUrl" alt="" class="w-full h-full object-cover" />
      </div>

      <template v-if="isVideo">
        <p v-if="previewFailed" class="text-[12px]" style="color: var(--kv-text-muted);">
          {{ t('profile.animated.previewFailed') }}
        </p>
        <template v-else-if="durationSec > 0">
          <label class="flex flex-col gap-1 min-w-0">
            <span class="flex justify-between text-[13px]" style="color: var(--kv-text-secondary);">
              <span>{{ t('profile.animated.start') }}</span>
              <span>{{ t('profile.animated.seconds', { n: startSec.toFixed(1) }) }}</span>
            </span>
            <input
              v-model.number="startSec"
              type="range"
              min="0"
              :max="maxStart"
              step="0.1"
              :disabled="busy || maxStart === 0"
              class="w-full"
              style="accent-color: var(--kv-accent-500);"
              @input="onStartInput"
            />
          </label>
          <label class="flex flex-col gap-1 min-w-0">
            <span class="flex justify-between text-[13px]" style="color: var(--kv-text-secondary);">
              <span>{{ t('profile.animated.length') }}</span>
              <span>{{ t('profile.animated.seconds', { n: lenSec.toFixed(1) }) }}</span>
            </span>
            <input
              v-model.number="lenSec"
              type="range"
              :min="minLen"
              :max="maxLen"
              step="0.1"
              :disabled="busy || maxLen <= minLen"
              class="w-full"
              style="accent-color: var(--kv-accent-500);"
              @input="onLenInput"
            />
          </label>
        </template>
      </template>

      <p v-if="busy" class="text-[13px]" style="color: var(--kv-text-muted);">
        {{
          phase === 'upload'
            ? t('profile.animated.uploading', { pct })
            : t('profile.animated.processing')
        }}
      </p>
      <p v-if="error" class="text-[13px]" style="color: var(--kv-danger);">{{ error }}</p>

      <div class="flex flex-wrap justify-end gap-2">
        <KvButton variant="ghost" :disabled="busy" @click="close">{{ t('common.cancel') }}</KvButton>
        <KvButton :disabled="busy" :loading="busy" @click="submit">{{ t('profile.animated.use') }}</KvButton>
      </div>
    </div>
  </KvModal>
</template>
