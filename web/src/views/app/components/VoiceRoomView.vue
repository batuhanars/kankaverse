<script setup lang="ts">
/**
 * VoiceRoomView — ses kanalına girildiğinde merkez alanda gösterilir (sohbet yerine).
 * Üstte kanal başlığı, ortada Discord-tarzı katılımcı kartları (avatar + konuşma halkası + mute),
 * altta kontrol barı (sustur / sağırlaştır / ayrıl). Katılımcılar LiveKit Room'dan canlı gelir.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVoiceStore, type RoomMember } from '@/stores/voice'
import { useChannelsStore } from '@/stores/channels'
import VoiceControlBar from '@/components/shared/VoiceControlBar.vue'

const { t } = useI18n()
const voiceStore = useVoiceStore()
const channelsStore = useChannelsStore()

// Aktif kanal (ses) store'dan — prop'suz; <component :is> ile metin varyantıyla simetrik
const channelId = computed(() => channelsStore.activeChannelId ?? '')
const channelName = computed(() => channelsStore.activeChannel()?.name ?? '')
const connectedHere = computed(() => voiceStore.connectedChannelId === channelId.value)
const members = computed<RoomMember[]>(() => (connectedHere.value ? voiceStore.roomParticipants : []))

function isSpeaking(m: RoomMember): boolean {
  return voiceStore.speakingUserIds.has(m.userId) && !isMutedFor(m)
}
function isMutedFor(m: RoomMember): boolean {
  return m.isLocal ? voiceStore.isMuted : voiceStore.mutedUserIds.has(m.userId)
}
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0 overflow-hidden rounded-[var(--kv-radius-lg)]" style="background-color: var(--kv-bg-content);">
    <!-- Üst başlık: ses kanalı adı -->
    <div class="shrink-0 flex items-center gap-2 px-4 h-14 border-b" style="border-color: var(--kv-border-subtle);">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
      <span class="text-[16px] font-semibold" style="color: var(--kv-text-primary);">{{ channelName }}</span>
      <span v-if="connectedHere" class="text-[13px]" style="color: var(--kv-text-muted);">· {{ members.length }}</span>
    </div>

    <!-- Orta: katılımcı kartları -->
    <div class="flex-1 min-h-0 overflow-y-auto p-6">
      <!-- Bağlanılıyor -->
      <div v-if="!connectedHere && voiceStore.connecting" class="h-full flex items-center justify-center">
        <p class="text-[15px]" style="color: var(--kv-text-muted);">{{ t('voice.joining') }}</p>
      </div>
      <!-- Bağlı değil → katıl -->
      <div v-else-if="!connectedHere" class="h-full flex flex-col items-center justify-center gap-3">
        <p class="text-[15px]" style="color: var(--kv-text-muted);">{{ t('voice.notConnected') }}</p>
        <button
          class="px-4 py-2 rounded-[var(--kv-radius-md)] text-[14px] font-semibold text-white cursor-pointer transition-opacity hover:opacity-90"
          style="background-color: var(--kv-accent-500);"
          @click="voiceStore.join(channelId)"
        >{{ t('voice.joinAction') }}</button>
        <p v-if="voiceStore.error" class="text-[13px]" style="color: var(--kv-danger);">{{ voiceStore.error }}</p>
      </div>
      <!-- Katılımcı ızgarası -->
      <div v-else class="flex flex-wrap gap-4 justify-center content-start">
        <div
          v-for="m in members"
          :key="m.userId"
          class="flex flex-col items-center gap-2 w-[160px] py-6 rounded-[var(--kv-radius-lg)]"
          style="background-color: var(--kv-bg-elevated);"
        >
          <!-- Avatar + konuşma halkası (animasyonlu) -->
          <div
            class="w-20 h-20 rounded-full flex items-center justify-center text-[28px] font-bold text-white overflow-hidden"
            :class="{ 'kv-speaking': isSpeaking(m) }"
            style="background-color: var(--kv-accent-500);"
          >
            <img v-if="m.avatarUrl" :src="m.avatarUrl" :alt="m.username" class="w-full h-full object-cover" />
            <span v-else>{{ m.username[0]?.toUpperCase() }}</span>
          </div>
          <!-- Ad + mute göstergesi -->
          <div class="flex items-center gap-1.5 max-w-full">
            <svg v-if="isMutedFor(m)" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-danger);" class="shrink-0">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
            </svg>
            <span class="text-[14px] truncate" style="color: var(--kv-text-primary);">
              {{ m.username }}<template v-if="m.isLocal"> ({{ t('voice.you') }})</template>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Alt kontrol barı (paylaşılan) -->
    <div v-if="connectedHere" class="shrink-0 py-4 border-t" style="border-color: var(--kv-border-subtle);">
      <VoiceControlBar />
    </div>
  </div>
</template>
