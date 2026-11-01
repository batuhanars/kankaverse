<script setup lang="ts">
/**
 * Tepki pili (kanal + DM ortak). Üzerine gelince 300 ms sonra "Ali, Ayşe ve 3 kişi daha" ipucu
 * (C46 §5.2). Tıklama davranışı ebeveynde: başkasının pili → ekle, kendi pilim → kaldır.
 */
import { ref, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import UserAvatar from './UserAvatar.vue'
import { getReactionUsers } from '@/composables/useReactionUsers'
import type { ReactionDto, ReactionGroupDto } from '@/types'

const props = defineProps<{
  reaction: ReactionDto
  channelId: string
  messageId: string
  compact?: boolean
}>()
const emit = defineEmits<{ toggle: [] }>()

const { t } = useI18n()

const HOVER_DELAY_MS = 300
const MAX_NAMES = 3

const tip = ref('')
const tipStyle = ref('')
const tipUsers = ref<ReactionGroupDto['users']>([])
let timer: ReturnType<typeof setTimeout> | null = null
let hovering = false

function buildTip(users: { username: string }[], count: number): string {
  const names = users.slice(0, MAX_NAMES).map((u) => u.username)
  if (!names.length) return ''
  const rest = count - names.length
  if (rest > 0) return t('reaction.tooltip', { names: names.join(', '), n: rest })
  return new Intl.ListFormat('tr', { style: 'long', type: 'conjunction' }).format(names)
}

async function loadTip(el: HTMLElement) {
  try {
    const groups = await getReactionUsers(props.channelId, props.messageId)
    const group = groups.find((g) => g.emoji === props.reaction.emoji)
    if (!hovering || !group) return
    const text = buildTip(group.users, group.count)
    if (!text) return
    tipUsers.value = group.users.slice(0, MAX_NAMES)
    const r = el.getBoundingClientRect()
    // Pilin üstünde, ekran kenarlarına sıkıştırılmış (fixed: kaydırılan liste kırpmasın)
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 248))
    const top = r.top > 40 ? r.top - 8 : r.bottom + 8
    tipStyle.value = `left:${left}px;top:${top}px;transform:${r.top > 40 ? 'translateY(-100%)' : 'none'};`
    tip.value = text
  } catch {
    // ipucu isteğe bağlı; sessizce yut
  }
}

function onEnter(e: MouseEvent) {
  hovering = true
  const el = e.currentTarget as HTMLElement
  timer = setTimeout(() => void loadTip(el), HOVER_DELAY_MS)
}

function onLeave() {
  hovering = false
  if (timer) clearTimeout(timer)
  timer = null
  tip.value = ''
}

onUnmounted(onLeave)
</script>

<template>
  <button
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full cursor-pointer transition-colors border"
    :class="compact ? 'text-[12px]' : 'text-[13px]'"
    :style="reaction.reactedByMe
      ? 'background-color: var(--kv-accent-subtle); border-color: var(--kv-accent-500); color: var(--kv-accent-500);'
      : 'background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle); color: var(--kv-text-secondary);'"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    @click.stop="emit('toggle')"
  >
    <span>{{ reaction.emoji }}</span>
    <span class="font-medium" :class="compact ? '' : 'text-[12px]'">{{ reaction.count }}</span>
  </button>
  <Teleport to="body">
    <div
      v-if="tip"
      class="fixed z-[60] max-w-[240px] flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--kv-radius-md)] border text-[12px] pointer-events-none"
      :style="`${tipStyle}background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle); color: var(--kv-text-primary);`"
      role="tooltip"
    >
      <span class="flex shrink-0 -space-x-1.5">
        <UserAvatar
          v-for="u in tipUsers"
          :key="u.id"
          :username="u.username"
          :avatar-url="u.avatarUrl"
          size="sm"
          class="ring-2 ring-[var(--kv-bg-elevated)]"
        />
      </span>
      <span class="min-w-0">{{ tip }}</span>
    </div>
  </Teleport>
</template>
