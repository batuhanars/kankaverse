<script setup lang="ts">
/**
 * GuildMemberSelect — basit aranabilir ortam-üyesi seçici dropdown'ı (R13 arama filtreleri).
 * Gönderen / Bahsedilen filtrelerinde kullanılır. Seçince `select` emit eder.
 */
import { ref, computed } from 'vue'
import { onClickOutside } from '@vueuse/core'
import type { GuildMemberDto } from '@/types'

const props = defineProps<{ members: GuildMemberDto[]; placeholder: string }>()
const emit = defineEmits<{ select: [GuildMemberDto] }>()

const open = ref(false)
const term = ref('')
const root = ref<HTMLElement | null>(null)

onClickOutside(root, () => (open.value = false))

const filtered = computed(() => {
  const q = term.value.trim().toLowerCase()
  return q ? props.members.filter((m) => m.username.toLowerCase().includes(q)) : props.members
})

function pick(m: GuildMemberDto) {
  emit('select', m)
  open.value = false
  term.value = ''
}
</script>

<template>
  <div ref="root" class="relative">
    <input
      v-model="term"
      type="text"
      class="w-full px-2 py-1.5 rounded-[var(--kv-radius-sm)] text-[12px] outline-none border"
      style="background-color: var(--kv-bg-content); color: var(--kv-text-primary); border-color: var(--kv-border-strong); font-family: var(--kv-font-ui);"
      :placeholder="placeholder"
      @focus="open = true"
    />
    <div
      v-if="open && filtered.length"
      class="absolute z-10 left-0 right-0 mt-1 max-h-44 overflow-y-auto rounded-[var(--kv-radius-sm)] border"
      style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
    >
      <button
        v-for="m in filtered"
        :key="m.userId"
        class="w-full flex items-center gap-2 px-2 py-1.5 text-left cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
        @click="pick(m)"
      >
        <span
          class="w-5 h-5 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-semibold text-white"
          style="background-color: var(--kv-accent-500);"
        >
          <img v-if="m.avatarUrl" :src="m.avatarUrl" :alt="m.username" class="w-full h-full object-cover" />
          <span v-else>{{ m.username[0].toUpperCase() }}</span>
        </span>
        <span class="text-[12px] truncate" style="color: var(--kv-text-body);">{{ m.username }}</span>
      </button>
    </div>
  </div>
</template>
