<script setup lang="ts">
/**
 * E5b §4.2 — yeni cihaz: "Eski cihazımdan aktar". Aşamalar `e2eeTransfer` deposunda (soket + yoklama ile ilerler):
 * bekleme (10 dk) → kod (iki ekranda karşılaştırılır) → aktarılıyor → bitti. Kod saklanmaz, loglanmaz.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatSas } from '@kankaverse/e2ee-core'
import { useE2eeTransferStore } from '@/stores/e2eeTransfer'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'

const { t } = useI18n()
const transfer = useE2eeTransferStore()

// Kalan dakika (ekranda yuvarlanmış, yalnız bilgi; süreyi sunucu uygular).
const now = ref(Date.now())
const tick = setInterval(() => (now.value = Date.now()), 15_000)
onBeforeUnmount(() => clearInterval(tick))
const minutesLeft = computed(() => {
  const end = Date.parse(transfer.n.expiresAt)
  return Number.isFinite(end) ? Math.max(1, Math.ceil((end - now.value) / 60_000)) : 10
})

const finished = computed(() =>
  ['done', 'expired', 'cancelled', 'tooLarge', 'error'].includes(transfer.n.phase),
)
const resultText = computed(() => {
  switch (transfer.n.phase) {
    case 'done':
      if (transfer.n.identityOnly) {
        return transfer.n.identityAdopted ? t('e2ee.identity.verifyDone') : t('e2ee.identity.verifyFailed')
      }
      return t('e2ee.backup.transfer.done', { n: transfer.n.received })
    case 'expired':
      return t('e2ee.backup.transfer.expired')
    case 'cancelled':
      return t('e2ee.backup.transfer.cancelled')
    case 'tooLarge':
      return t('e2ee.backup.transfer.tooLarge')
    default:
      return t('e2ee.backup.transfer.failed')
  }
})
const canRestart = computed(() => ['expired', 'cancelled', 'error'].includes(transfer.n.phase))
</script>

<template>
  <KvModal
    :title="transfer.n.identityOnly ? t('e2ee.identity.verifyTitle') : t('e2ee.backup.transfer.title')"
    @close="transfer.closeNew()"
  >
    <div class="flex flex-col gap-4 text-[13px]" style="color: var(--kv-text-primary);">
      <template v-if="transfer.n.phase === 'starting' || transfer.n.phase === 'waiting'">
        <p class="m-0">{{ t('e2ee.backup.transfer.waiting') }}</p>
        <p class="m-0" style="color: var(--kv-text-muted);">
          {{ t('e2ee.backup.transfer.expiresIn', { min: minutesLeft }) }}
        </p>
      </template>

      <template v-else-if="transfer.n.phase === 'code'">
        <span class="text-[11px] font-semibold uppercase tracking-wide" style="color: var(--kv-text-secondary);">
          {{ t('e2ee.backup.transfer.codeLabel') }}
        </span>
        <p
          v-if="transfer.n.sas"
          class="m-0 text-[32px] font-semibold tracking-[0.15em] text-center"
          style="font-variant-numeric: tabular-nums;"
          aria-live="polite"
        >
          {{ formatSas(transfer.n.sas) }}
        </p>
        <p class="m-0">{{ t('e2ee.backup.transfer.codeNew') }}</p>
      </template>

      <p v-else-if="transfer.n.phase === 'receiving'" class="m-0">
        {{ t('e2ee.backup.transfer.receiving') }}
      </p>

      <p v-else-if="finished" class="m-0" role="status">{{ resultText }}</p>

      <div class="flex flex-wrap gap-3 justify-end">
        <KvButton
          v-if="canRestart"
          variant="ghost"
          @click="transfer.startNew({ identityOnly: transfer.n.identityOnly })"
        >
          {{ t('e2ee.backup.transfer.restart') }}
        </KvButton>
        <KvButton
          :variant="finished ? 'primary' : 'ghost'"
          :disabled="transfer.n.phase === 'receiving'"
          @click="transfer.closeNew()"
        >
          {{ finished ? t('e2ee.backup.transfer.close') : t('common.cancel') }}
        </KvButton>
      </div>
    </div>
  </KvModal>
</template>
