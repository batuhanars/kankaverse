<script setup lang="ts">
/**
 * VoiceParticipantList — bir ses kanalının altında "kanalda kim var" listesi.
 * ChannelPanel'de hem kategorisiz hem kategorili ses kanalları altında kullanılır (tek kaynak).
 * Liste backend WS + ilk GET ile beslenir (voice store); konuşan göstergesi yalnız bağlı kanalda.
 */
import { onMounted } from 'vue'
import { useVoiceStore } from '@/stores/voice'

const props = defineProps<{ channelId: string }>()
const voiceStore = useVoiceStore()

onMounted(() => {
  // Panelde göstermek için mevcut katılımcıları çek (WS sonrasını canlı tutar)
  voiceStore.loadParticipants(props.channelId)
})
</script>

<template>
  <div v-if="voiceStore.participantsFor(channelId).length" class="flex flex-col gap-0.5 pl-8 pr-2 pb-1">
    <div
      v-for="p in voiceStore.participantsFor(channelId)"
      :key="p.userId"
      class="flex items-center gap-2 py-0.5 text-[13px]"
      style="color: var(--kv-text-secondary);"
    >
      <!-- Avatar (daire) + konuşan yeşil halka -->
      <div
        class="w-5 h-5 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-semibold text-white"
        :style="{
          backgroundColor: 'var(--kv-accent-500)',
          boxShadow: voiceStore.speakingUserIds.has(p.userId) && voiceStore.isConnectedTo(channelId)
            ? '0 0 0 2px var(--kv-online, #3DB46E)'
            : 'none',
        }"
      >
        <img v-if="p.avatarUrl" :src="p.avatarUrl" :alt="p.username" class="w-full h-full object-cover" />
        <span v-else>{{ p.username[0]?.toUpperCase() }}</span>
      </div>
      <span class="truncate">{{ p.username }}</span>
    </div>
  </div>
</template>
