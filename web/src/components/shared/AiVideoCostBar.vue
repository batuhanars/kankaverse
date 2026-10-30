<script setup lang="ts">
/**
 * AiVideoCostBar (Sprint C14b §3.1-5): canlı teklif + bugünkü harcama + "Oluştur".
 * Yüklenirken eski tutar soluk; tavanı aşacaksa düğme kapalı + neden yazılı. Tutarlar kredi (C33).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import KvButton from '@/components/ui/KvButton.vue'

const props = defineProps<{
  durationS: number
  estimateCredits: number | null
  estimating: boolean
  estimateFailed: boolean
  overCap: boolean
  spentTodayCredits: number
  dailyCapCredits: number
  canSubmit: boolean
  busy: boolean
  locked?: boolean // C33: pasif tanıtım, Oluştur kapalı + "yakında" notu
  inviteCode?: string | null // C39: doluysa not davet metnine döner + "Ortama katıl" düğmesi
}>()
const emit = defineEmits<{ submit: []; join: [] }>()

const { t, n } = useI18n()
const num = (v: number) => n(v, { maximumFractionDigits: 0 })
const credits = (v: number) => t('aiVideo.credits', { amount: num(v) })
const disabled = computed(
  () =>
    props.locked ||
    !props.canSubmit ||
    props.estimating ||
    props.estimateCredits === null ||
    props.overCap,
)
</script>

<template>
  <div class="flex flex-col gap-1.5 min-w-0">
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div v-if="!locked" class="min-w-0">
        <p class="text-[13px]" style="color: var(--kv-text-secondary);">
          {{ t('aiVideo.estimate', { sec: durationS }) }}
        </p>
        <p
          class="text-[18px] font-semibold tabular-nums transition-opacity"
          :class="estimating ? 'opacity-40' : ''"
          style="color: var(--kv-text-primary);"
        >
          <template v-if="estimateCredits !== null">{{ credits(estimateCredits) }}</template>
          <template v-else-if="estimateFailed"><span class="text-[13px] font-normal" style="color: var(--kv-danger);">{{ t('aiVideo.estimateFailed') }}</span></template>
          <template v-else>...</template>
        </p>
      </div>
      <KvButton :disabled="disabled" :loading="busy" @click="emit('submit')">{{ t('aiVideo.generate') }}</KvButton>
    </div>
    <p class="text-[12px]" style="color: var(--kv-text-muted);">
      {{ t('aiVideo.spentLine', { spent: num(spentTodayCredits), cap: num(dailyCapCredits) }) }}
    </p>
    <template v-if="locked">
      <p class="text-[13px]" style="color: var(--kv-text-secondary);">
        {{ inviteCode ? t('aiVideo.lockedNoteInvite') : t('aiVideo.lockedNote') }}
      </p>
      <div v-if="inviteCode" class="pt-1">
        <KvButton size="sm" variant="ghost" class="border border-[var(--kv-border-subtle)]" @click="emit('join')">
          {{ t('aiVideo.joinGuild') }}
        </KvButton>
      </div>
    </template>
    <p v-if="overCap" class="text-[12px]" style="color: var(--kv-danger);">{{ t('aiVideo.overCap') }}</p>
  </div>
</template>
