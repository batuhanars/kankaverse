<script setup lang="ts">
/**
 * VoiceParticipantList — ChannelPanel'de bir ses kanalının altında "kanalda kim var".
 * Bağlı olduğun kanal → LiveKit Room'dan CANLI (webhook gerekmez); diğer kanallar → WS/GET snapshot.
 * Konuşan göstergesi yalnız bağlı kanalda (animasyonlu yeşil halka).
 */
import { computed, onMounted } from 'vue'
import { useVoiceStore, type VoiceParticipant } from '@/stores/voice'

const props = defineProps<{ channelId: string }>()
const voiceStore = useVoiceStore()

const connectedHere = computed(() => voiceStore.connectedChannelId === props.channelId)

// Bağlıysak canlı oda listesi; değilsek snapshot (diğer üyeler webhook ile)
const members = computed<(VoiceParticipant & { isLocal?: boolean })[]>(() =>
  connectedHere.value ? voiceStore.roomParticipants : voiceStore.participantsFor(props.channelId),
)

function isSpeaking(userId: string): boolean {
  return connectedHere.value && voiceStore.speakingUserIds.has(userId)
}
function isMuted(userId: string, isLocal?: boolean): boolean {
  if (!connectedHere.value) return false
  return isLocal ? voiceStore.isMuted : voiceStore.mutedUserIds.has(userId)
}

onMounted(() => {
  // Bağlı değilsek mevcut katılımcıları çek (snapshot); bağlıysak canlı liste zaten var
  if (!connectedHere.value) voiceStore.loadParticipants(props.channelId)
})
</script>

<template>
  <div v-if="members.length" class="flex flex-col gap-0.5 pl-8 pr-2 pb-1">
    <div
      v-for="p in members"
      :key="p.userId"
      class="flex items-center gap-2 py-0.5 text-[13px]"
      style="color: var(--kv-text-secondary);"
    >
      <!-- Avatar (daire) + konuşma halkası -->
      <div
        class="w-5 h-5 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-semibold text-white"
        :class="{ 'kv-speaking': isSpeaking(p.userId) }"
        style="background-color: var(--kv-accent-500);"
      >
        <img v-if="p.avatarUrl" :src="p.avatarUrl" :alt="p.username" class="w-full h-full object-cover" />
        <span v-else>{{ p.username[0]?.toUpperCase() }}</span>
      </div>
      <span class="truncate flex-1">{{ p.username }}</span>
      <!-- Mute göstergesi -->
      <svg
        v-if="isMuted(p.userId, p.isLocal)"
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        style="color: var(--kv-danger);" class="shrink-0"
      >
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
      </svg>
    </div>
  </div>
</template>
