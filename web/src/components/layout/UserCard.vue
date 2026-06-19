<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { usePresenceStore, type PresenceStatus } from '@/stores/presence'
import { useVoiceStore } from '@/stores/voice'
import VoiceConnectedBar from '@/components/layout/VoiceConnectedBar.vue'
import OutgoingCallBar from '@/components/layout/OutgoingCallBar.vue'
import { useSocket } from '@/composables/useSocket'
import { useAudioDevices } from '@/composables/useAudioDevices'
import { onClickOutside } from '@vueuse/core'

const emit = defineEmits<{ logout: []; openSettings: [section?: string] }>()
const { t } = useI18n()
const authStore = useAuthStore()
const presenceStore = usePresenceStore()
const voiceStore = useVoiceStore()
const { setPresence } = useSocket()

// Hızlı cihaz popover'ı (giriş/çıkış) — bara bağlı; ayarlara gitmeden cihaz değiştir.
const audio = useAudioDevices()
const devicePopover = ref<'input' | 'output' | null>(null)
function toggleDevicePopover(kind: 'input' | 'output') {
  devicePopover.value = devicePopover.value === kind ? null : kind
  if (devicePopover.value) {
    showPopover.value = false // diğer popover'ı kapat
    audio.refresh()
  }
}
function deviceLabel(d: MediaDeviceInfo, i: number): string {
  return d.label || t('settings.voice.deviceFallback', { n: i + 1 })
}

const inVoice = computed(() => !!voiceStore.connectedChannelId)
// Gösterilen durum: bağlıyken canlı; değilken VARSAYILAN tercih (katılınca uygulanır).
const showMuted = computed(() => (inVoice.value ? voiceStore.isMuted : voiceStore.preferMuted))
const showDeafened = computed(() => (inVoice.value ? voiceStore.isDeafened : voiceStore.preferDeafened))

const cardRef = ref<HTMLElement | null>(null)
const showPopover = ref(false)

onClickOutside(cardRef, () => { showPopover.value = false; devicePopover.value = null })

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
  presenceStore.setManualStatus(p) // bilerek seçim → auto-boşta bunu ezmez
  setPresence(p)
  // Optimistik güncelleme: backend event gelmeden önce UI'ı anında göster
  const myId = authStore.user?.id
  if (myId) presenceStore.applyUpdate(myId, p)
}

function goToSettings(section?: string) {
  showPopover.value = false
  devicePopover.value = null
  emit('openSettings', section)
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
          @click="goToSettings()"
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

    <!-- Birleşik panel: aktif ses barı (varsa) + kullanıcı pill — Discord-tarzı tek kart, arada tek border -->
    <div
      class="overflow-hidden rounded-[var(--kv-radius-lg)] transition-colors"
      :style="showPopover
        ? 'background-color: var(--kv-bg-content); border: 1px solid var(--kv-border-strong);'
        : 'background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle);'"
    >
      <!-- Giden çağrı çalıyor (DM'den çıksan da görünür; kabul edilince VoiceConnectedBar devralır) -->
      <OutgoingCallBar />

      <!-- Aktif ses oturumu (bağlıyken üstte; altında divider) -->
      <VoiceConnectedBar />

      <!-- Kullanıcı pill satırı (kendi border/rounding'i yok; kapsayıcı sağlıyor) -->
      <div class="w-full flex items-center gap-2.5 px-3 py-3">
      <!-- Menü tetikleyici: avatar + ad (kendi hover'ı; kart geneli hover yok) -->
      <button
        class="flex items-center gap-2.5 flex-1 min-w-0 overflow-hidden cursor-pointer text-left rounded-[var(--kv-radius-md)] px-1.5 py-1 -mx-1.5 -my-1 transition-colors hover:bg-[var(--kv-bg-content)]"
        @click="devicePopover = null; showPopover = !showPopover"
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

      <!-- V2 ses kontrolleri — bağlıyken canlı; değilken VARSAYILAN tercih (renk: açık=beyaz, kapalı=kırmızı) -->
      <div class="flex items-center gap-2 shrink-0">
        <!-- Mikrofon grubu (buton + ok bitişik) -->
        <div class="flex items-center">
          <button
            class="w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
            :title="showMuted ? t('voice.unmute') : t('voice.mute')"
            :style="{ color: showMuted ? 'var(--kv-danger)' : 'var(--kv-text-primary)' }"
            @click="voiceStore.toggleMute()"
          >
            <svg v-if="!showMuted" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
            </svg>
            <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
            </svg>
          </button>
          <button
            class="w-3.5 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
            :style="{ color: devicePopover === 'input' ? 'var(--kv-accent-500)' : 'var(--kv-text-muted)' }"
            :title="t('settings.voice.inputDevice')"
            @click.stop="toggleDevicePopover('input')"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="transition-transform duration-150" :class="devicePopover === 'input' ? 'rotate-180' : ''"><polyline points="6 15 12 9 18 15"/></svg>
          </button>
        </div>
        <!-- Kulaklık grubu (buton + ok bitişik) -->
        <div class="flex items-center">
          <button
            class="w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
            :title="showDeafened ? t('voice.undeafen') : t('voice.deafen')"
            :style="{ color: showDeafened ? 'var(--kv-danger)' : 'var(--kv-text-primary)' }"
            @click="voiceStore.toggleDeafen()"
          >
            <svg v-if="!showDeafened" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
            </svg>
            <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M3 18v-6a9 9 0 0 1 9-9M21 12v6"/>
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
            </svg>
          </button>
          <button
            class="w-3.5 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
            :style="{ color: devicePopover === 'output' ? 'var(--kv-accent-500)' : 'var(--kv-text-muted)' }"
            :title="t('settings.voice.outputDevice')"
            @click.stop="toggleDevicePopover('output')"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="transition-transform duration-150" :class="devicePopover === 'output' ? 'rotate-180' : ''"><polyline points="6 15 12 9 18 15"/></svg>
          </button>
        </div>
        <!-- Ses ayarları (gear) — diğerleri gibi belirgin -->
        <button
          class="w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
          style="color: var(--kv-text-primary);"
          :title="t('common.settings')"
          @click="goToSettings('profil')"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
      </div>
    </div>

    <!-- ── Hızlı cihaz popover'ı (giriş/çıkış) — bara binen, yukarı açılır ── -->
    <div
      v-if="devicePopover"
      class="absolute bottom-full right-2 mb-2 z-20 rounded-[var(--kv-radius-md)] border overflow-hidden"
      style="width: 248px; background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
      @click.stop
    >
      <p class="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
        {{ devicePopover === 'input' ? t('settings.voice.inputDevice') : t('settings.voice.outputDevice') }}
      </p>

      <!-- Giriş cihazı listesi -->
      <template v-if="devicePopover === 'input'">
        <div class="max-h-48 overflow-y-auto pb-1">
          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
            @click="voiceStore.setInputDevice('default')"
          >
            <span class="w-4 shrink-0" style="color: var(--kv-accent-500);"><svg v-if="voiceStore.inputDeviceId === 'default'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
            <span class="truncate" style="color: var(--kv-text-primary);">{{ t('settings.voice.systemDefault') }}</span>
          </button>
          <button
            v-for="(d, i) in audio.inputs.value"
            :key="d.deviceId"
            class="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
            @click="voiceStore.setInputDevice(d.deviceId)"
          >
            <span class="w-4 shrink-0" style="color: var(--kv-accent-500);"><svg v-if="voiceStore.inputDeviceId === d.deviceId" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
            <span class="truncate" style="color: var(--kv-text-primary);">{{ deviceLabel(d, i) }}</span>
          </button>
        </div>
      </template>

      <!-- Çıkış cihazı listesi + çıkış sesi -->
      <template v-else>
        <div v-if="audio.supportsOutputSelect" class="max-h-40 overflow-y-auto pb-1">
          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
            @click="voiceStore.setOutputDevice('default')"
          >
            <span class="w-4 shrink-0" style="color: var(--kv-accent-500);"><svg v-if="voiceStore.outputDeviceId === 'default'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
            <span class="truncate" style="color: var(--kv-text-primary);">{{ t('settings.voice.systemDefault') }}</span>
          </button>
          <button
            v-for="(d, i) in audio.outputs.value"
            :key="d.deviceId"
            class="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
            @click="voiceStore.setOutputDevice(d.deviceId)"
          >
            <span class="w-4 shrink-0" style="color: var(--kv-accent-500);"><svg v-if="voiceStore.outputDeviceId === d.deviceId" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
            <span class="truncate" style="color: var(--kv-text-primary);">{{ deviceLabel(d, i) }}</span>
          </button>
        </div>
        <div class="px-3 py-2">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[10px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">{{ t('settings.voice.outputVolume') }}</span>
            <span class="text-[12px] font-semibold" style="color: var(--kv-text-primary);">{{ Math.round(voiceStore.outputVolume * 100) }}%</span>
          </div>
          <input
            type="range" min="0" max="100" step="1"
            :value="Math.round(voiceStore.outputVolume * 100)"
            class="uc-vol w-full"
            :style="`background: linear-gradient(to right, var(--kv-accent-500) ${Math.round(voiceStore.outputVolume * 100)}%, var(--kv-bg-content) ${Math.round(voiceStore.outputVolume * 100)}%);`"
            @input="voiceStore.setOutputVolume(Number(($event.target as HTMLInputElement).value) / 100)"
          />
        </div>
      </template>

      <!-- İzin / Ses Ayarları -->
      <div class="border-t" style="border-color: var(--kv-border-subtle);">
        <button
          v-if="audio.needsPermission.value"
          class="w-full text-left px-3 py-2 text-[13px] cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-accent-500);"
          @click="audio.grant()"
        >
          {{ t('settings.voice.grant') }}
        </button>
        <button
          class="w-full flex items-center justify-between px-3 py-2 text-[13px] cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-text-secondary);"
          @click="goToSettings('ses')"
        >
          <span>{{ t('settings.voice.openSettings') }}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* Kart geneli hover kaldırıldı — hover/tıklama artık iç butonlarda (tetikleyici + mic + kulaklık). */

/* Cihaz popover'ı çıkış sesi kaydırıcısı */
.uc-vol {
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}
.uc-vol::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  border: none;
  cursor: pointer;
}
.uc-vol::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  border: none;
  cursor: pointer;
}
</style>
