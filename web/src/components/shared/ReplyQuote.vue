<script setup lang="ts">
/**
 * Yanıt alıntısı — mesaj satırındaki alıntı ve mesaj kutusunun üstündeki yanıt bandı.
 * Yazar üstte, metin altta `lines` satıra kadar; alıntılanan mesajda ek varsa sağda küçük
 * önizleme (görsel/video) ya da türe göre simge + etiket. `author` null → mesaj silinmiş.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAttachmentThumb } from '@/composables/useAttachmentThumb'
import type { ReplyAttachmentDto } from '@/types'

const props = withDefaults(
  defineProps<{
    author: string | null
    /** Bahsetmeleri çözülmüş düz metin. Sunucu ek-yalnız mesajda "[dosya]" yollar (eski istemciler için). */
    text: string
    attachment?: ReplyAttachmentDto | null
    lines?: 1 | 2
    /** Tıklanınca alıntılanan mesaja gidilir (yalnız mesaj satırında). */
    clickable?: boolean
  }>(),
  { attachment: null, lines: 2, clickable: false },
)

const emit = defineEmits<{ open: [] }>()

const { t } = useI18n()

const thumb = useAttachmentThumb(() => props.attachment)

const kind = computed<'image' | 'video' | 'audio' | 'file' | null>(() => {
  const type = props.attachment?.contentType
  if (!type) return null
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  return 'file'
})

const KIND_ICON = { image: '📷', video: '🎬', audio: '🎤', file: '📄' } as const

const body = computed(() => {
  const text = props.text.trim()
  if (kind.value && (!text || text === '[dosya]')) {
    return kind.value === 'file' ? props.attachment!.filename : t(`reply.kind.${kind.value}`)
  }
  return text
})
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    class="flex items-stretch w-full min-w-0 text-left rounded-[var(--kv-radius-sm)] overflow-hidden"
    :class="clickable ? 'cursor-pointer hover:brightness-110 transition-[filter]' : ''"
    style="background-color: var(--kv-bg-elevated); border-left: 3px solid var(--kv-accent-500)"
    :title="clickable ? t('reply.jump') : undefined"
    @click="clickable && emit('open')"
  >
    <div class="flex-1 min-w-0 px-2 py-1">
      <template v-if="author !== null">
        <div class="text-[12px] font-semibold truncate" style="color: var(--kv-accent-500)">
          <slot name="author">{{ author }}</slot>
        </div>
        <div
          class="text-[13px] leading-snug break-words"
          :class="lines === 1 ? 'truncate' : 'line-clamp-2'"
          style="color: var(--kv-text-secondary)"
        >
          <span v-if="kind" class="mr-1" aria-hidden="true">{{ KIND_ICON[kind] }}</span
          >{{ body }}
        </div>
      </template>
      <div v-else class="text-[13px] italic py-0.5" style="color: var(--kv-text-muted)">
        {{ t('reply.deleted') }}
      </div>
    </div>
    <img
      v-if="thumb"
      :src="thumb"
      alt=""
      class="w-12 shrink-0 object-cover"
      :class="lines === 1 ? 'h-10' : 'min-h-12'"
    />
  </component>
</template>
