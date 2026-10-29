<script setup lang="ts">
import { ref } from 'vue'

// Tek satır metin: sığmazsa düz kırpılır ("…" yok); fareyle üzerine gelince GERÇEKTEN taşıyorsa
// sola kayıp son kelimeyi gösterir, hover bitince başa döner. Kapsayıcı genişliği metne bağlı
// değildir (ebeveyn flex zincirini genişletmez). Hareketsiz tercih edenlerde yalnız `title`.
const props = defineProps<{ text: string }>()

const PX_PER_SEC = 40
const MIN_SEC = 1.5
const BACK_SEC = 0.4

const el = ref<HTMLElement | null>(null)

function start() {
  const node = el.value
  if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const dist = node.scrollWidth - node.clientWidth
  if (dist <= 0) return
  node.style.transition = `text-indent ${Math.max(MIN_SEC, dist / PX_PER_SEC)}s linear`
  node.style.textIndent = `-${dist}px`
}

function stop() {
  const node = el.value
  if (!node) return
  node.style.transition = `text-indent ${BACK_SEC}s ease-out`
  node.style.textIndent = '0px'
}
</script>

<template>
  <span
    ref="el"
    class="mq block min-w-0 max-w-full overflow-hidden whitespace-nowrap"
    :title="props.text"
    @mouseenter="start"
    @mouseleave="stop"
  >{{ props.text }}</span>
</template>

<style scoped>
/* Üç nokta yok: metin göründüğü yere kadar düz kırpılır (sahip kararı). */
.mq { text-overflow: clip; }
</style>
