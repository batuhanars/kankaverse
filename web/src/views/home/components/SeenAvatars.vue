<script setup lang="ts">
/**
 * C67 — görüldü avatarları: bir mesajın altında, o mesajı SON olarak okuyanların küçük (22px; sahip isteğiyle 16'dan büyütüldü) daire avatarı.
 * Sağa hizalı; en yeni okuyan en sağda; en çok 5 avatar, fazlası soldaki "+N" ile. Üzerine gelince
 * "{ad} gördü · 18.42". Yerleşim kararı (hangi mesajın altı) üstte, bu bileşen yalnız çizer.
 * Her avatarın `data-seen-user`'ı FLIP animasyonu (DmConversation) için kimliktir.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SeenReader } from '@/types'

const MAX_AVATARS = 5

const props = defineProps<{ readers: SeenReader[] }>() // eskiden yeniye sıralı

const { t } = useI18n()

const shown = computed(() => props.readers.slice(-MAX_AVATARS))
const hidden = computed(() => props.readers.slice(0, Math.max(0, props.readers.length - MAX_AVATARS)))

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
}

function tooltip(r: SeenReader): string {
  return t('seen.tooltip', { name: r.username, time: formatTime(r.readAt) })
}
</script>

<template>
  <div class="flex justify-end items-center gap-0.5 px-4 pt-0.5" role="group" :aria-label="t('seen.label')">
    <span
      v-if="hidden.length"
      class="h-[22px] min-w-[22px] px-1.5 flex items-center justify-center rounded-full text-[11px] font-semibold select-none"
      style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
      :title="t('seen.more', { names: hidden.map((r) => r.username).join(', ') })"
    >+{{ hidden.length }}</span>
    <span
      v-for="r in shown"
      :key="r.userId"
      :data-seen-user="r.userId"
      class="relative w-[22px] h-[22px] shrink-0 rounded-full overflow-hidden flex items-center justify-center text-[11px] font-semibold text-white"
      style="background-color: var(--kv-accent-500);"
      :title="tooltip(r)"
      :aria-label="tooltip(r)"
      role="img"
    >
      <img v-if="r.avatarUrl" :src="r.avatarUrl" :alt="r.username" class="w-full h-full object-cover" />
      <span v-else aria-hidden="true">{{ r.username[0]?.toUpperCase() }}</span>
    </span>
  </div>
</template>
