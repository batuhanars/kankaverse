<script setup lang="ts">
/**
 * AiVideoRecentList (Sprint C14c §4): "Son üretimler". Satır tıklaması yönlendirir (§4b-4); sağdaki çöp simgesi
 * tek satırı onaysız siler (QUEUED/RUNNING satırda yok); "Temizle" hepsini siler (mevcut ConfirmDialog ile onay).
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import type { AiVideoDto } from '@/api/aiVideo'

defineProps<{ rows: AiVideoDto[]; statusLabel: (r: AiVideoDto) => string }>()
const emit = defineEmits<{ open: [row: AiVideoDto]; remove: [id: string]; clear: [] }>()
const { t } = useI18n()
const confirming = ref(false)

const isActive = (r: AiVideoDto) => r.status === 'QUEUED' || r.status === 'RUNNING'
const isClickable = (r: AiVideoDto) => r.status === 'COMPLETED' || isActive(r)

function onConfirm() {
  confirming.value = false
  emit('clear')
}
</script>

<template>
  <section v-if="rows.length" class="min-w-0">
    <div class="flex items-center justify-between gap-2 mb-2">
      <h3 class="text-[13px] font-semibold" style="color: var(--kv-text-secondary);">{{ t('aiVideo.recent') }}</h3>
      <button
        type="button"
        class="text-[12px] cursor-pointer transition-colors hover:underline"
        style="color: var(--kv-text-muted);"
        @click="confirming = true"
      >
        {{ t('aiVideo.clearAll') }}
      </button>
    </div>
    <ul class="flex flex-col gap-1">
      <li v-for="r in rows" :key="r.id" class="flex items-center gap-1 min-w-0">
        <component
          :is="isClickable(r) ? 'button' : 'div'"
          :type="isClickable(r) ? 'button' : undefined"
          class="block flex-1 min-w-0 text-left rounded-[var(--kv-radius-sm)] px-2 py-1.5"
          :class="isClickable(r) ? 'transition-colors hover:bg-[var(--kv-bg-elevated)] cursor-pointer' : ''"
          @click="isClickable(r) && emit('open', r)"
        >
          <span class="block truncate text-[13px]" style="color: var(--kv-text-primary);">
            {{ r.prompt || t('aiVideo.fromImage') }}
          </span>
          <span class="block truncate text-[11px]" :style="{ color: r.status === 'FAILED' ? 'var(--kv-danger)' : 'var(--kv-text-muted)' }">
            {{ statusLabel(r) }}
          </span>
        </component>
        <button
          v-if="!isActive(r)"
          type="button"
          class="shrink-0 p-1.5 rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
          style="color: var(--kv-text-muted);"
          :aria-label="t('aiVideo.deleteOne')"
          :title="t('aiVideo.deleteOne')"
          @click.stop="emit('remove', r.id)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
          </svg>
        </button>
      </li>
    </ul>
    <ConfirmDialog
      v-if="confirming"
      :title="t('aiVideo.clearTitle')"
      :message="t('aiVideo.clearConfirm')"
      :confirm-label="t('aiVideo.clearAll')"
      @confirm="onConfirm"
      @cancel="confirming = false"
    />
  </section>
</template>
