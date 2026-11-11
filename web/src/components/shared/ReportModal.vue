<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'
import { reportsApi, ReportReason } from '@/api/reports'
import type { ReportTargetType, CreateReportPayload, ReportEvidenceItem } from '@/api/reports'
import { useE2eeStore } from '@/stores/e2ee'
import { useMessagesStore } from '@/stores/messages'

const props = defineProps<{
  targetType: ReportTargetType
  targetId: string
  /** Mesaj şikâyetinde mesajın kanalı: şifreli DM'de kanıt toplamak için ekrandaki listeye bakılır. */
  channelId?: string
}>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const e2eeStore = useE2eeStore()
const messagesStore = useMessagesStore()

const REASONS = [
  ReportReason.SPAM,
  ReportReason.HARASSMENT,
  ReportReason.MINOR_SAFETY,
  ReportReason.VIOLENCE,
  ReportReason.CSAM,
  ReportReason.SELF_HARM,
  ReportReason.OTHER,
] as const

const selectedReason = ref<ReportReason | null>(null)
const description = ref('')
const submitting = ref(false)
const submitted = ref(false)
const errorMsg = ref('')

/**
 * E4 §4: şifreli DM'deki mesajın şikâyetinde, gönderimden önce hedef + ondan önceki mesajlardan (en çok 5,
 * yalnız bu cihazda çözülmüş) kanıt toplanır. Şifresiz mesajda kanıt YOK: sunucu kendisi okur. Toplanamazsa
 * şikâyet yine gider (yalnız referans); kanıt hatası şikâyeti engellemez.
 */
async function gatherEvidence(): Promise<ReportEvidenceItem[] | undefined> {
  if (props.targetType !== 'MESSAGE' || !props.channelId) return undefined
  const list = messagesStore.messagesForChannel(props.channelId)
  const idx = list.findIndex((m) => m.id === props.targetId)
  if (idx === -1 || !list[idx].encrypted) return undefined
  try {
    const older = list.slice(0, idx).filter((m) => !m.localStatus)
    const items = await e2eeStore.collectEvidence(props.channelId, props.targetId, older)
    return items.length ? items : undefined
  } catch (e) {
    console.error('[e2ee] kanıt toplanamadı', e)
    return undefined
  }
}

async function submit() {
  if (!selectedReason.value || submitting.value) return
  submitting.value = true
  errorMsg.value = ''
  const payload: CreateReportPayload = {
    targetType: props.targetType,
    targetId: props.targetId,
    reason: selectedReason.value,
    description: description.value.trim() || undefined,
    evidence: await gatherEvidence(),
  }
  try {
    await reportsApi.createReport(payload)
    submitted.value = true
  } catch {
    errorMsg.value = t('report.submitError')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <KvModal :title="t('report.title')" @close="emit('close')">
    <!-- Başarı durumu -->
    <template v-if="submitted">
      <p class="text-[14px] mb-6" style="color: var(--kv-text-body);">
        {{ t('report.successMessage') }}
      </p>
      <div class="flex justify-end">
        <KvButton @click="emit('close')">{{ t('common.close') }}</KvButton>
      </div>
    </template>

    <!-- Form -->
    <template v-else>
      <p class="text-[13px] mb-4" style="color: var(--kv-text-muted);">
        {{ t('report.subtitle') }}
      </p>

      <!-- E4: mesaj şikâyetinde neyin iletileceği açıkça söylenir (şifreli ve şifresiz) -->
      <p
        v-if="targetType === 'MESSAGE'"
        class="text-[13px] mb-4 px-3 py-2 rounded-[var(--kv-radius-md)]"
        style="background-color: var(--kv-bg-elevated); color: var(--kv-text-body);"
      >
        {{ t('report.evidenceNotice') }}
      </p>

      <!-- Sebep listesi -->
      <div class="flex flex-col gap-2 mb-4">
        <button
          v-for="reason in REASONS"
          :key="reason"
          type="button"
          class="flex items-center gap-3 px-3 py-2.5 rounded-[var(--kv-radius-md)] text-left text-[14px] transition-colors cursor-pointer"
          :style="selectedReason === reason
            ? 'background-color: var(--kv-accent-subtle); color: var(--kv-text-primary); border: 1px solid var(--kv-accent-500);'
            : 'background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary); border: 1px solid transparent;'"
          @click="selectedReason = reason"
        >
          <span
            class="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center"
            :style="selectedReason === reason
              ? 'border-color: var(--kv-accent-500); background-color: var(--kv-accent-500);'
              : 'border-color: var(--kv-border-strong);'"
          >
            <span v-if="selectedReason === reason" class="w-1.5 h-1.5 rounded-full bg-white" />
          </span>
          {{ t(`reason.${reason}`) }}
        </button>
      </div>

      <!-- Açıklama (opsiyonel) -->
      <div class="mb-4">
        <label class="block text-[12px] font-semibold mb-1.5 uppercase tracking-wide" style="color: var(--kv-text-muted);">
          {{ t('report.descriptionLabel') }}
        </label>
        <textarea
          v-model="description"
          rows="3"
          :placeholder="t('report.descriptionPlaceholder')"
          class="w-full px-3 py-2 rounded-[var(--kv-radius-md)] text-[14px] resize-none outline-none border"
          style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong); color: var(--kv-text-primary); font-family: var(--kv-font-ui);"
        />
      </div>

      <!-- Hata -->
      <p v-if="errorMsg" class="text-[13px] mb-3" style="color: var(--kv-danger);">
        {{ errorMsg }}
      </p>

      <!-- Butonlar -->
      <div class="flex justify-end gap-2">
        <KvButton variant="ghost" :disabled="submitting" @click="emit('close')">
          {{ t('common.cancel') }}
        </KvButton>
        <KvButton
          variant="danger"
          :disabled="!selectedReason"
          :loading="submitting"
          @click="submit"
        >
          {{ t('report.submitButton') }}
        </KvButton>
      </div>
    </template>
  </KvModal>
</template>
