<script setup lang="ts">
/**
 * Sprint C11 — mesaj akışındaki gün ayracı: ince çizgi + ortada tarih metni.
 *
 * Görseldir: seçilemez, tıklanamaz, hover/menü yok, mesaj değildir. Metin dışarıdan hazır
 * gelir (`dayDividerLabel`) — bu bileşen tarih hesabı yapmaz, yalnız çizer.
 */
defineProps<{ label: string }>()
</script>

<template>
  <div
    class="flex items-center gap-3 px-4 mt-3 select-none pointer-events-none"
    role="separator"
    :aria-label="label"
  >
    <span class="flex-1 h-px" style="background-color: var(--kv-border-subtle);" />
    <span class="text-[11px] font-semibold" style="color: var(--kv-text-muted);">{{ label }}</span>
    <span class="flex-1 h-px" style="background-color: var(--kv-border-subtle);" />
  </div>
</template>
