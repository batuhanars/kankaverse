<script setup lang="ts">
/**
 * E7 §4.7 güvenlik kodu. 1-1 DM'de kod doğrudan; grupta önce kişi seçilir (kod iki kişi arasındadır).
 * Kod 12 grup × 5 hane; iki tarafta aynı görünür. "Doğrulandı" işareti yalnız bu cihazda (§10-2), başka yerde rozet
 * yok (§10-3). Karşı tarafın kimliği yoksa (eski sürüm) kod yerine açıklama.
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SafetyCodeView } from '@kankaverse/e2ee-client'
import { useE2eeStore } from '@/stores/e2ee'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'

const props = defineProps<{ members: { id: string; username: string }[] }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const e2ee = useE2eeStore()

const selectedId = ref<string | null>(props.members.length === 1 ? props.members[0].id : null)
const selected = computed(() => props.members.find((m) => m.id === selectedId.value) ?? null)
const code = ref<SafetyCodeView | null>(null)
const loading = ref(false)
const saving = ref(false)

async function load(userId: string): Promise<void> {
  const identity = e2ee.engine?.identity
  code.value = null
  if (!identity) return
  loading.value = true
  try {
    code.value = await identity.safetyCode(userId)
  } catch (e) {
    console.error('[e2ee] güvenlik kodu okunamadı', e instanceof Error ? e.name : typeof e)
  } finally {
    loading.value = false
  }
}

watch(selectedId, (id) => (id ? void load(id) : (code.value = null)), { immediate: true })

async function toggleVerified(): Promise<void> {
  const identity = e2ee.engine?.identity
  if (!identity || !selectedId.value || !code.value) return
  saving.value = true
  try {
    await identity.setVerified(selectedId.value, !code.value.verified)
    await load(selectedId.value)
  } finally {
    saving.value = false
  }
}

/** 12 grubu 3 satıra böler (4'erli): iki ekranda satır satır okunabilsin. */
const rows = computed(() => {
  const g = code.value?.groups ?? []
  return [g.slice(0, 4), g.slice(4, 8), g.slice(8, 12)]
})
</script>

<template>
  <KvModal :title="t('e2ee.identity.codeTitle')" @close="emit('close')">
    <div class="flex flex-col gap-4 text-[13px]" style="color: var(--kv-text-primary);">
      <template v-if="!selected">
        <p class="m-0" style="color: var(--kv-text-muted);">{{ t('e2ee.identity.pickMember') }}</p>
        <div class="flex flex-col gap-1">
          <button
            v-for="m in members"
            :key="m.id"
            class="text-left px-3 py-2 rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
            @click="selectedId = m.id"
          >
            {{ m.username }}
          </button>
        </div>
      </template>

      <template v-else>
        <p class="m-0 font-semibold">{{ t('e2ee.identity.codeWith', { name: selected.username }) }}</p>
        <p v-if="loading" class="m-0" style="color: var(--kv-text-muted);">{{ t('common.loading') }}</p>
        <p v-else-if="!code" class="m-0" style="color: var(--kv-text-muted);">
          {{ t('e2ee.identity.codeMissing', { name: selected.username }) }}
        </p>
        <template v-else>
          <div
            class="flex flex-col gap-1 items-center py-2 font-mono text-[17px] tracking-[0.08em]"
            style="font-variant-numeric: tabular-nums;"
            aria-live="polite"
          >
            <span v-for="(row, i) in rows" :key="i">{{ row.join(' ') }}</span>
          </div>
          <p class="m-0" style="color: var(--kv-text-secondary);">
            {{ t('e2ee.identity.codeHelp', { name: selected.username }) }}
          </p>
          <p v-if="code.verified" class="m-0 font-semibold" style="color: var(--kv-online, #3DB46E);" role="status">
            {{ t('e2ee.identity.verified') }}
          </p>
          <p class="m-0 text-[12px]" style="color: var(--kv-text-muted);">{{ t('e2ee.identity.localOnly') }}</p>
        </template>
      </template>

      <div v-if="(selected && members.length > 1) || code" class="flex flex-wrap gap-3 justify-end">
        <KvButton v-if="selected && members.length > 1" variant="ghost" @click="selectedId = null">
          {{ t('e2ee.identity.back') }}
        </KvButton>
        <KvButton v-if="code" variant="ghost" :loading="saving" @click="toggleVerified">
          {{ code.verified ? t('e2ee.identity.unmarkVerified') : t('e2ee.identity.markVerified') }}
        </KvButton>
      </div>
    </div>
  </KvModal>
</template>
