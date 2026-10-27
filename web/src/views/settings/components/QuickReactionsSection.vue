<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { usersApi } from '@/api/users'
import EmojiPicker from '@/components/shared/EmojiPicker.vue'

defineOptions({ name: 'QuickReactionsSection' })

// C24 — hızlı tepki şeridi: 5 yuva, yuvaya tık → seçici → PATCH /users/me.
// Alan bayat bir oturumda yoksa sunucu varsayılanıyla aynı beşli gösterilir (yalnız görünüm).
const FALLBACK = ['👍', '❤️', '😂', '😮', '😢']

const { t } = useI18n()
const authStore = useAuthStore()
const toast = useToastStore()

const slots = computed(() => authStore.user?.quickReactions ?? FALLBACK)
const saving = ref(false)
const openIndex = ref<number | null>(null)
const slotEls = ref<HTMLElement[]>([])
const anchorEl = computed(() => (openIndex.value === null ? null : (slotEls.value[openIndex.value] ?? null)))

async function save(next: string[]) {
  if (saving.value) return
  saving.value = true
  try {
    const { data } = await usersApi.updateProfile({ quickReactions: next })
    authStore.updateUser(data)
    toast.success(t('toast.quickReactionsSaved'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    toast.error(err.response?.data?.message ?? t('toast.saveError'))
  } finally {
    saving.value = false
  }
}

function toggleSlot(index: number) {
  openIndex.value = openIndex.value === index ? null : index
}

async function onPick(emoji: string) {
  const index = openIndex.value
  openIndex.value = null
  if (index === null) return
  const next = [...slots.value]
  const existing = next.indexOf(emoji)
  if (existing === index) return
  // Aynı emoji iki yuvada olamaz (sunucu tekrar reddeder): seçilen zaten başka yuvadaysa yer değiştirir.
  if (existing !== -1) next[existing] = next[index]
  next[index] = emoji
  await save(next)
}

async function resetToDefault() {
  openIndex.value = null
  await save([])
}

function closePicker() {
  openIndex.value = null
}
onMounted(() => document.addEventListener('click', closePicker))
onUnmounted(() => document.removeEventListener('click', closePicker))
</script>

<template>
  <section>
    <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-1" style="color: var(--kv-text-muted);">
      {{ t('settings.quickReactions.label') }}
    </h3>
    <p class="text-[12px] mb-3" style="color: var(--kv-text-muted);">
      {{ t('settings.quickReactions.description') }}
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="(emoji, i) in slots"
        :key="i"
        :ref="(el) => { if (el) slotEls[i] = el as HTMLElement }"
        type="button"
        class="w-11 h-11 flex items-center justify-center text-[22px] cursor-pointer rounded-[var(--kv-radius-md)] border-2 transition-colors disabled:opacity-60"
        :style="`background-color: var(--kv-bg-sidebar); border-color: ${openIndex === i ? 'var(--kv-accent-500)' : 'var(--kv-border-subtle)'};`"
        :disabled="saving"
        :aria-label="t('settings.quickReactions.slot', { n: i + 1 })"
        @click.stop="toggleSlot(i)"
      >
        {{ emoji }}
      </button>
    </div>
    <button
      type="button"
      class="mt-3 text-[13px] cursor-pointer underline-offset-2 hover:underline disabled:opacity-60"
      style="color: var(--kv-text-secondary);"
      :disabled="saving"
      @click.stop="resetToDefault"
    >
      {{ t('settings.quickReactions.reset') }}
    </button>
    <EmojiPicker v-if="openIndex !== null" :anchor-el="anchorEl" :track-frequent="false" @select="onPick" />
  </section>
</template>
