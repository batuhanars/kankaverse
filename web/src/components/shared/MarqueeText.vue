<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

// Tek satır metin: sığmazsa düz kırpılır ("…" yok); fareyle üzerine gelince GERÇEKTEN taşıyorsa
// metin sola kayıp sonunu gösterir, hover bitince başa döner. Kayan şey iç `span`'dır
// (`transform: translateX`), kapsayıcı genişliği metne bağlı değildir. Tetikleyici: en yakın
// `.group` satırı (satırın herhangi bir yerine gelmek yeter), yoksa metnin kendisi.
// Hareketsiz tercih edenlerde yalnız `title`.
const props = defineProps<{ text: string }>()

const PX_PER_SEC = 40
const MIN_SEC = 1.5
const BACK_SEC = 0.4

const outer = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
let host: HTMLElement | null = null

function start() {
  const o = outer.value
  const i = inner.value
  if (!o || !i || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const dist = i.scrollWidth - o.clientWidth
  if (dist <= 0) return
  i.style.transition = `transform ${Math.max(MIN_SEC, dist / PX_PER_SEC)}s linear`
  i.style.transform = `translateX(-${dist}px)`
}

function stop() {
  const i = inner.value
  if (!i) return
  i.style.transition = `transform ${BACK_SEC}s ease-out`
  i.style.transform = 'translateX(0)'
}

onMounted(() => {
  host = outer.value?.closest<HTMLElement>('.group') ?? outer.value
  host?.addEventListener('mouseenter', start)
  host?.addEventListener('mouseleave', stop)
})

onBeforeUnmount(() => {
  host?.removeEventListener('mouseenter', start)
  host?.removeEventListener('mouseleave', stop)
})
</script>

<template>
  <span ref="outer" class="mq block min-w-0 max-w-full overflow-hidden whitespace-nowrap" :title="props.text">
    <span ref="inner" class="mq-inner inline-block whitespace-nowrap">{{ props.text }}</span>
  </span>
</template>

<style scoped>
.mq-inner { will-change: transform; }
</style>
