<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import EmojiPickerLib, { type EmojiExt } from 'vue3-emoji-picker'
import { getFrequentEmojis, recordEmojiUse } from '@/utils/frequentEmojis'
// @ts-ignore — CSS side-effect import; no type declarations needed
import 'vue3-emoji-picker/css'

defineOptions({ name: 'EmojiPicker' })

/**
 * anchorEl: Picker'ı tetikleyen butonun HTMLElement ref'i.
 * Verilirse Teleport to body + position:fixed ile viewport-farkındalıklı konumlandırma yapılır.
 * Verilmezse (eski kullanım): sıradan slot olarak render edilir (geriye dönük uyumlu).
 */
const props = withDefaults(
  defineProps<{
    anchorEl?: HTMLElement | null
    // false: seçim "kullanım" sayılmaz (ör. hızlı tepki yuvası düzenleme)
    trackFrequent?: boolean
  }>(),
  { anchorEl: undefined, trackFrequent: true },
)

const { t } = useI18n()

const emit = defineEmits<{ select: [emoji: string] }>()

function onSelect(emoji: EmojiExt) {
  if (props.trackFrequent) recordEmojiUse(emoji.i)
  emit('select', emoji.i)
}

// Sık kullanılanlar (C24): kütüphanenin bellek-içi "recent" grubu yerine kalıcı liste.
// Boşsa grup hiç verilmez → bölüm görünmez. Seçici her açılışta yeniden oluşur, liste taze okunur.
const FREQUENT_KEY = 'frequent'
const FREQUENT_ICON =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#a8a29a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
  )

function toPickerEmoji(char: string) {
  const u = Array.from(char)
    .map((c) => c.codePointAt(0)!.toString(16))
    .join('-')
  return { i: char, n: [char], r: u, t: 'neutral', u }
}

const frequent = getFrequentEmojis()
const additionalGroups = frequent.length
  ? { [FREQUENT_KEY]: frequent.map(toPickerEmoji) }
  : {}
const groupNames = { [FREQUENT_KEY]: t('reaction.frequent') }
const groupIcons = { [FREQUENT_KEY]: FREQUENT_ICON }
const groupOrder = frequent.length ? [FREQUENT_KEY] : []

// --- Teleport konumlandırma ---
const PANEL_W = 300
const PANEL_H = 360
const MARGIN = 8 // viewport kenarından minimum mesafe (px)

const style = ref<Record<string, string>>({})

function computePosition() {
  if (!props.anchorEl) return
  const r = props.anchorEl.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Dikey: üstte yer var mı? (panel yüksekliği + margin)
  const spaceAbove = r.top
  const spaceBelow = vh - r.bottom

  let top: number
  if (spaceAbove >= PANEL_H + MARGIN) {
    // Yukarı aç: panelin alt kenarı butonun üst kenarına yaslanır
    top = r.top - PANEL_H - MARGIN
  } else if (spaceBelow >= PANEL_H + MARGIN) {
    // Aşağı aç (flip)
    top = r.bottom + MARGIN
  } else {
    // İkisi de yetmiyorsa: üste kadar çık, kırpılmasın
    top = Math.max(MARGIN, r.top - PANEL_H - MARGIN)
  }

  // Yatay: sağ kenarı hizala, viewport'tan taşmayı kıs
  let left = r.right - PANEL_W
  left = Math.max(MARGIN, Math.min(left, vw - PANEL_W - MARGIN))

  style.value = {
    position: 'fixed',
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    zIndex: '9999',
  }
}

// Scroll/resize sırasında pozisyonu güncelle
function onScroll() { computePosition() }
function onResize() { computePosition() }

watch(
  () => props.anchorEl,
  (el) => {
    if (el) {
      nextTick(computePosition)
      window.addEventListener('scroll', onScroll, true)
      window.addEventListener('resize', onResize)
    } else {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <!-- Teleport modunda (anchorEl verilmişse): body'e Teleport et, position:fixed -->
  <Teleport v-if="anchorEl" to="body">
    <div class="kv-emoji-picker" :style="style" @click.stop>
      <EmojiPickerLib
        :native="true"
        theme="dark"
        :additional-groups="additionalGroups"
        :group-names="groupNames"
        :group-icons="groupIcons"
        :group-order="groupOrder"
        @select="onSelect"
      />
    </div>
  </Teleport>

  <!-- Geriye dönük uyumlu mod (anchorEl yoksa): normal akışta render -->
  <div v-else class="kv-emoji-picker" @click.stop>
    <EmojiPickerLib
      :native="true"
      theme="dark"
      :additional-groups="additionalGroups"
      :group-names="groupNames"
      :group-icons="groupIcons"
      :group-order="groupOrder"
      @select="onSelect"
    />
  </div>
</template>

<style scoped>
/*
  library'nin --v3-picker-* CSS değişkenlerini --kv-* token'larımıza yaklaştır.
  theme="dark" sınıfı .v3-color-theme-dark ekler; o temadan bağımsız override yapıyoruz.
  Gölge yok (box-shadow: none).
*/
.kv-emoji-picker :deep(.v3-emoji-picker) {
  --v3-picker-bg: var(--kv-bg-elevated);
  --v3-picker-fg: var(--kv-text-body);
  --v3-picker-border: var(--kv-border-subtle);
  --v3-picker-input-bg: var(--kv-bg-sidebar);
  --v3-picker-input-border: var(--kv-border-subtle);
  --v3-picker-input-focus-border: var(--kv-accent-500);
  --v3-picker-emoji-hover: var(--kv-bg-sidebar);
  --v3-group-image-filter: none;
  box-shadow: none;
  border: 1px solid var(--kv-border-subtle);
  border-radius: var(--kv-radius-md);
  /* makul boyut + iç scroll */
  height: 360px;
  width: 300px;
}
</style>
