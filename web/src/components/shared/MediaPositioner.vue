<script setup lang="ts">
/**
 * MediaPositioner: Sprint C13b §3. Sabit oranlı çerçevede kaynağı sürükle + yakınlaştır/uzaklaştır.
 * Taban 1x = kaynak çerçeveyi doldurur ("cover"); alt sınır kaynağın tamamının sığdığı değer, üst sınır 4x.
 * Çıktı `crop`: kaynağın doğal boyutuna oranla kesirler (sunucu otorite, sözleşme §2.1). Uzaklaştırınca
 * pencere kaynaktan büyür (width > 1, x < 0), boş alanı sunucu saydam bırakır. Kırpmayı sunucu yapar;
 * burada yalnız dikdörtgen hesaplanır, kaynak CSS ile konumlanır.
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { CropFractions } from '@/utils/animatedMedia'

const props = defineProps<{
  src: string
  kind: 'image' | 'video'
  // banner = profil afişi 5:2; guildBanner = ortam afişi 2:1 (kanal paneli ~248x120)
  shape: 'circle' | 'banner' | 'guildBanner'
  disabled?: boolean
}>()
const emit = defineEmits<{
  'update:crop': [crop: CropFractions | null]
  meta: [info: { width: number; height: number; duration: number }]
  error: []
  timeupdate: []
}>()

const ASPECT = { circle: '1 / 1', banner: '5 / 2', guildBanner: '2 / 1' } as const
const ZOOM_MAX = 4

const frameEl = ref<HTMLElement | null>(null)
const videoEl = ref<HTMLVideoElement | null>(null)
const fw = ref(0)
const fh = ref(0)
const nw = ref(0)
const nh = ref(0)
// Durum: çerçeve merkezinin kaynak üzerindeki kesirli konumu + yakınlaştırma.
// Piksel değil kesir saklanır; çerçeve yeniden boyutlansa da konum bozulmaz.
const cx = ref(0.5)
const cy = ref(0.5)
const zoom = ref(1)

const ready = computed(() => nw.value > 0 && nh.value > 0 && fw.value > 0 && fh.value > 0)
const scale = computed(() => (ready.value ? Math.max(fw.value / nw.value, fh.value / nh.value) * zoom.value : 1))
const dw = computed(() => nw.value * scale.value)
const dh = computed(() => nh.value * scale.value)
// Alt sınır: kaynağın tamamının çerçeveye sığdığı yakınlaştırma ("contain" / "cover")
const zoomMin = computed(() => {
  if (!ready.value) return 1
  const r = (fw.value / nw.value) / (fh.value / nh.value)
  return Math.min(r, 1 / r)
})

function between(value: number, a: number, b: number) {
  return Math.min(Math.max(a, b), Math.max(Math.min(a, b), value))
}

// Kaynak çerçeveden büyükse çerçeve kaynağın içinde, küçükse kaynak çerçevenin içinde kalır.
function clampCenter() {
  if (!ready.value) return
  const hx = fw.value / 2 / dw.value
  const hy = fh.value / 2 / dh.value
  cx.value = between(cx.value, hx, 1 - hx)
  cy.value = between(cy.value, hy, 1 - hy)
}

const mediaStyle = computed(() => {
  if (!ready.value) return { width: '100%', height: '100%', objectFit: 'cover' as const }
  return {
    width: `${dw.value}px`,
    height: `${dh.value}px`,
    left: `${fw.value / 2 - cx.value * dw.value}px`,
    top: `${fh.value / 2 - cy.value * dh.value}px`,
  }
})

const crop = computed<CropFractions | null>(() => {
  if (!ready.value) return null
  const width = fw.value / dw.value
  const height = fh.value / dh.value
  const x = between(cx.value - width / 2, 0, 1 - width)
  const y = between(cy.value - height / 2, 0, 1 - height)
  return { x, y, width, height }
})
watch(crop, (c) => emit('update:crop', c), { immediate: true })

function setZoom(z: number) {
  if (!ready.value) return
  zoom.value = Math.min(ZOOM_MAX, Math.max(zoomMin.value, z))
  clampCenter()
}

function onMediaReady(w: number, h: number, duration = 0) {
  nw.value = w
  nh.value = h
  cx.value = 0.5
  cy.value = 0.5
  zoom.value = 1
  emit('meta', { width: w, height: h, duration })
}
function onImgLoad(e: Event) {
  const img = e.target as HTMLImageElement
  onMediaReady(img.naturalWidth, img.naturalHeight)
}
function onVideoMeta() {
  const v = videoEl.value
  if (!v) return
  onMediaReady(v.videoWidth, v.videoHeight, v.duration)
}

// ── Sürükleme (pointer events: fare + dokunma) ──
let dragging = false
let lastX = 0
let lastY = 0
function onPointerDown(e: PointerEvent) {
  if (props.disabled || !ready.value) return
  dragging = true
  lastX = e.clientX
  lastY = e.clientY
  frameEl.value?.setPointerCapture(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  cx.value -= (e.clientX - lastX) / dw.value
  cy.value -= (e.clientY - lastY) / dh.value
  lastX = e.clientX
  lastY = e.clientY
  clampCenter()
}
function onPointerUp(e: PointerEvent) {
  dragging = false
  if (frameEl.value?.hasPointerCapture(e.pointerId)) frameEl.value.releasePointerCapture(e.pointerId)
}
function onWheel(e: WheelEvent) {
  if (props.disabled) return
  setZoom(zoom.value * Math.exp(-e.deltaY * 0.0015))
}

// Klavye: oklarla kaydır, +/- ile yakınlaştır
function onKeyDown(e: KeyboardEvent) {
  if (props.disabled || !ready.value) return
  const step = 0.04 / zoom.value
  if (e.key === 'ArrowLeft') cx.value -= step
  else if (e.key === 'ArrowRight') cx.value += step
  else if (e.key === 'ArrowUp') cy.value -= step
  else if (e.key === 'ArrowDown') cy.value += step
  else if (e.key === '+' || e.key === '=') setZoom(zoom.value + 0.2)
  else if (e.key === '-') setZoom(zoom.value - 0.2)
  else return
  e.preventDefault()
  clampCenter()
}

let ro: ResizeObserver | null = null
function measure() {
  const el = frameEl.value
  if (!el) return
  fw.value = el.clientWidth
  fh.value = el.clientHeight
  clampCenter()
}
onMounted(() => {
  measure()
  if (frameEl.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(measure)
    ro.observe(frameEl.value)
  }
})
onUnmounted(() => ro?.disconnect())

defineExpose({ videoEl })
</script>

<template>
  <div class="flex flex-col gap-3 min-w-0">
    <div
      ref="frameEl"
      class="relative overflow-hidden select-none outline-none"
      :class="
        shape === 'circle'
          ? 'rounded-full aspect-square w-full max-w-[224px] mx-auto'
          : 'rounded-[var(--kv-radius-md)] w-full'
      "
      :style="{
        aspectRatio: ASPECT[shape],
        touchAction: 'none',
        cursor: ready && !disabled ? 'grab' : 'default',
        backgroundColor: 'var(--kv-bg-elevated)',
        boxShadow: '0 0 0 2px var(--kv-accent-500)',
      }"
      tabindex="0"
      role="group"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel.prevent="onWheel"
      @keydown="onKeyDown"
    >
      <video
        v-if="kind === 'video'"
        ref="videoEl"
        :src="src"
        class="absolute max-w-none pointer-events-none"
        :style="mediaStyle"
        muted
        autoplay
        loop
        playsinline
        @loadedmetadata="onVideoMeta"
        @error="emit('error')"
        @timeupdate="emit('timeupdate')"
      />
      <img
        v-else
        :src="src"
        alt=""
        draggable="false"
        class="absolute max-w-none pointer-events-none"
        :style="mediaStyle"
        @load="onImgLoad"
        @error="emit('error')"
      />
    </div>

    <label v-if="ready" class="flex items-center gap-3 min-w-0">
      <span class="text-[13px] shrink-0" style="color: var(--kv-text-secondary);">
        {{ $t('profile.animated.zoom') }}
      </span>
      <input
        :value="zoom"
        type="range"
        :min="zoomMin"
        :max="ZOOM_MAX"
        step="0.01"
        :disabled="disabled"
        class="flex-1 min-w-0"
        style="accent-color: var(--kv-accent-500);"
        @input="setZoom(Number(($event.target as HTMLInputElement).value))"
      />
    </label>
  </div>
</template>
