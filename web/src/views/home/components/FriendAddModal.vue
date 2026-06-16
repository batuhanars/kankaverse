<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClipboard } from '@vueuse/core'
import { useAuthStore } from '@/stores/auth'
import { useFriendsStore } from '@/stores/friends'
import KvButton from '@/components/ui/KvButton.vue'

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const authStore = useAuthStore()
const friendsStore = useFriendsStore()

const codeInput = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')
const ownCode = computed(() => authStore.user?.friendCode ?? '')
const { copy, copied } = useClipboard({ source: ownCode })

async function send() {
  const code = codeInput.value.trim().toUpperCase()
  if (!code) return
  if (code.length !== 6) {
    error.value = t('friends.errors.INVALID_CODE')
    return
  }
  loading.value = true
  error.value = ''
  success.value = ''
  try {
    await friendsStore.sendRequest(code)
    codeInput.value = ''
    success.value = t('friends.requestSent')
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    const errCode = err.response?.data?.error
    error.value = errCode
      ? (t(`friends.errors.${errCode}`) || err.response?.data?.message || t('common.error'))
      : t('common.error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center"
    style="background-color: rgba(0,0,0,0.6);"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-md rounded-[var(--kv-radius-lg)] p-8"
      style="background-color: var(--kv-bg-sidebar);"
    >
      <!-- Başlık -->
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-[20px] font-bold" style="color: var(--kv-text-primary);">
          {{ t('friends.addTitle') }}
        </h2>
        <button
          class="w-8 h-8 flex items-center justify-center rounded cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
          style="color: var(--kv-text-muted);"
          @click="emit('close')"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <p class="text-[14px] mb-6" style="color: var(--kv-text-muted);">{{ t('friends.addDescription') }}</p>

      <!-- Input + buton (dikey: taşmaz) -->
      <form class="flex flex-col gap-3 mb-2" @submit.prevent="send">
        <input
          v-model="codeInput"
          :placeholder="t('friends.codePlaceholder')"
          maxlength="6"
          class="w-full px-4 py-3 text-[14px] rounded-[var(--kv-radius-md)] outline-none uppercase tracking-widest"
          style="background-color: var(--kv-bg-rail); color: var(--kv-text-primary); border: 2px solid var(--kv-border-subtle);"
          @focus="($event.target as HTMLInputElement).style.borderColor = 'var(--kv-accent-500)'"
          @blur="($event.target as HTMLInputElement).style.borderColor = 'var(--kv-border-subtle)'"
        />
        <KvButton type="submit" :loading="loading" class="w-full justify-center whitespace-nowrap">
          {{ t('friends.addButton') }}
        </KvButton>
      </form>
      <p v-if="success" class="text-[13px] mb-1" style="color: #3DB46E;">{{ success }}</p>
      <p v-if="error" class="text-[13px] mb-1" style="color: var(--kv-danger);">{{ error }}</p>

      <!-- Kendi kodu -->
      <div class="mt-6 pt-5 border-t" style="border-color: var(--kv-border-subtle);">
        <p class="text-[11px] font-semibold uppercase tracking-widest mb-2" style="color: var(--kv-text-muted);">
          {{ t('friends.myCode') }}
        </p>
        <div class="flex items-center gap-3">
          <code class="flex-1 text-[16px] font-mono font-semibold tracking-[0.2em]" style="color: var(--kv-text-primary);">
            {{ ownCode }}
          </code>
          <button
            class="px-3 py-1.5 text-[12px] font-medium rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors"
            :style="copied
              ? 'background-color: #3DB46E; color: white;'
              : 'background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);'"
            @click="copy()"
          >{{ copied ? t('friends.copied') : t('friends.copy') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
