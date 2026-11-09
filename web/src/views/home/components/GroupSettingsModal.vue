<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDmStore } from '@/stores/dm'

const props = defineProps<{ groupId: string; groupName: string | null }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const dmStore = useDmStore()

const nameValue = ref(props.groupName ?? '')
const saving = ref(false)
const error = ref('')

const trimmed = computed(() => nameValue.value.trim())
const canSave = computed(
  () => !!trimmed.value && trimmed.value !== (props.groupName ?? '') && !saving.value,
)

async function save() {
  if (!canSave.value) return
  error.value = ''
  saving.value = true
  try {
    await dmStore.renameGroup(props.groupId, trimmed.value)
    emit('close')
  } catch {
    error.value = t('group.renameError')
  } finally {
    saving.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <!-- Teleport: yüzen panelin transform/filtre katmanı `fixed`i panele hapsediyordu (sahip bulgusu 2026-11-09) -->
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center"
      style="background-color: rgba(0,0,0,0.5);"
      @click.self="emit('close')"
    >
      <div
        class="w-[360px] rounded-[var(--kv-radius-lg)] overflow-hidden"
        style="background-color: var(--kv-bg-sidebar);"
        role="dialog"
        :aria-label="t('group.settingsTitle')"
      >
        <div class="flex items-center justify-between px-4 py-3 border-b" style="border-color: var(--kv-border-subtle);">
          <h3 class="text-[15px] font-semibold" style="color: var(--kv-text-primary);">{{ t('group.settingsTitle') }}</h3>
          <button class="text-[18px] cursor-pointer hover:opacity-70" style="color: var(--kv-text-muted);" @click="emit('close')">✕</button>
        </div>
        <div class="px-4 py-4">
          <label class="block text-[11px] font-semibold uppercase tracking-wide mb-1" style="color: var(--kv-text-muted);">
            {{ t('group.renameLabel') }}
          </label>
          <input
            v-model="nameValue"
            maxlength="50"
            autofocus
            :placeholder="t('group.renamePlaceholder')"
            class="w-full px-3 py-2 rounded-[var(--kv-radius-md)] text-[14px] outline-none border"
            style="background-color: var(--kv-bg-content); border-color: var(--kv-border-strong); color: var(--kv-text-primary);"
            @keydown.enter="save"
          />
          <p v-if="error" class="text-[13px] mt-1" style="color: var(--kv-danger);">{{ error }}</p>
        </div>
        <div class="flex justify-end gap-2 px-4 pb-4">
          <button
            class="px-4 py-2 text-[14px] rounded-[var(--kv-radius-md)] cursor-pointer hover:opacity-80"
            style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
            @click="emit('close')"
          >{{ t('common.cancel') }}</button>
          <button
            class="px-4 py-2 text-[14px] font-semibold rounded-[var(--kv-radius-md)] cursor-pointer hover:opacity-90 transition-opacity"
            :class="!canSave ? 'opacity-50 cursor-not-allowed' : ''"
            style="background-color: var(--kv-accent-500); color: #fff;"
            :disabled="!canSave"
            @click="save"
          >{{ t('group.renameAction') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
