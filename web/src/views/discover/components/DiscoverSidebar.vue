<script setup lang="ts">
/**
 * DiscoverSidebar — Keşfet nav (sidebar slot). HomeSidebar/ChannelPanel deseniyle
 * birebir (rail'e bitişik, mt-4 yüzen, 264px) → rail|sidebar|UserCard ızgarası korunur.
 * Tek gerçek bölüm: Ortamlar (aktif). Uygulamalar/Görevler henüz yok → eklenmez (anti-placeholder).
 */
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <aside
    class="flex flex-col shrink-0 rounded-[var(--kv-radius-lg)] overflow-hidden mt-4"
    style="width: var(--kv-panel-width); background-color: var(--kv-bg-sidebar);"
  >
    <!-- 64px başlık (uygulama header sistemi) -->
    <div
      class="flex items-center px-4 shrink-0 border-b"
      style="height: 64px; border-color: var(--kv-border-subtle);"
    >
      <h2 class="text-[18px] font-bold" style="color: var(--kv-text-primary);">
        {{ t('discover.navTitle') }}
      </h2>
    </div>

    <!-- Nav: Ortamlar (aktif) -->
    <nav class="flex-1 overflow-y-auto p-2">
      <span
        class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--kv-radius-md)] text-[14px] font-semibold"
        style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="7" rx="1.5" />
          <rect x="3" y="13" width="18" height="7" rx="1.5" />
        </svg>
        {{ t('discover.navServers') }}
      </span>
    </nav>
  </aside>
</template>
