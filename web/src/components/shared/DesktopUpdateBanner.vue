<script setup lang="ts">
/**
 * Masaüstü güncelleme bandı (C31a). Yalnız Electron kabuğunda ve yeni sürüm indirildiyse görünür;
 * tarayıcıda ve eski kurulumlarda (onUpdateReady yok) hiç render edilmez.
 * Kapatma düğmesi yok (2026-11-25, mobil bantla aynı karar): güncelleme varken bandı gizlemenin
 * kullanıcıya faydası yok. Yeniden başlatmazsa çıkışta güncelleme zaten kurulur.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const ready = ref(false)
let unsubscribe: (() => void) | undefined

onMounted(() => {
  unsubscribe = window.kankaverse?.onUpdateReady?.(() => {
    ready.value = true
  })
})

onUnmounted(() => unsubscribe?.())

function restart() {
  window.kankaverse?.installUpdate?.()
}
</script>

<template>
  <div
    v-if="ready"
    class="flex items-center justify-between gap-4 px-4 py-2 text-[13px] shrink-0"
    style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary, inherit); border-bottom: 1px solid var(--kv-border-strong);"
  >
    <span>{{ t('desktopUpdate.message') }}</span>
    <div class="flex items-center gap-3 shrink-0">
      <button
        class="font-medium underline cursor-pointer"
        style="color: var(--kv-accent-500);"
        @click="restart"
      >
        {{ t('desktopUpdate.restart') }}
      </button>
    </div>
  </div>
</template>
