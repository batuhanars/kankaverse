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
import { aiGrantSchema, endOfLocalDay } from '@/lib/validation/aiVideoGrant'
import { adminApi } from '@/api/admin'
import type { AdminUserDto, AiVideoGrantRowDto } from '@/api/admin'
import { useToastStore } from '@/stores/toast'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'
import KvInput from '@/components/ui/KvInput.vue'
import KvNumberInput from '@/components/ui/KvNumberInput.vue'

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
    expiresOn: '',
    note: props.renewing?.note ?? '',
  },
})
const [budget] = form.defineField('budgetCredits')
const [expiresOn] = form.defineField('expiresOn')
const [note] = form.defineField('note')

function fieldError(field: string): string | undefined {
  const msg = (form.errors.value as Record<string, string | undefined>)[field]
  if (!msg) return undefined
  return i18n.te(msg) ? t(msg) : msg
}

// ── Kullanıcı seçimi ──
const users = ref<AdminUserDto[]>([])
const query = ref(props.renewing?.user.username ?? '')
const pickedId = computed(() => form.values.userId ?? '')
const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q || props.renewing) return []
  return users.value
    .filter((u) => !u.isMinor && u.username.toLowerCase().includes(q))
    .slice(0, 6)
})

onMounted(async () => {
  if (props.renewing) return
  try {
    users.value = (await adminApi.listUsers()).data
  } catch {
    users.value = []
  }
})

function pick(u: AdminUserDto) {
  form.setFieldValue('userId', u.id)
  query.value = u.username
}
function onQuery() {
  if (!props.renewing) form.setFieldValue('userId', '') // yazarken seçim düşer; listeden yeniden seçilir
}

// ── Kaydet ──
const saving = ref(false)
const saveError = ref('')
const save = form.handleSubmit(async (v) => {
  saving.value = true
  saveError.value = ''
  try {
    await adminApi.upsertAiVideoGrant(v.userId, {
      budgetCredits: v.budgetCredits,
      expiresAt: v.expiresOn ? endOfLocalDay(v.expiresOn).toISOString() : null,
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
        <KvInput
          v-model="query"
          :label="t('admin.aiAccess.form.user')"
          :placeholder="t('admin.aiAccess.form.userPlaceholder')"
          :error="fieldError('userId')"
          @input="onQuery"
        />
        <div
          v-if="!renewing && query.trim() && !pickedId"
          class="rounded-[var(--kv-radius-md)] overflow-hidden"
          style="background-color: var(--kv-bg-sidebar);"
        >
          <button
            v-for="u in matches"
            :key="u.id"
            type="button"
            class="block w-full text-left px-3 py-2 text-[13px] cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
            style="color: var(--kv-text-primary);"
            @click="pick(u)"
          >
            {{ u.username }}
          </button>
          <p v-if="!matches.length" class="px-3 py-2 text-[12px]" style="color: var(--kv-text-muted);">
            {{ t('admin.aiAccess.form.noMatch') }}
          </p>
        </div>
      </div>

      <div class="flex gap-3">
        <div class="flex-1">
          <KvNumberInput v-model="budget" :label="t('admin.aiAccess.form.credits')" :min="1" :max="100000" />
          <p v-if="fieldError('budgetCredits')" class="text-[12px] mt-1" style="color: var(--kv-danger);">
            {{ fieldError('budgetCredits') }}
          </p>
        </div>
        <div class="flex-1">
          <KvInput
            v-model="expiresOn"
            type="date"
            :label="t('admin.aiAccess.form.expiresAt')"
            :error="fieldError('expiresOn')"
          />
        </div>
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
