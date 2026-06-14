<script setup lang="ts">
/**
 * OutgoingCallBar — giden 1-1 sesli arama "çalıyor" durumu için global kalıcı bar (UserCard üstünde).
 * DM sohbetinden çıksan da görünür kalır → ringing'i her yerden görebilir/iptal edebilirsin.
 * Kabul edilince callStore.outgoing temizlenir (useSocket) → bar kaybolur, VoiceConnectedBar devralır.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCallStore } from '@/stores/call'
import { useCall } from '@/composables/useCall'
import { useDmStore } from '@/stores/dm'

const { t } = useI18n()
const callStore = useCallStore()
const { cancelCall } = useCall()
const dmStore = useDmStore()

const calleeName = computed(() => {
  const id = callStore.outgoing?.channelId
  if (!id) return ''
  const dm = dmStore.channels.find((c) => c.id === id)
  if (!dm) return ''
  if (dm.type === 'DM') return dm.otherUser.username
  return dm.name ?? dm.members.map((m) => m.username).join(', ')
})
</script>

<template>
  <div
    v-if="callStore.outgoing"
    class="flex items-center gap-2 px-3 py-2 border-b"
    style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
  >
    <!-- Çalan telefon ikonu (pulse) -->
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="shrink-0 animate-pulse" style="color: var(--kv-accent-500);"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>

    <div class="flex-1 min-w-0">
      <p class="text-[11px] font-semibold truncate" style="color: var(--kv-accent-500);">
        {{ t('call.calling') }}
      </p>
      <p v-if="calleeName" class="text-[13px] truncate" style="color: var(--kv-text-primary);">{{ calleeName }}</p>
    </div>

    <!-- İptal -->
    <button
      class="w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
      :title="t('call.cancel')"
      style="color: var(--kv-danger);"
      @click="cancelCall(callStore.outgoing.channelId)"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
</template>
