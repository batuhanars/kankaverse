<script setup lang="ts">
/**
 * ToastContainer — global, anlık başarı/hata/bilgi bildirimleri.
 * Uygulama kökünde bir kez mount edilir (App.vue). Tüm ekranlarda (auth dahil) çalışır.
 * Gölge YOK: katman ayrımı bg + kenarlık (sol aksan şeridi tip rengiyle).
 */
import { useI18n } from 'vue-i18n'
import { useToastStore, type ToastType } from '@/stores/toast'

const { t } = useI18n()
const toastStore = useToastStore()

/** Tip → sol aksan şeridi rengi (token). info nötr kalır. */
function accentColor(type: ToastType): string {
  if (type === 'success') return 'var(--kv-online)'
  if (type === 'error') return 'var(--kv-danger)'
  return 'var(--kv-border-strong)'
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed z-[100] flex flex-col gap-2 pointer-events-none"
      style="right: 16px; bottom: 16px; max-width: 360px;"
      aria-live="polite"
      aria-atomic="false"
    >
      <TransitionGroup name="kv-toast">
        <div
          v-for="toast in toastStore.toasts"
          :key="toast.id"
          class="pointer-events-auto flex items-start gap-2.5 pl-3 pr-2 py-2.5 rounded-[var(--kv-radius-md)] border"
          style="
            background-color: var(--kv-bg-elevated);
            border-color: var(--kv-border-subtle);
            border-left-width: 3px;
          "
          :style="{ borderLeftColor: accentColor(toast.type) }"
          role="status"
        >
          <!-- Tip ikonu -->
          <span class="shrink-0 mt-0.5" :style="{ color: accentColor(toast.type) }">
            <svg
              v-if="toast.type === 'success'"
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <svg
              v-else-if="toast.type === 'error'"
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <svg
              v-else
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
              style="color: var(--kv-text-secondary);"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="11" x2="12" y2="16" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </span>

          <!-- Mesaj -->
          <p class="flex-1 text-[14px] leading-snug pt-0.5" style="color: var(--kv-text-primary);">
            {{ toast.message }}
          </p>

          <!-- Kapat -->
          <button
            type="button"
            class="shrink-0 flex items-center justify-center rounded-full transition-colors cursor-pointer hover:bg-[var(--kv-bg-content)]"
            style="width: 22px; height: 22px; color: var(--kv-text-muted);"
            :aria-label="t('toast.close')"
            @click="toastStore.dismiss(toast.id)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.kv-toast-enter-active,
.kv-toast-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.kv-toast-enter-from,
.kv-toast-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
/* Çıkışta diğer toast'lar yumuşak kaysın */
.kv-toast-leave-active {
  position: absolute;
  right: 0;
}
.kv-toast-move {
  transition: transform 0.22s ease;
}
</style>
