<script setup lang="ts">
/**
 * VoiceTile — tek katılımcı kutucuğu (video veya avatar). VoiceRoomView'da üç yerde kullanılır:
 *  - variant 'grid'  : eşit ızgara hücresi (kontroller + moderasyon menüsü görünür)
 *  - variant 'stage' : odak görünümünde büyük sahne kutucuğu (kontroller + moderasyon görünür)
 *  - variant 'strip' : sahne altındaki küçük şerit küçük-resmi (yalın: yalnız ad/mute göstergesi)
 *
 * Dış boyutu HER ZAMAN saran kapsayıcı belirler (ızgara hücresi / sahne flex / şerit sabit);
 * kutucuk yalnız `w-full h-full` ile dolar. Tıklama → `focus` emit (odaklamak için). Butonlar
 * `@click.stop` ile tıklamayı yutar. API çağrıları parent'ta; burada yalnız emit.
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onClickOutside } from '@vueuse/core'
import type { VoiceTileData } from '@/stores/voice'
import type { ChannelDto } from '@/types'

const props = defineProps<{
  tile: VoiceTileData
  variant: 'grid' | 'stage' | 'strip'
  speaking: boolean
  muted: boolean
  serverMuted: boolean
  fit: 'cover' | 'contain'
  canModerate: boolean
  canMute: boolean
  canMove: boolean
  moveTargets: ChannelDto[]
  broadcasting: boolean
  focused: boolean
}>()

const emit = defineEmits<{
  (e: 'focus'): void
  (e: 'server-mute'): void
  (e: 'move', target: ChannelDto): void
  (e: 'stop-broadcast'): void
  (e: 'disconnect'): void
}>()

const { t } = useI18n()

// Şeritte yalın görünüm: ağır kontroller (fit + moderasyon) gizli.
const isStrip = props.variant === 'strip'

function name(): string {
  return props.tile.member?.username ?? props.tile.entry?.username ?? ''
}
function isLocal(): boolean {
  return props.tile.member?.isLocal ?? props.tile.entry?.isLocal ?? false
}

// Video track → <video> bağlama (function ref; el null'da no-op). Bir track birden çok
// <video>'ya bağlanabilir (LiveKit) → sahne + şerit aynı anda gösterebilir.
function attachVideo(el: Element | null) {
  if (!el || props.tile.kind !== 'video') return
  try {
    props.tile.entry.track.attach(el as HTMLVideoElement)
  } catch {
    /* track zaten detach edilmiş olabilir — yoksay */
  }
}

// ── Moderasyon menüsü (kendi/owner hariç, izinli kullanıcı) — kutucuk-local state ─────────
const menuOpen = ref(false)
const moveSubmenuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)
onClickOutside(menuRef, () => {
  menuOpen.value = false
  moveSubmenuOpen.value = false
})
function toggleMenu() {
  menuOpen.value = !menuOpen.value
  moveSubmenuOpen.value = false
}
function closeMenu() {
  menuOpen.value = false
  moveSubmenuOpen.value = false
}
function onServerMute() {
  closeMenu()
  emit('server-mute')
}
function onMove(target: ChannelDto) {
  closeMenu()
  emit('move', target)
}
function onStopBroadcast() {
  closeMenu()
  emit('stop-broadcast')
}
function onDisconnect() {
  closeMenu()
  emit('disconnect')
}
</script>

<template>
  <div
    class="kv-video-tile group relative flex items-center justify-center min-h-0 min-w-0 w-full h-full overflow-hidden cursor-pointer"
    :class="isStrip ? 'rounded-[var(--kv-radius-md)]' : 'rounded-[var(--kv-radius-lg)]'"
    :style="`background-color: ${tile.kind === 'video' ? '#000' : 'var(--kv-bg-elevated)'};` +
      (focused ? ' box-shadow: inset 0 0 0 2px var(--kv-accent-500);'
        : (tile.member && speaking ? ' box-shadow: inset 0 0 0 2px var(--kv-accent-500);' : ''))"
    @click="emit('focus')"
  >
    <!-- Video (kamera = cover; ekran = contain, kırpma yok) -->
    <video
      v-if="tile.kind === 'video'"
      :ref="(el) => attachVideo(el as Element)"
      autoplay
      playsinline
      muted
      class="w-full h-full"
      :class="fit === 'contain' ? 'object-contain' : 'object-cover'"
      :aria-label="tile.entry.trackKind === 'screen' ? t('voice.screenShareActive') : t('voice.cameraActive')"
    />
    <!-- Avatar (video yok) -->
    <div
      v-else
      class="rounded-full flex items-center justify-center font-bold text-white overflow-hidden"
      :class="[isStrip ? 'w-10 h-10 text-[16px]' : 'w-24 h-24 text-[32px]', { 'kv-speaking': speaking }]"
      style="background-color: var(--kv-accent-500);"
    >
      <img v-if="tile.member.avatarUrl" :src="tile.member.avatarUrl" :alt="tile.member.username" class="w-full h-full object-cover" />
      <span v-else>{{ tile.member.username[0]?.toUpperCase() }}</span>
    </div>

    <!-- R11: moderasyon menüsü (şeritte gizli) -->
    <div
      v-if="!isStrip && tile.member && canModerate"
      class="absolute top-2 right-2 transition-opacity"
      :class="menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
    >
      <button
        class="flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
        style="width: 26px; height: 26px; color: #fff; background-color: rgba(0,0,0,0.5);"
        :aria-label="t('voice.moderationMenu')"
        @click.stop="toggleMenu"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="5" r="1" fill="currentColor"/>
          <circle cx="12" cy="12" r="1" fill="currentColor"/>
          <circle cx="12" cy="19" r="1" fill="currentColor"/>
        </svg>
      </button>

      <!-- Dropdown -->
      <div
        v-if="menuOpen"
        ref="menuRef"
        class="absolute right-0 top-full mt-1 z-20 rounded-[var(--kv-radius-md)] border overflow-hidden"
        style="min-width: 180px; background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
        @click.stop
      >
        <button
          v-if="canMute"
          class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-text-secondary);"
          @click="onServerMute"
        >
          {{ serverMuted ? t('voice.serverUnmute') : t('voice.serverMute') }}
        </button>
        <template v-if="canMove">
          <button
            class="w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
            style="color: var(--kv-text-secondary);"
            @click.stop="moveSubmenuOpen = !moveSubmenuOpen"
          >
            <span>{{ t('voice.moveTo') }}</span>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
              class="shrink-0 transition-transform" :class="moveSubmenuOpen ? 'rotate-90' : ''"
            >
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
          <div
            v-if="moveSubmenuOpen"
            class="max-h-56 overflow-y-auto border-t"
            style="border-color: var(--kv-border-subtle);"
          >
            <p
              v-if="moveTargets.length === 0"
              class="px-3 py-2 text-[12px]"
              style="color: var(--kv-text-muted);"
            >
              {{ t('voice.noMoveTargets') }}
            </p>
            <button
              v-for="target in moveTargets"
              :key="target.id"
              class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)] truncate"
              style="color: var(--kv-text-secondary);"
              @click="onMove(target)"
            >
              {{ target.name }}
            </button>
          </div>
        </template>
        <button
          v-if="canMute && broadcasting"
          class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-text-secondary);"
          @click="onStopBroadcast"
        >
          {{ t('voice.stopBroadcast') }}
        </button>
        <button
          v-if="canMove"
          class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-danger);"
          @click="onDisconnect"
        >
          {{ t('voice.disconnectUser') }}
        </button>
      </div>
    </div>

    <!-- Alt etiket: ad + mute/yayın göstergesi -->
    <div
      class="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full pointer-events-none"
      :class="isStrip ? 'px-1.5 py-0.5' : 'px-2 py-0.5'"
      style="background-color: rgba(0,0,0,0.5); max-width: calc(100% - 16px);"
    >
      <svg v-if="tile.member && serverMuted" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-danger);" class="shrink-0">
        <path d="M12 2L4 5v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V5l-8-3z"/>
        <line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>
      </svg>
      <svg v-else-if="tile.member && muted" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-danger);" class="shrink-0">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
      </svg>
      <svg v-else-if="tile.kind === 'video' && tile.entry.trackKind === 'screen'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #fff;" class="shrink-0">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
      <span class="truncate" :class="isStrip ? 'text-[11px]' : 'text-[12px]'" style="color: #fff;">
        {{ name() }}<template v-if="isLocal()"> ({{ t('voice.you') }})</template>
      </span>
    </div>
  </div>
</template>
