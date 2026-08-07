<script setup lang="ts">
/**
 * ScreenNudgeModal — ilk ekran paylaşımında tek-seferlik gizlilik uyarısı (§E3).
 *
 * Tek satır, sakin ton. Detaylı ipuçları modal'da değil → ayrı sayfaya link (yeni sekme).
 * Modal vaaz olmaz: uzun liste YOK.
 */
import { useI18n } from 'vue-i18n'

const SECURITY_TIPS_URL = '/guvenlik-ipuclari'

const emit = defineEmits<{
  confirm: []   // Kullanıcı "Devam Et" dedi → parent ekran paylaşımını başlat
  close: []     // Vazgeç / backdrop
}>()

const { t } = useI18n()

function openSecurityTips() {
  window.open(SECURITY_TIPS_URL, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      style="background-color: var(--kv-bg-overlay);"
      @click.self="emit('close')"
    >
      <!-- Modal kutusu — ekran nudge küçük/sade olmalı (§E3 "tek satır") -->
      <div
        class="w-full max-w-sm rounded-[var(--kv-radius-lg)] border overflow-hidden"
        style="background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle);"
      >
        <!-- Üst aksan şeridi -->
        <div class="h-1 w-full" style="background-color: var(--kv-accent-500);" />

        <div class="p-6">
          <!-- İkon + tek satır mesaj -->
          <div class="flex items-start gap-3 mb-5">
            <div
              class="shrink-0 flex items-center justify-center rounded-full mt-0.5"
              style="width: 36px; height: 36px; background-color: var(--kv-accent-subtle);"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-accent-500);">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[14px] leading-relaxed" style="color: var(--kv-text-secondary);">
                {{ t('voice.nudge.screenBody') }}
              </p>
              <!-- Güvenlik ipuçları linki (yeni sekme) -->
              <button
                type="button"
                class="mt-2 text-[13px] underline cursor-pointer transition-opacity hover:opacity-70"
                style="color: var(--kv-accent-400);"
                @click="openSecurityTips"
              >
                {{ t('voice.nudge.screenTipsLink') }}
              </button>
            </div>
          </div>

          <!-- Butonlar -->
          <div class="flex gap-2 justify-end">
            <button
              type="button"
              class="px-4 py-2 rounded-[var(--kv-radius-md)] text-[13px] font-medium cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
              style="color: var(--kv-text-muted);"
              @click="emit('close')"
            >
              {{ t('voice.nudge.screenCancel') }}
            </button>
            <button
              type="button"
              class="px-4 py-2 rounded-[var(--kv-radius-md)] text-[13px] font-semibold text-white cursor-pointer transition-opacity hover:opacity-90"
              style="background-color: var(--kv-accent-500);"
              @click="emit('confirm')"
            >
              {{ t('voice.nudge.screenConfirm') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
