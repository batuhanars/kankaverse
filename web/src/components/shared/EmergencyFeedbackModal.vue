<script setup lang="ts">
/**
 * EmergencyFeedbackModal — A4 mağdur geri-bildirimi (GLOBAL katman, App.vue'da mount).
 * Panik sonrası açılır: çıkış yolu (112 / ALO 183) + opsiyonel gönüllü metin beyanı (PATCH /emergency/:id).
 * Ses çubuğundan bağımsız olduğu için odadan çıkmak modalı öldürmez.
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEmergencyStore } from '@/stores/emergency'
import { useToastStore } from '@/stores/toast'
import { emergencyApi } from '@/api/emergency'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'

const { t } = useI18n()
const store = useEmergencyStore()
const toast = useToastStore()

const description = ref('')
const sending = ref(false)
const sent = ref(false)

// Modal her açılışında beyan alanını sıfırla.
watch(
  () => store.open,
  (isOpen) => {
    if (isOpen) {
      description.value = ''
      sent.value = false
      sending.value = false
    }
  },
)

async function submitStatement() {
  if (!store.reportId || !description.value.trim() || sending.value) return
  sending.value = true
  try {
    await emergencyApi.addStatement(store.reportId, description.value.trim())
    sent.value = true
  } catch {
    toast.error(t('emergency.statementError'))
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <KvModal v-if="store.open" :title="t('emergency.feedbackTitle')" @close="store.close()">
    <p class="text-[14px] mb-2" style="color: var(--kv-text-body);">{{ t('emergency.feedbackPulled') }}</p>
    <p class="text-[14px] mb-4" style="color: var(--kv-text-body);">
      {{ store.failed ? t('emergency.feedbackError') : t('emergency.feedbackReported') }}
    </p>

    <div
      class="rounded-[var(--kv-radius-md)] p-3 mb-5 flex flex-col gap-1"
      style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle);"
    >
      <span class="text-[12px] font-semibold mb-1" style="color: var(--kv-text-muted);">
        {{ t('emergency.resourcesTitle') }}
      </span>
      <span class="text-[13px]" style="color: var(--kv-text-body);">{{ t('emergency.resourceEmergency') }}</span>
      <span class="text-[13px]" style="color: var(--kv-text-body);">{{ t('emergency.resourceSupport') }}</span>
    </div>

    <!-- Opsiyonel gönüllü beyan (yalnız metin; bloke etmez) -->
    <div v-if="!sent" class="mb-4">
      <label class="block text-[13px] font-medium mb-1.5" style="color: var(--kv-text-secondary);">
        {{ t('emergency.statementLabel') }}
      </label>
      <textarea
        v-model="description"
        rows="3"
        maxlength="2000"
        :placeholder="t('emergency.statementPlaceholder')"
        class="w-full px-3 py-2 rounded-[var(--kv-radius-md)] text-[14px] resize-none outline-none border"
        style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong); color: var(--kv-text-primary); font-family: var(--kv-font-ui);"
      ></textarea>
    </div>
    <p v-else class="text-[13px] mb-4" style="color: var(--kv-success, #3DB46E);">
      {{ t('emergency.statementSent') }}
    </p>

    <div class="flex gap-3 justify-end">
      <KvButton variant="ghost" @click="store.close()">{{ t('emergency.close') }}</KvButton>
      <KvButton
        v-if="!sent"
        variant="primary"
        :loading="sending"
        :disabled="!description.trim()"
        @click="submitStatement()"
      >
        {{ t('emergency.statementSubmit') }}
      </KvButton>
    </div>
  </KvModal>
</template>
