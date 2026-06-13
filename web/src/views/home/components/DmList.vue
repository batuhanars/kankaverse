<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useDmStore } from '@/stores/dm'
import { usePresenceStore } from '@/stores/presence'
import { useAuthStore } from '@/stores/auth'
import { useTyping } from '@/composables/useTyping'
import PresenceDot from '@/components/shared/PresenceDot.vue'
import { formatMentionsPlain } from '@/utils/mentions'
import type { DmChannelDto } from '@/types'

defineProps<{ activeChannelId: string | null }>()
const emit = defineEmits<{ select: [channelId: string] }>()

const { t } = useI18n()
const dmStore = useDmStore()
const presenceStore = usePresenceStore()
const authStore = useAuthStore()
const { typingUsersForChannel } = useTyping(() => null)

function truncate(text: string, max = 40) {
  return text.length > max ? text.slice(0, max) + '…' : text
}

// Son-mesaj önizlemesi için mention resolver: kanalın bilinen katılımcıları + giriş yapan kullanıcı
function lastMsgResolver(ch: DmChannelDto) {
  return (id: string): string | undefined => {
    if (id === authStore.user?.id) return authStore.user.username
    if (ch.type === 'DM') {
      if (id === ch.otherUser.id) return ch.otherUser.username
    } else {
      const member = ch.members.find((m) => m.id === id)
      if (member) return member.username
    }
    return undefined
  }
}

function formatLastMessage(ch: DmChannelDto, content: string): string {
  return truncate(formatMentionsPlain(content, lastMsgResolver(ch), t('mention.unknown')))
}

// Grup için görüntü adı: ad varsa onu, yoksa üye adlarını birleştir
function groupDisplayName(ch: Extract<DmChannelDto, { type: 'GROUP_DM' }>): string {
  if (ch.name) return ch.name
  const names = ch.members.map((m) => m.username)
  if (names.length <= 3) return names.join(', ')
  return names.slice(0, 2).join(', ') + ` +${names.length - 2}`
}
</script>

<template>
  <div class="flex-1 overflow-y-auto px-2 pt-2 pb-20">

    <p v-if="!dmStore.channels.length" class="px-2 py-3 text-[13px]" style="color: var(--kv-text-muted);">
      {{ t('dm.noDms') }}
    </p>

    <button
      v-for="ch in dmStore.channels"
      :key="ch.id"
      class="w-full flex items-center gap-3 px-2 py-2 rounded-[var(--kv-radius-md)] transition-colors cursor-pointer text-left"
      :style="activeChannelId === ch.id
        ? 'background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);'
        : 'color: var(--kv-text-secondary);'"
      @click="emit('select', ch.id)"
    >
      <!-- Avatar alanı -->
      <div class="relative shrink-0">
        <!-- 1-1 DM: tekil avatar + presence -->
        <template v-if="ch.type === 'DM'">
          <div class="w-8 h-8 rounded-full overflow-hidden" style="background-color: var(--kv-bg-content);">
            <img
              v-if="ch.otherUser.avatarUrl"
              :src="ch.otherUser.avatarUrl"
              :alt="ch.otherUser.username"
              class="w-full h-full object-cover"
            />
            <span v-else class="w-full h-full flex items-center justify-center text-[12px] font-semibold" style="color: var(--kv-text-secondary);">
              {{ ch.otherUser.username[0].toUpperCase() }}
            </span>
          </div>
          <!-- Okunmamış rozet -->
          <span
            v-if="ch.unread"
            class="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
            style="background-color: var(--kv-accent-500); border-color: var(--kv-bg-sidebar);"
          />
          <!-- Presence noktası (okunmamış rozet yoksa) -->
          <PresenceDot
            v-else
            :status="presenceStore.getStatus(ch.otherUser.id)"
            border-color="var(--kv-bg-sidebar)"
            class="absolute bottom-0 right-0 w-2.5 h-2.5"
          />
        </template>

        <!-- GROUP_DM: çoklu-avatar (ilk 2-3 üye dairesel istif) -->
        <template v-else>
          <div class="relative w-9 h-8">
            <!-- İlk avatar (arka) -->
            <div
              v-if="ch.members[1]"
              class="absolute bottom-0 right-0 w-6 h-6 rounded-full overflow-hidden border-2 flex items-center justify-center text-[9px] font-semibold text-white"
              style="background-color: var(--kv-bg-content); border-color: var(--kv-bg-sidebar);"
            >
              <img
                v-if="ch.members[1].avatarUrl"
                :src="ch.members[1].avatarUrl"
                :alt="ch.members[1].username"
                class="w-full h-full object-cover"
              />
              <span v-else style="background-color: var(--kv-accent-500); width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
                {{ ch.members[1].username[0].toUpperCase() }}
              </span>
            </div>
            <!-- İkinci avatar (öne) -->
            <div
              class="absolute top-0 left-0 w-6 h-6 rounded-full overflow-hidden border-2 flex items-center justify-center text-[9px] font-semibold text-white"
              style="background-color: var(--kv-bg-content); border-color: var(--kv-bg-sidebar);"
            >
              <img
                v-if="ch.members[0]?.avatarUrl"
                :src="ch.members[0].avatarUrl"
                :alt="ch.members[0].username"
                class="w-full h-full object-cover"
              />
              <span v-else style="background-color: var(--kv-accent-500); width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
                {{ (ch.members[0]?.username ?? '?')[0].toUpperCase() }}
              </span>
            </div>
          </div>
          <!-- Okunmamış rozet -->
          <span
            v-if="ch.unread"
            class="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
            style="background-color: var(--kv-accent-500); border-color: var(--kv-bg-sidebar);"
          />
        </template>
      </div>

      <!-- İsim + son mesaj -->
      <div class="flex-1 min-w-0">
        <p
          class="text-[13px] font-medium truncate"
          :style="ch.unread ? 'color: var(--kv-text-primary); font-weight: 600;' : ''"
        >
          <template v-if="ch.type === 'DM'">{{ ch.otherUser.username }}</template>
          <template v-else>{{ groupDisplayName(ch) }}</template>
        </p>
        <p
          v-if="typingUsersForChannel(ch.id).length > 0"
          class="text-[12px] truncate italic"
          style="color: var(--kv-accent-500);"
        >
          {{ t('typing.simple') }}
        </p>
        <p v-else-if="ch.lastMessage" class="text-[12px] truncate" style="color: var(--kv-text-muted);">
          {{ formatLastMessage(ch, ch.lastMessage.content) }}
        </p>
      </div>
    </button>
  </div>
</template>
