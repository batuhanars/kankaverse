<script setup lang="ts">
/**
 * IncomingCallModal — gelen DM sesli arama daveti (AppShell'de global).
 * callStore.incoming dolunca üstte modal; 30sn cevapsız → otomatik reddet.
 */
import { watch, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCallStore } from '@/stores/call'
import { useCall } from '@/composables/useCall'

const { t } = useI18n()
const callStore = useCallStore()
const { acceptCall, rejectCall } = useCall()

let timer: ReturnType<typeof setTimeout> | null = null

// Nötr bilgi (ulaşılamadı / reddedildi / grup başladı) — kodları metne çevir, otomatik temizle
const noticeText = computed(() => {
  const n = callStore.notice
  if (!n) return ''
  if (n === 'unreachable') return t('call.unreachable')
  if (n === 'rejected') return t('call.rejected')
  if (n.startsWith('group:')) return t('call.groupStarted', { user: n.slice(6) })
  return ''
})
watch(() => callStore.notice, (n) => {
  if (n) setTimeout(() => callStore.clearNotice(), 4000)
})

watch(
  () => callStore.incoming?.channelId,
  (id) => {
    if (timer) { clearTimeout(timer); timer = null }
    if (id) {
      timer = setTimeout(() => {
        if (callStore.incoming?.channelId === id) rejectCall(id)
      }, 30_000)
    }
  },
)
onUnmounted(() => { if (timer) clearTimeout(timer) })
</script>

<template>
  <!-- Nötr bilgi şeridi (ulaşılamadı/reddedildi/grup) -->
  <div
    v-if="noticeText"
    class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-[var(--kv-radius-md)] text-[13px]"
    style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle); color: var(--kv-text-secondary);"
  >
    {{ noticeText }}
  </div>

  <div
    v-if="callStore.incoming"
    class="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-3 rounded-[var(--kv-radius-lg)]"
    style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-strong);"
  >
    <!-- Arayan avatarı -->
    <div
      class="w-10 h-10 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[15px] font-bold text-white"
      style="background-color: var(--kv-accent-500);"
    >
      <img v-if="callStore.incoming.caller.avatarUrl" :src="callStore.incoming.caller.avatarUrl" :alt="callStore.incoming.caller.username" class="w-full h-full object-cover" />
      <span v-else>{{ callStore.incoming.caller.username[0]?.toUpperCase() }}</span>
    </div>

    <div class="min-w-0">
      <p class="text-[12px]" style="color: var(--kv-text-muted);">{{ t('call.incoming') }}</p>
      <p class="text-[14px] font-semibold truncate" style="color: var(--kv-text-primary);">{{ callStore.incoming.caller.username }}</p>
    </div>

    <!-- Reddet -->
    <button
      class="w-9 h-9 flex items-center justify-center rounded-full cursor-pointer transition-opacity hover:opacity-90"
      :title="t('call.reject')"
      style="background-color: var(--kv-danger); color: #fff;"
      @click="rejectCall(callStore.incoming.channelId)"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/>
        <line x1="23" y1="1" x2="1" y2="23"/>
      </svg>
    </button>
    <!-- Kabul -->
    <button
      class="w-9 h-9 flex items-center justify-center rounded-full cursor-pointer transition-opacity hover:opacity-90"
      :title="t('call.accept')"
      style="background-color: var(--kv-online, #3DB46E); color: #fff;"
      @click="acceptCall(callStore.incoming.channelId)"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
    </button>
  </div>
</template>
