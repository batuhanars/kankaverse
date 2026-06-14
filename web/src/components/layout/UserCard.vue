<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePresenceStore, type PresenceStatus } from '@/stores/presence'
import { useVoiceStore } from '@/stores/voice'
import { useSocket } from '@/composables/useSocket'
import { onClickOutside } from '@vueuse/core'

const emit = defineEmits<{ logout: [] }>()
const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const presenceStore = usePresenceStore()
const voiceStore = useVoiceStore()
const { setPresence } = useSocket()

// Ses kontrolleri yalnız sesli kanala bağlıyken etkin
const inVoice = computed(() => !!voiceStore.connectedChannelId)

const cardRef = ref<HTMLElement | null>(null)
const showPopover = ref(false)

onClickOutside(cardRef, () => { showPopover.value = false })

// Seçilebilir durumlar (offline/invisible → yalnız disconnect ile; kullanıcı seçemez)
type SelectableStatus = 'online' | 'away' | 'dnd'

const presenceOptions: { key: SelectableStatus; color: string }[] = [
  { key: 'online', color: '#3DB46E' },
  { key: 'away',   color: '#E8A33D' },
  { key: 'dnd',    color: '#F23B4B' },
]

// Mevcut durum: presenceStore'dan okunur (backend snapshot/update gelince güncellenir)
const currentPresence = computed<PresenceStatus>(() => presenceStore.myStatus)

function presenceColor(p: PresenceStatus) {
  if (p === 'online')  return '#3DB46E'
  if (p === 'away')    return '#E8A33D'
  if (p === 'dnd')     return '#F23B4B'
  return '#6E675E'
}

function selectPresence(p: SelectableStatus) {
  setPresence(p)
  // Optimistik güncelleme: backend event gelmeden önce UI'ı anında göster
  const myId = authStore.user?.id
  if (myId) presenceStore.applyUpdate(myId, p)
}

function goToSettings() {
  showPopover.value = false
  router.push({ name: 'settings-security' })
}

function onLogout() {
  showPopover.value = false
  emit('logout')
}
</script>

<template>
  <div ref="cardRef" class="relative z-10 px-2 pb-4 pt-4 shrink-0">

    <!-- Upward popover -->
    <div
      v-if="showPopover"
      class="absolute bottom-full left-0 right-0 mb-1.5 rounded-[var(--kv-radius-lg)] overflow-hidden"
      style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle); box-shadow: 0 -4px 24px rgba(0,0,0,0.5);"
    >
      <!-- Profil başlığı -->
      <div class="px-3 pt-3 pb-3 border-b" style="border-color: var(--kv-border-subtle);">
        <div class="flex items-center gap-2.5">
          <div class="relative shrink-0">
            <div
              class="w-10 h-10 rounded-full flex items-center justify-center text-[15px] font-bold text-white"
              style="background-color: var(--kv-accent-500);"
            >
              {{ authStore.user?.username.charAt(0).toUpperCase() }}
            </div>
            <span
              class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 block"
              :style="`background-color: ${presenceColor(currentPresence)}; border-color: var(--kv-bg-elevated);`"
            />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[14px] font-bold truncate" style="color: var(--kv-text-primary);">
              {{ authStore.user?.username }}
            </p>
            <p class="text-[11px] truncate" :style="`color: ${presenceColor(currentPresence)};`">
              {{ t(`presence.${currentPresence}`) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Durum seçici -->
      <div class="px-2 py-2 border-b" style="border-color: var(--kv-border-subtle);">
        <p class="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
          {{ t('userCard.status') }}
        </p>
        <button
          v-for="opt in presenceOptions"
          :key="opt.key"
          class="w-full flex items-center gap-2.5 px-2 py-2 rounded-[var(--kv-radius-sm)] cursor-pointer text-left transition-colors hover:bg-[var(--kv-bg-content)]"
          :style="currentPresence === opt.key ? 'background-color: var(--kv-bg-content);' : ''"
          @click="selectPresence(opt.key)"
        >
          <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="`background-color: ${opt.color};`" />
          <span class="text-[13px]" style="color: var(--kv-text-primary);">{{ t(`presence.${opt.key}`) }}</span>
        </button>

      </div>

      <!-- Ayarlar + Çıkış -->
      <div class="px-2 py-2">
        <button
          class="w-full flex items-center gap-2.5 px-2 py-2 rounded-[var(--kv-radius-sm)] cursor-pointer text-left transition-colors hover:bg-[var(--kv-bg-content)]"
          @click="goToSettings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span class="text-[13px]" style="color: var(--kv-text-primary);">{{ t('common.settings') }}</span>
        </button>
        <button
          class="w-full flex items-center gap-2.5 px-2 py-2 rounded-[var(--kv-radius-sm)] cursor-pointer text-left transition-colors hover:bg-[var(--kv-bg-content)]"
          @click="onLogout"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-danger);">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span class="text-[13px]" style="color: var(--kv-danger);">{{ t('auth.logout') }}</span>
        </button>
      </div>
    </div>

    <!-- Kompakt pill — DIŞ KAPSAYICI DIV (iç içe buton geçersiz HTML; mic/kulaklık ayrı buton) -->
    <div
      class="pill-btn w-full flex items-center gap-2.5 px-3 py-3 rounded-[var(--kv-radius-lg)] transition-colors"
      :style="showPopover
        ? 'background-color: var(--kv-bg-content); border: 1px solid var(--kv-border-strong);'
        : 'background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle);'"
    >
      <!-- Menü tetikleyici: avatar + ad (tıkla → popover) -->
      <button
        class="flex items-center gap-2.5 flex-1 min-w-0 overflow-hidden cursor-pointer text-left"
        @click="showPopover = !showPopover"
      >
        <!-- Avatar + presence dot -->
        <div class="relative shrink-0">
          <div
            class="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-bold text-white overflow-hidden"
            style="background-color: var(--kv-accent-500);"
          >
            {{ authStore.user?.username.charAt(0).toUpperCase() }}
          </div>
          <span
            class="absolute bottom-0 right-0 w-[11px] h-[11px] rounded-full border-2 block"
            :style="`background-color: ${presenceColor(currentPresence)}; border-color: var(--kv-bg-elevated);`"
          />
        </div>

        <!-- Kullanıcı adı + durum -->
        <div class="flex flex-col min-w-0 flex-1 overflow-hidden">
          <span class="text-[14px] font-semibold truncate leading-[1.3]" style="color: var(--kv-text-primary);">
            {{ authStore.user?.username }}
          </span>
          <span class="text-[12px] truncate leading-[1.2]" :style="`color: ${presenceColor(currentPresence)};`">
            {{ t(`presence.${currentPresence}`) }}
          </span>
        </div>
      </button>

      <!-- V2 ses kontrolleri — yalnız sesli kanala bağlıyken etkin (renk: açık=beyaz, kapalı=kırmızı) -->
      <div class="flex items-center gap-1 shrink-0" :class="inVoice ? '' : 'opacity-20 pointer-events-none'">
        <!-- Kendini sustur -->
        <button
          class="w-7 h-7 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
          :title="voiceStore.isMuted ? t('voice.unmute') : t('voice.mute')"
          :style="{ color: voiceStore.isMuted ? 'var(--kv-danger)' : 'var(--kv-text-primary)' }"
          @click="voiceStore.toggleMute()"
        >
          <!-- Açık mikrofon -->
          <svg v-if="!voiceStore.isMuted" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
          </svg>
          <!-- Susturulmuş mikrofon (çizgili) -->
          <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
          </svg>
        </button>
        <!-- Kendini sağırlaştır -->
        <button
          class="w-7 h-7 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
          :title="voiceStore.isDeafened ? t('voice.undeafen') : t('voice.deafen')"
          :style="{ color: voiceStore.isDeafened ? 'var(--kv-danger)' : 'var(--kv-text-primary)' }"
          @click="voiceStore.toggleDeafen()"
        >
          <!-- Açık kulaklık -->
          <svg v-if="!voiceStore.isDeafened" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
          </svg>
          <!-- Sağırlaştırılmış kulaklık (çizgili) -->
          <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M3 18v-6a9 9 0 0 1 9-9M21 12v6"/>
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
          </svg>
        </button>
      </div>
    </div>

  </div>
</template>

<style scoped>
.pill-btn:not([data-open]):hover {
  background-color: var(--kv-bg-content) !important;
}
</style>
