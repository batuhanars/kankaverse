<script setup lang="ts">
/**
 * VoiceConnectedBar — aktif ses oturumu için kalıcı bar (UserCard üstünde).
 * Bağlı kanal adı + kendini sustur (canPublish ise) + ayrıl. Kanal değişse de oturum kopmaz.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVoiceStore } from '@/stores/voice'
import { useChannelsStore } from '@/stores/channels'
import { useDmStore } from '@/stores/dm'

const { t } = useI18n()
const voiceStore = useVoiceStore()
const channelsStore = useChannelsStore()
const dmStore = useDmStore()

const channelName = computed(() => {
  const id = voiceStore.connectedChannelId
  if (!id) return ''
  // Guild kanalları (oturum guild değişse de sürer)
  for (const list of Object.values(channelsStore.channelsByGuild)) {
    const ch = list.find((c) => c.id === id)
    if (ch) return ch.name ?? ''
  }
  // DM/grup araması: 1-1 → karşı kullanıcı, grup → grup adı/üyeler
  const dm = dmStore.channels.find((c) => c.id === id)
  if (dm) {
    if (dm.type === 'DM') return dm.otherUser.username
    return dm.name ?? dm.members.map((m) => m.username).join(', ')
  }
  return ''
})
</script>

<template>
  <!-- Hata: bağlanılamadı (sessiz başarısızlık yerine görünür) -->
  <div
    v-if="voiceStore.error && !voiceStore.connectedChannelId"
    class="flex items-center gap-2 px-3 py-2 border-b"
    style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
  >
    <span class="flex-1 text-[12px]" style="color: var(--kv-danger);">{{ voiceStore.error }}</span>
    <button class="text-[12px] cursor-pointer" style="color: var(--kv-text-muted);" @click="voiceStore.clearError()">✕</button>
  </div>

  <!-- Bağlanılıyor -->
  <div
    v-else-if="voiceStore.connecting"
    class="flex items-center gap-2 px-3 py-2 border-b"
    style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
  >
    <span class="text-[13px]" style="color: var(--kv-text-secondary);">{{ t('voice.joining') }}</span>
  </div>

  <div
    v-else-if="voiceStore.connectedChannelId"
    class="flex flex-col border-b"
    style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
  >
    <div class="flex items-center gap-2 px-3 py-2">
    <!-- Bağlı durum ikonu (yeşil) -->
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-online, #3DB46E);" class="shrink-0">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    </svg>

    <div class="flex-1 min-w-0">
      <p class="text-[11px] font-semibold truncate" style="color: var(--kv-online, #3DB46E);">
        {{ t('voice.connected') }}
      </p>
      <p class="text-[13px] truncate" style="color: var(--kv-text-primary);">{{ channelName }}</p>
    </div>

    <!-- Mute kontrolü VoiceRoomView + UserCard'da; burada yalnız ayrıl -->

    <!-- Ayrıl -->
    <button
      class="w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
      :title="t('voice.leave')"
      style="color: var(--kv-danger);"
      @click="voiceStore.leave()"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
    </button>
    </div>
    <!-- Mikrofon açılamadı uyarısı (sessiz yutma yerine görünür) -->
    <div
      v-if="voiceStore.micError"
      class="px-3 pb-2 text-[11px] leading-snug"
      style="color: var(--kv-danger);"
    >
      {{ voiceStore.micError === 'insecure' ? t('voice.micInsecure') : t('voice.micDenied') }}
    </div>
  </div>
</template>
