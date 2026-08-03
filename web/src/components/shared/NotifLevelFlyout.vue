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
 *
 * Sprint WEB-PARITE §3.2 — açılma davranışı (hover + gecikmeli kapanma + klavye + tek-açık)
 * `useFlyoutMenu`'de; MuteDurationFlyout ile birebir aynı kural (ikinci kopya yok).
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFlyoutMenu } from '@/composables/useFlyoutMenu'
import { NotificationLevel, type NotificationLevel as NotificationLevelType } from '@/types'

const props = defineProps<{
  /** Mevcut efektif seviye (✓ için) */
  level: NotificationLevelType
  /**
   * R14 — ortam düzeyi bastırma bayrakları. **Yalnız ortam menüsünde** verilir; verilmezse
   * kutucuk bölümü hiç render edilmez (kanal menüsünde bu ayarlar YOK — sunucu kanal hedefini
   * `400 INVALID_PREF_TARGET` ile reddediyor, o yüzden gösterilmesi de yanlış olurdu).
   * Discord da bunları üst menüde değil, tam olarak bu panelin altında tutuyor.
   */
  suppressEveryone?: boolean
  suppressEvents?: boolean
  /** R15 — rol bahsetmelerini sustur (yine yalnız ortam menüsünde). */
  suppressRoleMentions?: boolean
}>()

const emit = defineEmits<{
  /** Seviye seçildi — çağıran setGuildLevel/setChannelLevel tetikler */
  (e: 'select', level: NotificationLevelType): void
  (e: 'toggle-everyone'): void
  (e: 'toggle-events'): void
  (e: 'toggle-role-mentions'): void
}>()

const { t } = useI18n()

const {
  open,
  triggerEl,
  panelEl,
  closeFlyout,
  toggleFlyout,
  onTriggerEnter,
  onTriggerLeave,
  onPanelEnter,
  onPanelLeave,
  onTriggerKeydown,
  onPanelKeydown,
} = useFlyoutMenu()

// Flyout SOLA mı açılacak (sağda yer yoksa)? + dikey hizalama (üst kenar)
const flipLeft = ref(false)
const flyoutTop = ref(0)
const flyoutLeft = ref(0)

// Bastırma kutucukları eklenince panel hem genişler hem uzar; konumlama (sağa/sola çevirme,
// alt kenardan taşma) bu ölçülere bakıyor, sabitler tek yerde tutulur.
const hasSuppressions = computed(
  () =>
    props.suppressEveryone !== undefined ||
    props.suppressEvents !== undefined ||
    props.suppressRoleMentions !== undefined,
)
const FLYOUT_W = computed(() => (hasSuppressions.value ? 252 : 184))
// Üç kutucuk + ayraç: yükseklik konumlama clamp'ini besliyor, satır eklenince güncellenmeli.
const FLYOUT_H = computed(() => (hasSuppressions.value ? 264 : 132))

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
  const fitsRight = rect.right + FLYOUT_W.value + 4 <= window.innerWidth - 8
  flipLeft.value = !fitsRight
  flyoutLeft.value = fitsRight ? rect.right + 2 : rect.left - FLYOUT_W.value - 2
  // Dikey: üst kenarla hizala; alt kenardan taşarsa yukarı kaydır
  let top = rect.top
  if (top + FLYOUT_H.value > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - FLYOUT_H.value - 8)
  }
  flyoutTop.value = top
}

function pick(level: NotificationLevelType) {
  emit('select', level)
  closeFlyout()
}

const flyoutStyle = computed(
  () => `top:${flyoutTop.value}px;left:${flyoutLeft.value}px;width:${FLYOUT_W.value}px;`,
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
    @click.stop="toggleFlyout(positionFlyout)"
    @mouseenter="onTriggerEnter(positionFlyout)"
    @mouseleave="onTriggerLeave"
    @keydown="onTriggerKeydown($event, positionFlyout)"
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
      @mouseenter="onPanelEnter"
      @mouseleave="onPanelLeave"
      @keydown="onPanelKeydown"
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

      <!-- R14 — bastırma kutucukları (yalnız ortam menüsünde). Seçince panel KAPANMAZ:
           kullanıcı arka arkaya iki kutuyu işaretleyebilsin (Discord da böyle). -->
      <template v-if="hasSuppressions">
        <div class="nlf-divider" />
        <button
          type="button"
          class="nlf-option"
          role="menuitemcheckbox"
          :aria-checked="suppressEveryone === true"
          @click="emit('toggle-everyone')"
        >
          <span class="nlf-option__label">{{ t('guildMenu.suppressEveryone') }}</span>
          <span class="nlf-box" :class="suppressEveryone ? 'nlf-box--on' : ''">
            <svg v-if="suppressEveryone" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          </span>
        </button>
        <button
          type="button"
          class="nlf-option"
          role="menuitemcheckbox"
          :aria-checked="suppressEvents === true"
          @click="emit('toggle-events')"
        >
          <span class="nlf-option__label">{{ t('guildMenu.suppressEvents') }}</span>
          <span class="nlf-box" :class="suppressEvents ? 'nlf-box--on' : ''">
            <svg v-if="suppressEvents" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          </span>
        </button>
        <button
          type="button"
          class="nlf-option"
          role="menuitemcheckbox"
          :aria-checked="suppressRoleMentions === true"
          @click="emit('toggle-role-mentions')"
        >
          <span class="nlf-option__label">{{ t('guildMenu.suppressRoleMentions') }}</span>
          <span class="nlf-box" :class="suppressRoleMentions ? 'nlf-box--on' : ''">
            <svg v-if="suppressRoleMentions" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          </span>
        </button>
      </template>
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

/* R14 — seviye radyoları ile bastırma kutucuklarını ayıran ince çizgi (menü ayracı dili) */
.nlf-divider {
  height: 1px;
  margin: 4px 6px;
  background-color: var(--kv-border-subtle);
}

/* Kutucuk: seviye satırlarındaki ✓'ten görsel olarak AYRI dursun — radyo değil, aç/kapa */
.nlf-box {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid var(--kv-border-strong, var(--kv-border-subtle));
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  transition:
    background-color 0.12s,
    border-color 0.12s;
}

.nlf-box--on {
  background-color: var(--kv-accent-500);
  border-color: var(--kv-accent-500);
  color: #fff;
}
</style>
