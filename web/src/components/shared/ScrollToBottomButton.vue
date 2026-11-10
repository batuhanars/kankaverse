<script setup lang="ts">
/**
 * Mesaj listesinin sağ altındaki "en alta in" düğmesi (kanal + DM). Kullanıcı geçmişe doğru yukarı
 * kaydırınca görünür; yukarıdayken gelen mesaj varsa üstünde sayı rozeti çıkar (REV-9 sayacı).
 * Gölge yok (tasarım sistemi): katman ayrımı zemin tonu + ince kenarlıkla.
 */
import { useI18n } from 'vue-i18n'

defineProps<{ count: number }>()
const emit = defineEmits<{ click: [] }>()

const { t } = useI18n()
</script>

<template>
  <button
    type="button"
    class="absolute right-4 bottom-3 z-10 w-10 h-10 flex items-center justify-center rounded-full border cursor-pointer transition-colors hover:brightness-125"
    style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong); color: var(--kv-text-primary);"
    :title="t('message.scrollToBottom')"
    :aria-label="t('message.scrollToBottom')"
    @click="emit('click')"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
    <span
      v-if="count > 0"
      class="absolute -top-1.5 -right-1.5 flex items-center justify-center px-1 text-[11px] font-bold rounded-full"
      style="min-width: 20px; height: 20px; background-color: var(--kv-accent-500); color: #ffffff;"
    >
      {{ count > 99 ? '99+' : count }}
    </span>
  </button>
</template>
