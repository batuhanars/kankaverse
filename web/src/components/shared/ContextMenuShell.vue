<script setup lang="ts">
/**
 * ContextMenuShell — sağ-tık / ⋯ menülerinin paylaşılan kabuğu (SPRINT_DM_MENU §2).
 *
 * Bugün dört kopya var (`rail-ctx`, `ch-ctx`, `GuildMemberRow`, `VoiceParticipantList`);
 * bu kabuk beşincisini yazmamak için doğdu. **Bu sprintte yalnız DM menüsü kullanır** —
 * üç canlı yüzey bilinçli olarak taşınmadı (sözleşme §1 OUT, borç tetikleyiciyle kayıtlı).
 *
 * Sorumluluk: body'ye teleport · viewport kenar sıkıştırması · dışarı-tık/ESC/scroll ile
 * kapanma · `useMenuCoordinator` (aynı anda tek menü) · <768'de alt sayfa (bottom sheet).
 * Öğeleri çağıran yazar (default slot).
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useMenuCoordinator } from '@/composables/useMenuCoordinator'
import { useResponsive } from '@/composables/useResponsive'

const props = defineProps<{
  /** İmleç/çapa X (viewport koordinatı) — alt sayfa modunda yok sayılır */
  x: number
  /** İmleç/çapa Y — alt sayfa modunda yok sayılır */
  y: number
  /** useMenuCoordinator kimliği (tekil açık menü) */
  menuId: string
}>()

const emit = defineEmits<{ close: [] }>()

const { isMobile } = useResponsive()
const { openExclusive, releaseIfOwner, closeOnOther } = useMenuCoordinator()

const menuEl = ref<HTMLElement | null>(null)
const left = ref(props.x)
const top = ref(props.y)

// Kenar payı — ch-ctx/rail-ctx ile aynı (8px)
const EDGE = 8

/**
 * Konumu gerçek ölçüyle sıkıştırır (sabit tahmini yükseklik DEĞİL: öğe sayısı çağırana
 * göre değişiyor, tahmin tutmaz). Kabuk (x,y)'de basılır, `onMounted` boyayı beklemeden
 * düzeltir → görünür zıplama olmaz.
 */
function clampToViewport() {
  const el = menuEl.value
  if (!el || isMobile.value) return
  const rect = el.getBoundingClientRect()
  left.value = Math.max(EDGE, Math.min(props.x, window.innerWidth - rect.width - EDGE))
  top.value = Math.max(EDGE, Math.min(props.y, window.innerHeight - rect.height - EDGE))
}

const posStyle = computed(() => (isMobile.value ? '' : `left:${left.value}px;top:${top.value}px;`))

// Başka bir menü açılırsa bu kapanır (koordinatör)
closeOnOther(props.menuId, () => emit('close'))

function onDocPointer() {
  emit('close')
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
function onScrollOrResize() {
  emit('close')
}

// Dinleyiciler yalnız menü açıkken (bileşen v-if ile monte ediliyor) yaşar. Menüyü açan
// tık/sağ-tık olayı bu dinleyicilere ULAŞMAZ: mount flush'ı olay yayılımından sonra çalışır.
onMounted(() => {
  openExclusive(props.menuId)
  clampToViewport()
  document.addEventListener('click', onDocPointer)
  document.addEventListener('contextmenu', onDocPointer)
  document.addEventListener('keydown', onKey)
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize)
})

onUnmounted(() => {
  releaseIfOwner(props.menuId)
  document.removeEventListener('click', onDocPointer)
  document.removeEventListener('contextmenu', onDocPointer)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', onScrollOrResize, true)
  window.removeEventListener('resize', onScrollOrResize)
})

// Aynı menü başka bir satıra taşınırsa (açıkken sağ-tık) konum tazelenir.
// `flush: 'post'`: yeni satırın öğe sayısı farklı olabilir (1-1 DM 7, grup 4) → ölçüm
// DOM güncellendikten SONRA alınmalı, yoksa eski yükseklikle sıkıştırılır.
watch(() => [props.x, props.y], clampToViewport, { flush: 'post' })
</script>

<template>
  <Teleport to="body">
    <!-- Alt sayfa perdesi — yalnız <768. Geniş ekranda perde YOK (imleç menüsü). -->
    <div
      v-if="isMobile"
      class="kv-ctx-scrim"
      @click="emit('close')"
      @contextmenu.prevent="emit('close')"
    />
    <div
      ref="menuEl"
      class="kv-ctx"
      :class="isMobile ? 'kv-ctx--sheet' : ''"
      role="menu"
      :style="posStyle"
      @click.stop
      @contextmenu.prevent.stop
    >
      <slot />
    </div>
  </Teleport>
</template>

<!-- 🔴 SCOPED DEĞİL — bilinçli. Vue'da scoped stil **slot içeriğine geçmez** (slot içeriği
     çağıranın scope'una aittir), dolayısıyla öğe stilleri scoped bir blokta yazılsa çağıranda
     hiç uygulanmazdı. Bu yüzden hepsi kök `.kv-ctx` sınıfı altında namespace'lenir.
     Görsel `ch-ctx` ile birebir: elevated bg, ince subtle kenarlık, GÖLGE YOK. -->
<style>
.kv-ctx {
  position: fixed;
  z-index: 9999;
  min-width: 216px;
  padding: 4px;
  background-color: var(--kv-bg-elevated);
  border: 1px solid var(--kv-border-subtle);
  border-radius: var(--kv-radius-md);
  overflow: hidden;
}

.kv-ctx__item {
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

.kv-ctx__item:hover {
  background-color: var(--kv-accent-subtle);
}

.kv-ctx__item:disabled {
  cursor: default;
  color: var(--kv-text-muted);
}

.kv-ctx__item:disabled:hover {
  background-color: transparent;
}

.kv-ctx__icon {
  flex-shrink: 0;
  color: var(--kv-text-muted);
}

.kv-ctx__item--danger {
  color: var(--kv-danger);
}

.kv-ctx__item--danger .kv-ctx__icon {
  color: var(--kv-danger);
}

.kv-ctx__item--danger:hover {
  background-color: rgba(242, 59, 75, 0.1);
}

.kv-ctx__divider {
  height: 1px;
  margin: 4px 6px;
  background-color: var(--kv-border-subtle);
}

/* Etiket esner → sağdaki işaret sağa yapışır */
.kv-ctx__label {
  flex: 1 1 auto;
  min-width: 0;
}

.kv-ctx__check {
  flex-shrink: 0;
  color: var(--kv-accent-500);
}

/* ── <768: alt sayfa (sözleşme §5). İmleç konumu yok sayılır; tam genişlik, alta yaslı. ── */
.kv-ctx-scrim {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background-color: var(--kv-bg-overlay);
}

.kv-ctx--sheet {
  left: 0;
  right: 0;
  bottom: 0;
  top: auto;
  min-width: 0;
  border-radius: var(--kv-radius-lg) var(--kv-radius-lg) 0 0;
  border-bottom: none;
  padding: 6px 8px;
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
}

/* Dokunmatik hedef. `.mdf-trigger`/`.nlf-trigger` başka bileşenlerin satırları: onların
   scoped stili min-height TANIMLAMIYOR, burada yalnız eksik olan ölçü veriliyor (çakışma yok). */
.kv-ctx--sheet .kv-ctx__item,
.kv-ctx--sheet .mdf-trigger,
.kv-ctx--sheet .nlf-trigger {
  min-height: 44px;
  font-size: 14px;
}
</style>
