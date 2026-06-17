<script setup lang="ts">
/**
 * MuteDurationFlyout — "Sunucuyu Sustur" satırı + yana açılan süre menüsü (Görsel #15).
 * Discord deseni: susturulmamışken süre seçtirir (15dk/1s/3s/8s/24s/süresiz);
 * susturulmuşken tek satır "Sesini Aç" (alt etiket: ne zamana kadar).
 *
 * NotifLevelFlyout ile aynı konumlama/teleport/click-flyout iskeleti (tıklamayla açılır).
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  muted: boolean
  mutedUntil: string | null
}>()

const emit = defineEmits<{
  (e: 'mute', minutes: number | null): void // null = süresiz
  (e: 'unmute'): void
}>()

const { t } = useI18n()

const open = ref(false)
const triggerEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const flipLeft = ref(false)
const flyoutTop = ref(0)
const flyoutLeft = ref(0)

const FLYOUT_W = 200
const FLYOUT_H = 240

const options = computed(() => [
  { minutes: 15, label: t('guildMenu.mute15m') },
  { minutes: 60, label: t('guildMenu.mute1h') },
  { minutes: 180, label: t('guildMenu.mute3h') },
  { minutes: 480, label: t('guildMenu.mute8h') },
  { minutes: 1440, label: t('guildMenu.mute24h') },
  { minutes: null as number | null, label: t('guildMenu.muteForever') },
])

// Susturma bitiş etiketi (alt satır): "X tarihine kadar" veya süresiz
const untilLabel = computed(() => {
  if (!props.muted) return ''
  if (!props.mutedUntil) return t('guildMenu.muteUntilForever')
  const d = new Date(props.mutedUntil)
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const date = sameDay ? '' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) + ' '
  return t('guildMenu.muteUntil', { when: `${date}${time}` })
})

function positionFlyout() {
  const el = triggerEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const fitsRight = rect.right + FLYOUT_W + 4 <= window.innerWidth - 8
  flipLeft.value = !fitsRight
  flyoutLeft.value = fitsRight ? rect.right + 2 : rect.left - FLYOUT_W - 2
  let top = rect.top
  if (top + FLYOUT_H > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - FLYOUT_H - 8)
  }
  flyoutTop.value = top
}

function onTriggerClick() {
  // Susturulmuşsa tek tık → sesi aç (submenu yok, Discord deseni)
  if (props.muted) {
    emit('unmute')
    return
  }
  if (open.value) open.value = false
  else {
    open.value = true
    positionFlyout()
  }
}

function pick(minutes: number | null) {
  emit('mute', minutes)
  open.value = false
}

const flyoutStyle = computed(
  () => `top:${flyoutTop.value}px;left:${flyoutLeft.value}px;width:${FLYOUT_W}px;`,
)

function onDocPointer(e: MouseEvent) {
  if (!open.value) return
  const target = e.target as Node
  if (triggerEl.value?.contains(target)) return
  if (panelEl.value?.contains(target)) return
  open.value = false
}
function onScrollOrResize() {
  if (open.value) open.value = false
}
onMounted(() => {
  document.addEventListener('click', onDocPointer, true)
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocPointer, true)
  window.removeEventListener('scroll', onScrollOrResize, true)
  window.removeEventListener('resize', onScrollOrResize)
})
</script>

<template>
  <button
    ref="triggerEl"
    type="button"
    class="mdf-trigger"
    role="menuitem"
    :aria-haspopup="!muted"
    :aria-expanded="open"
    @click.stop="onTriggerClick"
  >
    <!-- Susturulmuşsa: ses-açık ikonu; değilse ses-kapalı (mute) ikonu -->
    <svg v-if="muted" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mdf-icon"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
    <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mdf-icon"><path d="M11 5 6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
    <span class="mdf-label">
      {{ muted ? t('guildMenu.unmute') : t('guildMenu.mute') }}
      <span v-if="muted && untilLabel" class="mdf-sublabel">{{ untilLabel }}</span>
    </span>
    <svg v-if="!muted" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="mdf-chevron"><path d="M9 18l6-6-6-6"/></svg>
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      ref="panelEl"
      class="mdf-flyout"
      role="menu"
      :style="flyoutStyle"
      :class="flipLeft ? 'mdf-flyout--left' : ''"
      @click.stop
    >
      <button
        v-for="opt in options"
        :key="opt.label"
        type="button"
        class="mdf-option"
        role="menuitem"
        @click="pick(opt.minutes)"
      >
        {{ opt.label }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.mdf-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--kv-radius-sm);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  color: var(--kv-text-primary);
  background: transparent;
  border: none;
  transition: background-color 0.12s;
}
.mdf-trigger:hover {
  background-color: var(--kv-accent-subtle);
}
.mdf-icon {
  flex-shrink: 0;
  color: var(--kv-text-muted);
}
.mdf-label {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.mdf-sublabel {
  font-size: 11px;
  color: var(--kv-text-muted);
}
.mdf-chevron {
  flex-shrink: 0;
  color: var(--kv-text-muted);
}
</style>

<!-- Flyout body'ye teleport — global stil (NotifLevelFlyout ile aynı dil) -->
<style>
.mdf-flyout {
  position: fixed;
  z-index: 10000;
  padding: 4px;
  background-color: var(--kv-bg-elevated);
  border: 1px solid var(--kv-border-subtle);
  border-radius: var(--kv-radius-md);
  overflow: hidden;
}
.mdf-option {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-radius: var(--kv-radius-sm);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  color: var(--kv-text-primary);
  background: transparent;
  border: none;
  transition: background-color 0.12s;
}
.mdf-option:hover {
  background-color: var(--kv-accent-subtle);
}
</style>
