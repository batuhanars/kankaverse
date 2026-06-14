<script setup lang="ts">
/**
 * VoiceControlBar — sustur / sağırlaştır / ayrıl yuvarlak kontrol barı.
 * Self-contained (voice store okur). VoiceRoomView (ortam) + DmCallPanel (DM) ortak kullanır.
 */
import { useI18n } from 'vue-i18n'
import { useVoiceStore } from '@/stores/voice'

const { t } = useI18n()
const voiceStore = useVoiceStore()
</script>

<template>
  <div class="flex items-center justify-center gap-3">
    <!-- Sustur (yalnız konuşma izni varsa) -->
    <button
      v-if="voiceStore.canPublish"
      class="w-11 h-11 flex items-center justify-center rounded-full cursor-pointer transition-colors"
      :title="voiceStore.isMuted ? t('voice.unmute') : t('voice.mute')"
      :style="{ backgroundColor: voiceStore.isMuted ? 'var(--kv-danger)' : 'var(--kv-bg-elevated)', color: voiceStore.isMuted ? '#fff' : 'var(--kv-text-primary)' }"
      @click="voiceStore.toggleMute()"
    >
      <svg v-if="!voiceStore.isMuted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
      </svg>
      <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/>
      </svg>
    </button>
    <!-- Sağırlaştır -->
    <button
      class="w-11 h-11 flex items-center justify-center rounded-full cursor-pointer transition-colors"
      :title="voiceStore.isDeafened ? t('voice.undeafen') : t('voice.deafen')"
      :style="{ backgroundColor: voiceStore.isDeafened ? 'var(--kv-danger)' : 'var(--kv-bg-elevated)', color: voiceStore.isDeafened ? '#fff' : 'var(--kv-text-primary)' }"
      @click="voiceStore.toggleDeafen()"
    >
      <svg v-if="!voiceStore.isDeafened" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
      </svg>
      <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="1" y1="1" x2="23" y2="23"/><path d="M3 18v-6a9 9 0 0 1 9-9M21 12v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
      </svg>
    </button>
    <!-- Ayrıl -->
    <button
      class="w-11 h-11 flex items-center justify-center rounded-full cursor-pointer transition-opacity hover:opacity-90"
      :title="t('voice.leave')"
      style="background-color: var(--kv-danger); color: #fff;"
      @click="voiceStore.leave()"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
    </button>
  </div>
</template>
