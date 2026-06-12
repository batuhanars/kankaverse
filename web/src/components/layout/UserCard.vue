<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

function goToSettings() {
  router.push({ name: 'settings-security' })
}
</script>

<template>
  <!-- Dış alan: absolute bottom, yeterli iç boşluk -->
  <div class="absolute bottom-0 shrink-0 px-2 pt-2 pb-3 w-full">
    <!-- Kart: belirgin arka plan, hover'da açılır -->
    <div
      class="group flex items-center gap-2 px-3 py-2.5 rounded-[var(--kv-radius-lg)] transition-colors cursor-pointer"
      style="background-color: var(--kv-bg-elevated);"
      @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-content)'"
      @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'"
    >
      <!-- Avatar + presence dot -->
      <div class="relative shrink-0">
        <div
          class="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-bold text-white"
          style="background-color: var(--kv-accent-500);"
        >
          {{ authStore.user?.username.charAt(0).toUpperCase() }}
        </div>
        <span
          class="absolute bottom-0 right-0 w-[11px] h-[11px] rounded-full border-2 block"
          style="background-color: #3DB46E; border-color: var(--kv-bg-elevated);"
        />
      </div>

      <!-- İsim + animasyonlu durum -->
      <div class="flex flex-col min-w-0 flex-1 overflow-hidden">
        <span
          class="text-[13px] font-semibold truncate leading-[1.3]"
          style="color: var(--kv-text-primary);"
        >{{ authStore.user?.username }}</span>
        <div class="relative overflow-hidden" style="height: 15px;">
          <span
            class="absolute inset-0 flex items-center text-[12px] truncate transition-[transform,opacity] duration-200 ease-out group-hover:opacity-0 group-hover:-translate-y-full"
            style="color: #3DB46E;"
          >{{ t('presence.online') }}</span>
          <span
            class="absolute inset-0 flex items-center text-[12px] truncate transition-[transform,opacity] duration-200 ease-out translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100"
            style="color: var(--kv-text-muted);"
          >{{ authStore.user?.username }}#{{ authStore.user?.friendTag }}</span>
        </div>
      </div>

      <!-- Sağ ikonlar -->
      <div class="flex items-center shrink-0 gap-2">
        <button
          class="w-8 h-8 rounded-[var(--kv-radius-sm)] flex items-center justify-center transition-colors hover:bg-[var(--kv-bg-rail)] cursor-pointer"
          style="color: var(--kv-text-muted);"
          :title="t('userCard.micMuted')"
          @click.stop
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </button>

        <button
          class="w-8 h-8 rounded-[var(--kv-radius-sm)] flex items-center justify-center transition-colors hover:bg-[var(--kv-bg-rail)] cursor-pointer"
          style="color: var(--kv-text-muted);"
          :title="t('userCard.headphones')"
          @click.stop
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
          </svg>
        </button>

        <!-- Ayarlar — güvenlik sayfasına yönlendirir -->
        <button
          class="w-8 h-8 rounded-[var(--kv-radius-sm)] flex items-center justify-center transition-colors hover:bg-[var(--kv-bg-rail)] hover:text-[var(--kv-text-primary)] cursor-pointer"
          style="color: var(--kv-text-muted);"
          :title="t('common.settings')"
          @click.stop="goToSettings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
