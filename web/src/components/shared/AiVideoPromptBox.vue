<script setup lang="ts">
/**
 * AiVideoPromptBox (Sprint C42 §3.5): düz metin istem kutusu + sağ altta `@` düğmesi + yazarken `@` ile açılan ek listesi.
 * Etiketler (`@Görsel1`) kutuda renkli görünür: textarea'nın ARKASINDA aynı metni basan, metni saydam, etiketleri
 * boyalı bir katman var (arka plan katmanı yöntemi). Katman kayarsa yalnız renk kayar, metin bozulmaz.
 * Sohbetteki `useMentionAutocomplete` üye/rol/@everyone'a bağlı olduğundan yeniden kullanılmadı; burada yalnız
 * ek etiketleri önerilir (Rule of Three: iki kullanım, ortaklaştırılmadı).
 */
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiVideoRefKind } from '@/api/aiVideo'
import { splitTags, TAG_COLOR } from '@/utils/aiVideoTags'

interface PromptRef {
  uid: number
  kind: AiVideoRefKind
  previewUrl: string
  label: string
}

const props = defineProps<{
  modelValue: string
  items: PromptRef[]
  disabled?: boolean
  placeholder?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useI18n()
const ta = ref<HTMLTextAreaElement | null>(null)
const back = ref<HTMLElement | null>(null)
const open = ref(false)
const query = ref('')
const active = ref(0)

const parts = computed(() => splitTags(props.modelValue))
const matches = computed(() =>
  props.items.filter((i) => i.label.toLowerCase().startsWith(query.value.toLowerCase())),
)
const listVisible = computed(() => open.value && matches.value.length > 0)

const pad = 'px-3 pt-2 pb-8 text-[14px] leading-5'

function syncScroll() {
  if (back.value && ta.value) back.value.scrollTop = ta.value.scrollTop
}

/** İmlecin solundaki `@kelime` varsa listeyi açar. */
function detect() {
  const el = ta.value
  if (!el || !props.items.length) {
    open.value = false
    return
  }
  const m = el.value.slice(0, el.selectionStart).match(/@([\p{L}\d]*)$/u)
  open.value = !!m
  if (m) {
    query.value = m[1]
    active.value = 0
  }
}

function onInput() {
  if (!ta.value) return
  emit('update:modelValue', ta.value.value)
  detect()
}

function setText(text: string, cursor: number) {
  emit('update:modelValue', text)
  void nextTick(() => {
    ta.value?.focus()
    ta.value?.setSelectionRange(cursor, cursor)
    syncScroll()
  })
}

function pick(item: PromptRef) {
  const el = ta.value
  if (!el) return
  const pos = el.selectionStart
  const start = pos - query.value.length - 1
  const insert = `@${item.label} `
  const text = el.value.slice(0, start) + insert + el.value.slice(pos)
  open.value = false
  setText(text, start + insert.length)
}

/** `@` düğmesi: imleç konumuna `@` ekler ve listeyi açar. */
function insertAt() {
  const el = ta.value
  if (!el || !props.items.length || props.disabled) return
  const pos = el.selectionStart
  const needSpace = pos > 0 && !/\s/.test(el.value[pos - 1])
  const insert = needSpace ? ' @' : '@'
  const text = el.value.slice(0, pos) + insert + el.value.slice(el.selectionEnd)
  setText(text, pos + insert.length)
  query.value = ''
  active.value = 0
  open.value = true
}

function onKeydown(e: KeyboardEvent) {
  if (!listVisible.value) return
  const n = matches.value.length
  if (e.key === 'ArrowDown') active.value = (active.value + 1) % n
  else if (e.key === 'ArrowUp') active.value = (active.value - 1 + n) % n
  else if (e.key === 'Enter' || e.key === 'Tab') pick(matches.value[active.value])
  else if (e.key === 'Escape') {
    e.stopPropagation() // pencereyi kapatmasın
    open.value = false
  } else return
  e.preventDefault()
}
</script>

<template>
  <div class="relative min-w-0">
    <div
      class="relative rounded-[var(--kv-radius-md)] border border-[var(--kv-border-subtle)] bg-[var(--kv-bg-content)]"
      :class="disabled && 'opacity-60'"
    >
      <div
        ref="back"
        aria-hidden="true"
        :class="[pad, 'absolute inset-0 overflow-hidden whitespace-pre-wrap break-words pointer-events-none']"
        style="color: transparent; scrollbar-gutter: stable;"
      >
        <template v-for="(p, i) in parts" :key="i">
          <mark
            v-if="p.tag"
            class="rounded-[3px]"
            :style="{ color: 'transparent', background: `color-mix(in srgb, ${TAG_COLOR[p.tag]} 28%, transparent)` }"
          >{{ p.text }}</mark>
          <template v-else>{{ p.text }}</template>
        </template>&#8203;
      </div>
      <textarea
        id="ai-video-prompt"
        ref="ta"
        :value="modelValue"
        rows="5"
        :disabled="disabled"
        :placeholder="placeholder"
        :class="[pad, 'relative block w-full field-sizing-content min-h-[140px] max-h-60 resize-none overflow-y-auto bg-transparent outline-none disabled:cursor-not-allowed']"
        style="color: var(--kv-text-primary); scrollbar-gutter: stable;"
        @input="onInput"
        @click="detect"
        @keydown="onKeydown"
        @scroll="syncScroll"
      />
      <button
        type="button"
        class="absolute right-2 bottom-1.5 z-10 h-6 min-w-6 px-1.5 rounded-[var(--kv-radius-sm)] text-[13px] font-semibold border border-[var(--kv-border-subtle)] bg-[var(--kv-bg-elevated)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        style="color: var(--kv-text-secondary);"
        :disabled="disabled || !items.length"
        :title="items.length ? t('aiVideo.refs.tagButton') : t('aiVideo.refs.tagDisabled')"
        :aria-label="items.length ? t('aiVideo.refs.tagButton') : t('aiVideo.refs.tagDisabled')"
        @mousedown.prevent
        @click="insertAt"
      >
        {{ '@' }}
      </button>
    </div>

    <ul
      v-if="listVisible"
      role="listbox"
      :aria-label="t('aiVideo.refs.tagList')"
      class="absolute left-0 right-0 bottom-full mb-1 z-20 max-h-44 overflow-y-auto list-none p-1 m-0 rounded-[var(--kv-radius-md)] border border-[var(--kv-border-subtle)] bg-[var(--kv-bg-elevated)] shadow-lg"
    >
      <li
        v-for="(it, i) in matches"
        :key="it.uid"
        role="option"
        :aria-selected="i === active"
        class="flex items-center gap-2 min-w-0 px-2 py-1 rounded-[var(--kv-radius-sm)] cursor-pointer"
        :class="i === active && 'bg-[var(--kv-accent-subtle)]'"
        @mousedown.prevent="pick(it)"
        @mouseenter="active = i"
      >
        <img v-if="it.kind === 'image'" :src="it.previewUrl" alt="" class="h-6 w-6 shrink-0 rounded object-cover" />
        <video v-else-if="it.kind === 'video'" :src="`${it.previewUrl}#t=0.1`" preload="metadata" muted playsinline class="h-6 w-6 shrink-0 rounded object-cover" />
        <svg v-else viewBox="0 0 24 24" class="h-6 w-6 shrink-0 p-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color: var(--kv-text-muted);" aria-hidden="true">
          <path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" />
        </svg>
        <span class="truncate text-[13px] font-medium" :style="{ color: TAG_COLOR[it.kind] }">{{ '@' + it.label }}</span>
      </li>
    </ul>
  </div>
</template>
