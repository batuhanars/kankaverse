<script setup lang="ts">
/**
 * E5b §4.3 — eski cihaz: yeni cihaz geçmiş istiyor. Kabuğa (AppShell) bağlı, hangi ekranda olunursa olsun çıkar.
 * İstek (cihaz adı, saat) → [Devam et] → kod → [Kodlar aynı, aktar] tek gönderim kapısı.
 * [Ben değilim] / [Farklı] / taahhüt tutmadı → iptal + hesap güvenliği uyarısı ve Oturumlar bağlantısı.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { formatSas } from '@kankaverse/e2ee-core'
import { useE2eeTransferStore } from '@/stores/e2eeTransfer'
import { formatDateTime } from '@/utils/formatDateTime'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'

const { t } = useI18n()
const router = useRouter()
const transfer = useE2eeTransferStore()

const requestText = computed(() => {
  const r = transfer.o.request
  if (!r) return ''
  const device = r.newDevice.name ?? r.newDevice.platform ?? t('e2ee.backup.transfer.incoming.unknownDevice')
  return t('e2ee.backup.transfer.incoming.body', {
    name: device,
    time: formatDateTime(Date.parse(r.createdAt)),
  })
})

function goSessions() {
  transfer.closeOld()
  void router.push({ name: 'settings-security' })
}
</script>

<template>
  <KvModal
    v-if="transfer.o.phase !== 'idle'"
    :title="t('e2ee.backup.transfer.incoming.title')"
    @close="transfer.closeOld()"
  >
    <div class="flex flex-col gap-4 text-[13px]" style="color: var(--kv-text-primary);">
      <template v-if="transfer.o.phase === 'request'">
        <p class="m-0 break-words">{{ requestText }}</p>
        <div class="flex flex-wrap gap-3 justify-end">
          <KvButton variant="ghost" @click="transfer.rejectOld()">
            {{ t('e2ee.backup.transfer.incoming.notMe') }}
          </KvButton>
          <KvButton @click="transfer.acceptOld()">{{ t('e2ee.backup.transfer.incoming.continue') }}</KvButton>
        </div>
      </template>

      <p v-else-if="transfer.o.phase === 'waiting'" class="m-0">
        {{ t('e2ee.backup.transfer.incoming.waitingCode') }}
      </p>

      <template v-else-if="transfer.o.phase === 'code'">
        <span class="text-[11px] font-semibold uppercase tracking-wide" style="color: var(--kv-text-secondary);">
          {{ t('e2ee.backup.transfer.codeLabel') }}
        </span>
        <p
          class="m-0 text-[32px] font-semibold tracking-[0.15em] text-center"
          style="font-variant-numeric: tabular-nums;"
          aria-live="polite"
        >
          {{ formatSas(transfer.o.sas) }}
        </p>
        <p class="m-0">{{ t('e2ee.backup.transfer.incoming.codeOld') }}</p>
        <div class="flex flex-wrap gap-3 justify-end">
          <KvButton variant="danger" @click="transfer.rejectOld()">
            {{ t('e2ee.backup.transfer.incoming.different') }}
          </KvButton>
          <KvButton @click="transfer.confirmOld()">{{ t('e2ee.backup.transfer.incoming.same') }}</KvButton>
        </div>
      </template>

      <p v-else-if="transfer.o.phase === 'sending'" class="m-0">
        {{ t('e2ee.backup.transfer.incoming.sending') }}
      </p>

      <template v-else-if="transfer.o.phase === 'rejected'">
        <p class="m-0" style="color: var(--kv-danger);" role="alert">
          {{ t('e2ee.backup.transfer.incoming.rejected') }}
        </p>
        <div class="flex flex-wrap gap-3 justify-end">
          <KvButton variant="ghost" @click="transfer.closeOld()">{{ t('e2ee.backup.transfer.close') }}</KvButton>
          <KvButton @click="goSessions">{{ t('e2ee.backup.transfer.incoming.sessions') }}</KvButton>
        </div>
      </template>

      <template v-else>
        <p class="m-0" role="status">
          {{
            transfer.o.phase === 'sent'
              ? t('e2ee.backup.transfer.incoming.sent')
              : t('e2ee.backup.transfer.failed')
          }}
        </p>
        <div class="flex justify-end">
          <KvButton @click="transfer.closeOld()">{{ t('e2ee.backup.transfer.close') }}</KvButton>
        </div>
      </template>
    </div>
  </KvModal>
</template>
