<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import EmojiInsertButton from './EmojiInsertButton.vue'
import { normalizeChannelNameLive } from '@/utils/channelName'

defineOptions({ name: 'EmojiNameField' })

/**
 * C21: ad alanı + emoji düğmesi. `channelRule` açıksa kanal adı kuralı yazarken uygulanır
 * (boşluk -> tire, küçük harf); kapalıysa (kategori) metin olduğu gibi kalır.
 */
const props = defineProps<{
  label?: string
  placeholder?: string
  error?: string
  channelRule?: boolean
  autofocus?: boolean
}>()

const model = defineModel<string>({ default: '' })
const inputEl = ref<HTMLInputElement | null>(null)

function transform(s: string): string {
  return props.channelRule ? normalizeChannelNameLive(s) : s
}

function onInput(e: Event) {
  const el = e.target as HTMLInputElement
  const caret = el.selectionStart ?? el.value.length
  const next = transform(el.value)
  if (next !== el.value) {
    // İmleçten önceki kısmı aynı kuralla dönüştür ki imleç yerinde kalsın.
    const pos = transform(el.value.slice(0, caret)).length
    el.value = next
    el.setSelectionRange(pos, pos)
  }
  model.value = next
}

function insertEmoji(emoji: string) {
  const el = inputEl.value
  const cur = model.value
  const start = el?.selectionStart ?? cur.length
  const end = el?.selectionEnd ?? cur.length
  const before = transform(cur.slice(0, start) + emoji)
  model.value = transform(cur.slice(0, start) + emoji + cur.slice(end))
  void nextTick(() => {
    el?.focus()
    el?.setSelectionRange(before.length, before.length)
  })
}

onMounted(() => {
  if (props.autofocus) inputEl.value?.focus()
})
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      v-if="label"
      class="text-[11px] font-semibold uppercase tracking-wide text-[var(--kv-text-secondary)]"
    >
      {{ label }}
    </label>
    <div
      class="flex items-center gap-1 pr-1 bg-[var(--kv-bg-elevated)] rounded-[var(--kv-radius-md)] border transition-colors"
      :class="
        error
          ? 'border-[var(--kv-danger)] focus-within:border-[var(--kv-danger)]'
          : 'border-[var(--kv-border-strong)] focus-within:border-[var(--kv-accent-500)]'
      "
    >
      <input
        ref="inputEl"
        :value="model"
        type="text"
        :placeholder="placeholder"
        class="min-w-0 flex-1 px-3 py-2 text-[14px] bg-transparent outline-none text-[var(--kv-text-primary)] placeholder:text-[var(--kv-text-muted)]"
        @input="onInput"
      />
      <EmojiInsertButton @pick="insertEmoji" />
    </div>
    <p v-if="error" class="text-[12px]" style="color: var(--kv-danger);">{{ error }}</p>
  </div>
</template>
