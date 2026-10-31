<script setup lang="ts">
/**
 * AiGrantFormModal — yapay zeka erişimi ver / yenile (C40, yalnız isModerator; dışarıdan guard'lanır).
 * Yenileme: kullanıcı sabit, alanlar dolu. Kullanıcı seçimi mevcut admin kullanıcı listesinden (reşit olmayan elenir).
 * `note` yalnız admin içindir. Doğrulama yalnız UX; otorite backend.
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { aiGrantSchema } from '@/lib/validation/aiVideoGrant'
import { adminApi } from '@/api/admin'
import type { AdminUserDto, AiVideoGrantRowDto } from '@/api/admin'
import { useToastStore } from '@/stores/toast'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'
import KvInput from '@/components/ui/KvInput.vue'
import KvNumberInput from '@/components/ui/KvNumberInput.vue'
import AiGrantUserPicker from './AiGrantUserPicker.vue'
import type { PickerUser } from './AiGrantUserPicker.vue'

const props = defineProps<{ renewing?: AiVideoGrantRowDto | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const i18n = useI18n()
const { t } = i18n
const toast = useToastStore()

const form = useForm({
  validationSchema: toTypedSchema(aiGrantSchema),
  initialValues: {
    userId: props.renewing?.user.id ?? '',
    budgetCredits: props.renewing?.budgetCredits,
    note: props.renewing?.note ?? '',
  },
})
const [budget] = form.defineField('budgetCredits')
const [note] = form.defineField('note')

function fieldError(field: string): string | undefined {
  const msg = (form.errors.value as Record<string, string | undefined>)[field]
  if (!msg) return undefined
  return i18n.te(msg) ? t(msg) : msg
}

// ── Kullanıcı seçimi ──
const users = ref<AdminUserDto[]>([])
const pickedId = computed(() => form.values.userId ?? '')
const pickerUsers = computed<PickerUser[]>(() =>
  props.renewing ? [props.renewing.user] : users.value.filter((u) => !u.isMinor),
)

onMounted(async () => {
  if (props.renewing) return
  try {
    users.value = (await adminApi.listUsers()).data
  } catch {
    users.value = []
  }
})

// ── Kaydet ──
const saving = ref(false)
const saveError = ref('')
const save = form.handleSubmit(async (v) => {
  saving.value = true
  saveError.value = ''
  try {
    await adminApi.upsertAiVideoGrant(v.userId, {
      budgetCredits: v.budgetCredits,
      expiresAt: null, // bitiş tarihi kalktı (sahip 2026-10-31); yenileme eski bitişi de temizler
      ...(v.note && { note: v.note }),
    })
    toast.success(t('admin.aiAccess.form.saved'))
    emit('saved')
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    saveError.value = err.response?.data?.message ?? t('admin.aiAccess.form.saveError')
  } finally {
    saving.value = false
  }
})
</script>

<template>
  <KvModal
    :title="renewing ? t('admin.aiAccess.form.titleRenew') : t('admin.aiAccess.form.titleGive')"
    @close="emit('close')"
  >
    <form class="flex flex-col gap-3" @submit.prevent="save">
      <div class="flex flex-col gap-1.5">
        <AiGrantUserPicker
          :users="pickerUsers"
          :model-value="pickedId"
          :disabled="!!renewing"
          :error="fieldError('userId')"
          @update:model-value="form.setFieldValue('userId', $event)"
        />
      </div>

      <div>
        <KvNumberInput v-model="budget" :label="t('admin.aiAccess.form.credits')" :min="1" :max="100000" />
        <p v-if="fieldError('budgetCredits')" class="text-[12px] mt-1" style="color: var(--kv-danger);">
          {{ fieldError('budgetCredits') }}
        </p>
      </div>

      <KvInput
        v-model="note"
        :label="t('admin.aiAccess.form.note')"
        :placeholder="t('admin.aiAccess.form.notePlaceholder')"
        :error="fieldError('note')"
      />
      <p v-if="renewing" class="text-[12px]" style="color: var(--kv-text-muted);">
        {{ t('admin.aiAccess.form.renewHint') }}
      </p>
      <p v-if="saveError" class="text-[12px]" style="color: var(--kv-danger);">{{ saveError }}</p>

      <div class="flex gap-3 justify-end pt-1">
        <KvButton type="button" variant="ghost" @click="emit('close')">{{ t('common.cancel') }}</KvButton>
        <KvButton type="submit" :loading="saving">{{ t('admin.aiAccess.form.save') }}</KvButton>
      </div>
    </form>
  </KvModal>
</template>
