<script setup lang="ts">
/**
 * GIF düğmesinin simgesi (C23): dolu yuvarlak kutu, "GIF" kutudan OYULMUŞ (Discord GIF düğmesi deseni, sahip isteği).
 * Kutu `currentColor` (`.emoji-btn`: muted, hover'da secondary); harfler maskeyle oyulduğu için arkadaki zemin görünür,
 * tema/zemin rengi değişse de doğru kalır. Çizgi çerçeve + kıvrık köşe denendi (sahip turu 2026-10-27): 20px'te okunmuyordu.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 16 })

// Aynı sayfada birden fazla simge olabilir (kanal + DM kutusu): mask id'si çakışmasın.
const maskId = `kv-gif-mask-${Math.random().toString(36).slice(2, 8)}`
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true">
    <mask :id="maskId">
      <rect x="1.5" y="4.5" width="21" height="15" rx="3.5" fill="white" />
      <text
        x="12"
        y="15.6"
        text-anchor="middle"
        fill="black"
        font-size="10"
        font-weight="800"
        font-family="Figtree, sans-serif"
        letter-spacing="0.2"
      >GIF</text>
    </mask>
    <rect x="1.5" y="4.5" width="21" height="15" rx="3.5" fill="currentColor" :mask="`url(#${maskId})`" />
  </svg>
</template>
