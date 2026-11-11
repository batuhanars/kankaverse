<script setup lang="ts">
// E4 §4: moderasyon paneli kanıt listesi. Mesajlar, yazar, zaman ve güvenilirlik etiketi; ekler YALNIZ
// referanstır (tür + boyut), önizleme/indirme yok (medya kopyalanmaz, E4 §1.3).
import { useI18n } from 'vue-i18n'
import type { ReportEvidenceDto } from '@/api/moderation'

defineProps<{ evidence: ReportEvidenceDto[] }>()

const { t } = useI18n()

type Label = 'verified' | 'unverified' | 'server'

/** Sunucu kendisi okuduysa "Sunucu kaydı"; şikâyetçinin ilettiği ise parmak izi sonucuna göre. */
function labelOf(e: ReportEvidenceDto): Label {
  if (e.source === 'server') return 'server'
  return e.verified ? 'verified' : 'unverified'
}

function labelStyle(label: Label): string {
  if (label === 'unverified') return 'color: #fff; background-color: var(--kv-warning);'
  if (label === 'verified') return 'color: #fff; background-color: var(--kv-success);'
  return 'color: var(--kv-text-secondary); background-color: var(--kv-bg-elevated);'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
</script>

<template>
  <ul class="flex flex-col gap-2 list-none p-0 m-0">
    <li
      v-for="e in evidence"
      :key="e.id"
      class="p-3 rounded-[var(--kv-radius-sm)] min-w-0"
      :style="e.isTarget
        ? 'background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-accent-500);'
        : 'background-color: var(--kv-bg-elevated); border: 1px solid transparent;'"
    >
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5 text-[11px]">
        <span
          v-if="e.isTarget"
          class="px-1.5 py-0.5 rounded font-semibold"
          style="background-color: var(--kv-accent-500); color: #fff;"
        >{{ t('moderation.evidenceTarget') }}</span>
        <span
          class="px-1.5 py-0.5 rounded font-semibold"
          :style="labelStyle(labelOf(e))"
        >{{ t(`moderation.evidenceLabel.${labelOf(e)}`) }}</span>
        <span style="color: var(--kv-text-muted);">{{ t('moderation.evidenceAuthor') }}:</span>
        <code class="break-all" style="font-family: var(--kv-font-mono); color: var(--kv-text-secondary);">{{ e.authorUsername ?? e.authorId ?? '' }}</code>
        <span style="color: var(--kv-text-muted);">{{ formatDate(e.messageAt) }}</span>
      </div>
      <p
        v-if="e.content"
        class="text-[13px] m-0 whitespace-pre-wrap break-words"
        style="color: var(--kv-text-body);"
      >{{ e.content }}</p>
      <ul v-if="e.attachments?.length" class="mt-1.5 flex flex-col gap-0.5 list-none p-0 m-0">
        <li
          v-for="a in e.attachments"
          :key="a.id"
          class="text-[12px] break-all"
          style="color: var(--kv-text-muted);"
        >
          {{ t('moderation.evidenceAttachment') }}: {{ a.contentType }} · {{ formatSize(a.size) }}
        </li>
      </ul>
    </li>
  </ul>
</template>
