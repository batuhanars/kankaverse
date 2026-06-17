<script setup lang="ts">
/**
 * Bildirim seviyesi flyout'u — context/dropdown menülerinde "Bildirim Ayarları"
 * satırı + yana açılan küçük panel (Tümü / Yalnız bahsetmeler / Hiçbiri).
 *
 * Discord deseni: satırın sağ kenarından açılır; sağda yer yoksa SOLA clamp eder.
 * ServerRail ortam menüsü + ChannelPanel ortam dropdown'u + ChannelPanel kanal
 * context menüsü → üç yerde tek component (DRY / Rule of Three).
 *
 * Görsel: kendi `--kv-*` tabanlı stili — host menü class'ından bağımsız tutarlı.
 * Gölge YOK (tasarım kuralı); katman = elevated bg + ince subtle kenarlık.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { NotificationLevel, type NotificationLevel as NotificationLevelType } from '@/types'

const props = defineProps<{
  /** Mevcut efektif seviye (✓ için) */
  level: NotificationLevelType
}>()

const emit = defineEmits<{
  /** Seviye seçildi — çağıran setGuildLevel/setChannelLevel tetikler */
  (e: 'select', level: NotificationLevelType): void
}>()

const { t } = useI18n()

const open = ref(false)
const triggerEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
// Flyout SOLA mı açılacak (sağda yer yoksa)? + dikey hizalama (üst kenar)
const flipLeft = ref(false)
const flyoutTop = ref(0)
const flyoutLeft = ref(0)

const FLYOUT_W = 184
const FLYOUT_H = 132

const options = computed(() => [
  { level: NotificationLevel.ALL, label: t('guildMenu.notificationsAll') },
  { level: NotificationLevel.MENTIONS, label: t('guildMenu.notificationsMentions') },
  { level: NotificationLevel.NONE, label: t('guildMenu.notificationsNone') },
])

function positionFlyout() {
  const el = triggerEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  // Yatay: tercihen sağa; sağda taşma varsa SOLA
  const fitsRight = rect.right + FLYOUT_W + 4 <= window.innerWidth - 8
  flipLeft.value = !fitsRight
  flyoutLeft.value = fitsRight ? rect.right + 2 : rect.left - FLYOUT_W - 2
  // Dikey: üst kenarla hizala; alt kenardan taşarsa yukarı kaydır
  let top = rect.top
  if (top + FLYOUT_H > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - FLYOUT_H - 8)
  }
  flyoutTop.value = top
}

function openFlyout() {
  open.value = true
  // DOM güncellensin diye ölçümü bir sonraki frame'e bırakmaya gerek yok —
  // trigger zaten render'da; konumu anında hesapla.
  positionFlyout()
}

function closeFlyout() {
  open.value = false
}

function onTriggerClick() {
  if (open.value) closeFlyout()
  else openFlyout()
}

function pick(level: NotificationLevelType) {
  emit('select', level)
  closeFlyout()
}

const flyoutStyle = computed(
  () => `top:${flyoutTop.value}px;left:${flyoutLeft.value}px;width:${FLYOUT_W}px;`,
)

// Dış-tık / scroll / resize → flyout kapanır (host menü zaten kendi kapanmasını yönetir,
// ama flyout body'ye teleport edildiği için ayrıca dinleriz).
function onDocPointer(e: MouseEvent) {
  if (!open.value) return
  const target = e.target as Node
  if (triggerEl.value?.contains(target)) return
  if (panelEl.value?.contains(target)) return
  // Flyout paneli body'de — kendi click'i pick() ile kapanır; dışarıyı kapat.
  closeFlyout()
}
function onScrollOrResize() {
  if (open.value) closeFlyout()
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
  <!-- Tetikleyici satır — host menü içinde "Bildirim Ayarları" -->
  <button
    ref="triggerEl"
    type="button"
    class="nlf-trigger"
    role="menuitem"
    :aria-haspopup="true"
    :aria-expanded="open"
    @click.stop="onTriggerClick"
  >
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nlf-icon"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
    <span class="nlf-label">{{ t('guildMenu.notifications') }}</span>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="nlf-chevron"><path d="M9 18l6-6-6-6"/></svg>
  </button>

  <!-- Yana açılan panel — body'ye teleport (host menü overflow:hidden'ı kırpmasın) -->
  <Teleport to="body">
    <div
      v-if="open"
      ref="panelEl"
      class="nlf-flyout"
      role="menu"
      :style="flyoutStyle"
      :class="flipLeft ? 'nlf-flyout--left' : ''"
      @click.stop
    >
      <button
        v-for="opt in options"
        :key="opt.level"
        type="button"
        class="nlf-option"
        role="menuitemradio"
        :aria-checked="props.level === opt.level"
        @click="pick(opt.level)"
      >
        <span class="nlf-option__label">{{ opt.label }}</span>
        <svg v-if="props.level === opt.level" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="nlf-check"><path d="M20 6 9 17l-5-5"/></svg>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
/* Tetikleyici — host menü item'larıyla görsel tutarlı (elevated bg menüde) */
.nlf-trigger {
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

.nlf-trigger:hover {
  background-color: var(--kv-accent-subtle);
}

.nlf-icon {
  flex-shrink: 0;
  color: var(--kv-text-muted);
}

.nlf-label {
  flex: 1 1 auto;
  min-width: 0;
}

.nlf-chevron {
  flex-shrink: 0;
  color: var(--kv-text-muted);
}
</style>

<!-- Flyout body'ye teleport — scoped class çalışmaz; global stil (gölge YOK) -->
<style>
.nlf-flyout {
  position: fixed;
  z-index: 10000;
  padding: 4px;
  background-color: var(--kv-bg-elevated);
  border: 1px solid var(--kv-border-subtle);
  border-radius: var(--kv-radius-md);
  overflow: hidden;
}

.nlf-option {
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

.nlf-option:hover {
  background-color: var(--kv-accent-subtle);
}

.nlf-option__label {
  flex: 1 1 auto;
  min-width: 0;
}

.nlf-check {
  flex-shrink: 0;
  color: var(--kv-accent-500);
}
</style>
