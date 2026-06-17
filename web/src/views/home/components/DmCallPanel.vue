<script setup lang="ts">
/**
 * DmCallPanel — DM sohbetinin üstünde aktif sesli arama kartı (kabul edilince çıkar).
 * Katılımcı avatarları (konuşma halkası + mute göstergesi) + paylaşılan kontrol barı.
 * Yalnız bu DM kanalına bağlıyken görünür.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVoiceStore, type RoomMember } from '@/stores/voice'
import VoiceControlBar from '@/components/shared/VoiceControlBar.vue'
import VoiceVideoGrid from '@/components/shared/VoiceVideoGrid.vue'

const props = defineProps<{ channelId: string }>()
const { t } = useI18n()
const voiceStore = useVoiceStore()

const members = computed<RoomMember[]>(() => voiceStore.roomParticipants)

function isSpeaking(m: RoomMember): boolean {
  return voiceStore.speakingUserIds.has(m.userId) && !isMutedFor(m)
}
function isMutedFor(m: RoomMember): boolean {
  return m.isLocal ? voiceStore.isMuted : voiceStore.mutedUserIds.has(m.userId)
}
</script>

<template>
  <!-- REV-8: kabul sonrası bağlanırken anında "bağlanıyor" kartı (ses ekranı geç gelmiş hissi yerine) -->
  <div
    v-if="voiceStore.connectingChannelId === channelId && !voiceStore.isConnectedTo(channelId)"
    class="shrink-0 mx-4 mt-3 rounded-[var(--kv-radius-lg)] overflow-hidden flex items-center gap-2 px-4 py-3"
    style="background-color: var(--kv-bg-content); border: 1px solid var(--kv-border-subtle);"
  >
    <span class="w-2 h-2 rounded-full shrink-0 animate-pulse" style="background-color: var(--kv-accent-500);" />
    <span class="text-[13px]" style="color: var(--kv-text-secondary);">{{ t('voice.joining') }}</span>
  </div>

  <div
    v-else-if="voiceStore.isConnectedTo(channelId)"
    class="shrink-0 mx-4 mt-3 rounded-[var(--kv-radius-lg)] overflow-hidden"
    style="background-color: var(--kv-bg-content); border: 1px solid var(--kv-border-subtle);"
  >
    <!-- Üst etiket -->
    <div class="flex items-center gap-2 px-4 pt-3">
      <span class="w-2 h-2 rounded-full shrink-0" style="background-color: var(--kv-online, #3DB46E);" />
      <span class="text-[12px] font-semibold uppercase tracking-widest" style="color: var(--kv-online, #3DB46E);">
        {{ t('voice.connected') }}
      </span>
      <span class="text-[12px]" style="color: var(--kv-text-muted);">· {{ members.length }}</span>
    </div>

    <!-- C4: Video grid (yalnız aktif video track varsa) -->
    <div v-if="voiceStore.videoTracks.length" class="px-4 pt-3 pb-1">
      <VoiceVideoGrid />
    </div>

    <!-- Katılımcı avatarları (video yoksa veya video olmayan katılımcılar) -->
    <div class="flex flex-wrap items-start justify-center gap-6 px-4 py-5">
      <div v-for="m in members" :key="m.userId" class="flex flex-col items-center gap-2 w-[88px]">
        <div
          class="w-14 h-14 rounded-full flex items-center justify-center text-[20px] font-bold text-white overflow-hidden"
          :class="{ 'kv-speaking': isSpeaking(m) }"
          style="background-color: var(--kv-accent-500);"
        >
          <img v-if="m.avatarUrl" :src="m.avatarUrl" :alt="m.username" class="w-full h-full object-cover" />
          <span v-else>{{ m.username[0]?.toUpperCase() }}</span>
        </div>
        <div class="flex items-center gap-1 max-w-full">
          <svg v-if="isMutedFor(m)" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-danger);" class="shrink-0">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
          </svg>
          <span class="text-[12px] truncate" style="color: var(--kv-text-primary);">
            {{ m.username }}<template v-if="m.isLocal"> ({{ t('voice.you') }})</template>
          </span>
        </div>
      </div>
    </div>

    <!-- Kontrol barı -->
    <div class="pb-4">
      <VoiceControlBar />
    </div>
  </div>
</template>
