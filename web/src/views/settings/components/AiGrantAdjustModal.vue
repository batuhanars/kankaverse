<script setup lang="ts">
/**
 * AiGrantAdjustModal: etkin hakta kredi düşer (C47, yalnız isModerator; dışarıdan guard'lanır).
 * Dönem açmaz. Kalandan fazlası istenemez (UX; otorite backend). `note` yalnız admin içindir.
 * Ekleme arayüzde yok: kredi artırmanın yolu Yenile (kalan yeni döneme devreder).
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { aiGrantAdjustSchema } from '@/lib/validation/aiVideoGrant'
import { adminApi } from '@/api/admin'
import type { AiVideoGrantRowDto } from '@/api/admin'
import { useToastStore } from '@/stores/toast'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'
import KvInput from '@/components/ui/KvInput.vue'
import KvNumberInput from '@/components/ui/KvNumberInput.vue'

const props = defineProps<{ grant: AiVideoGrantRowDto }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const i18n = useI18n()
const { t } = i18n
const toast = useToastStore()

const form = useForm({
  validationSchema: toTypedSchema(aiGrantAdjustSchema),
  initialValues: { amount: undefined, note: '' },
})
const [amount] = form.defineField('amount')
const [note] = form.defineField('note')

const remaining = computed(() => props.grant.remainingCredits)
const entered = computed(() => Number(amount.value) || 0)
const tooMuch = computed(() => entered.value > remaining.value)
// Önizleme yalnız geçerli miktarda: boşken "307 → 307", fazla girişte eksi değer göstermesin.
const preview = computed(() =>
  entered.value > 0 && !tooMuch.value
    ? t('admin.aiAccess.adjust.preview', { before: remaining.value, after: remaining.value - entered.value })
    : '',
)

function fieldError(field: string): string | undefined {
  const msg = (form.errors.value as Record<string, string | undefined>)[field]
  if (!msg) return undefined
  return i18n.te(msg) ? t(msg) : msg
}

const saving = ref(false)
const saveError = ref('')
const save = form.handleSubmit(async (v) => {
  if (tooMuch.value) return
  saving.value = true
  saveError.value = ''
  try {
    await adminApi.adjustAiVideoGrant(props.grant.user.id, {
      deltaCredits: -v.amount,
      ...(v.note && { note: v.note }),
    })
    toast.success(t('admin.aiAccess.adjust.saved'))
    emit('saved')
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    saveError.value = err.response?.data?.message ?? t('admin.aiAccess.adjust.saveError')
  } finally {
    saving.value = false
  }
})
</script>

<template>
  <KvModal :title="t('admin.aiAccess.adjust.title')" @close="emit('close')">
    <form class="flex flex-col gap-3" @submit.prevent="save">
      <div class="flex flex-col gap-1">
        <span class="text-[11px] font-semibold uppercase tracking-wide" style="color: var(--kv-text-secondary);">
          {{ t('admin.aiAccess.adjust.user') }}
        </span>
        <span class="text-[14px]" style="color: var(--kv-text-primary);">{{ grant.user.username }}</span>
      </div>

      <div>
        <KvNumberInput v-model="amount" :label="t('admin.aiAccess.adjust.amount')" :min="1" :max="100000" />
        <p v-if="fieldError('amount')" class="text-[12px] mt-1" style="color: var(--kv-danger);">
          {{ fieldError('amount') }}
        </p>
      </div>

      <KvInput
        v-model="note"
        :label="t('admin.aiAccess.form.note')"
        :placeholder="t('admin.aiAccess.form.notePlaceholder')"
        :error="fieldError('note')"
      />

      <p v-if="preview" class="text-[14px] font-semibold tabular-nums" style="color: var(--kv-text-primary);">{{ preview }}</p>
      <p v-if="tooMuch" class="text-[12px]" style="color: var(--kv-danger);">
        {{ t('admin.aiAccess.adjust.tooMuch', { remaining }) }}
      </p>
      <p class="text-[12px]" style="color: var(--kv-text-muted);">{{ t('admin.aiAccess.adjust.hint') }}</p>
      <p v-if="saveError" class="text-[12px]" style="color: var(--kv-danger);">{{ saveError }}</p>

      <div class="flex gap-3 justify-end pt-1">
        <KvButton type="button" variant="ghost" @click="emit('close')">{{ t('common.cancel') }}</KvButton>
        <KvButton type="submit" :loading="saving" :disabled="tooMuch">{{ t('admin.aiAccess.adjust.save') }}</KvButton>
      </div>
    </form>
  </KvModal>
</template>
