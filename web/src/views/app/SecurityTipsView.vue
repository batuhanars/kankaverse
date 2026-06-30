<script setup lang="ts">
/**
 * SecurityTipsView — ekran paylaşımı gizlilik ipuçları (§E3).
 * ScreenNudgeModal'dan yeni sekmeye açılır; ses oturumunu kesmez.
 * Auth gerekmez (yasal sayfalar gibi genel erişim).
 */
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

function closeTab() {
  window.close()
}
</script>

<template>
  <div class="min-h-screen px-4 py-12" style="background-color: var(--kv-bg-content); color: var(--kv-text-primary);">
    <div class="max-w-xl mx-auto">
      <!-- Geri butonu -->
      <button
        type="button"
        class="flex items-center gap-1.5 mb-8 text-[13px] cursor-pointer transition-opacity hover:opacity-70"
        style="color: var(--kv-text-muted);"
        @click="closeTab()"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        {{ t('securityTips.backButton') }}
      </button>

      <!-- Başlık -->
      <h1 class="text-[28px] font-bold mb-2">{{ t('securityTips.title') }}</h1>
      <p class="text-[15px] mb-8" style="color: var(--kv-text-secondary);">{{ t('securityTips.subtitle') }}</p>

      <!-- İpuçları listesi -->
      <div class="flex flex-col gap-5">
        <div
          v-for="n in 5"
          :key="n"
          class="flex gap-4 p-4 rounded-[var(--kv-radius-lg)] border"
          style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-sidebar);"
        >
          <!-- Sayı rozeti -->
          <div
            class="shrink-0 flex items-center justify-center rounded-full text-[13px] font-bold text-white"
            style="width: 32px; height: 32px; background-color: var(--kv-accent-500);"
          >
            {{ n }}
          </div>
          <div>
            <p class="text-[14px] font-semibold mb-1" style="color: var(--kv-text-primary);">
              {{ t(`securityTips.tip${n}Title`) }}
            </p>
            <p class="text-[13px] leading-relaxed" style="color: var(--kv-text-secondary);">
              {{ t(`securityTips.tip${n}Body`) }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
