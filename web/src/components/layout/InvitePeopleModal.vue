<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClipboard } from '@vueuse/core'
import { invitesApi } from '@/api/invites'
import { friendsApi } from '@/api/friends'
import { dmApi } from '@/api/dm'
import { messagesApi } from '@/api/messages'
import { useToastStore } from '@/stores/toast'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'
import UserAvatar from '@/components/shared/UserAvatar.vue'
import type { FriendDto } from '@/types'

const props = defineProps<{ guildId: string }>()
defineEmits<{ close: [] }>()

const { t } = useI18n()
const toast = useToastStore()

// ── Davet linki (tek sefer oluştur, cache'le) ──
const creating = ref(true)
const inviteCode = ref<string | null>(null)

// GuildSettingsView ile BİREBİR aynı format: origin + /invite/:code
const inviteLink = computed(() =>
  inviteCode.value ? `${window.location.origin}/invite/${inviteCode.value}` : '',
)

const { copy, copied } = useClipboard({ source: inviteLink })

async function createInvite() {
  creating.value = true
  try {
    const res = await invitesApi.create(props.guildId)
    inviteCode.value = res.data.code
  } catch {
    toast.error(t('invitePeople.createError'))
  } finally {
    creating.value = false
  }
}

// ── Kanka listesi ──
const friends = ref<FriendDto[]>([])
const friendsLoading = ref(true)
// userId → 'sending' | 'sent' (gönderim durumu, spam koruması)
const sendState = ref<Record<string, 'sending' | 'sent'>>({})

async function loadFriends() {
  friendsLoading.value = true
  try {
    const res = await friendsApi.getFriends()
    friends.value = res.data
  } catch {
    toast.error(t('invitePeople.friendsError'))
  } finally {
    friendsLoading.value = false
  }
}

async function inviteFriend(friend: FriendDto) {
  const userId = friend.user.id
  if (sendState.value[userId] || !inviteLink.value) return
  sendState.value[userId] = 'sending'
  try {
    const channelRes = await dmApi.openChannel(userId)
    await messagesApi.send(channelRes.data.id, inviteLink.value)
    sendState.value[userId] = 'sent'
  } catch {
    delete sendState.value[userId]
    toast.error(t('invitePeople.sendError'))
  }
}

onMounted(() => {
  createInvite()
  loadFriends()
})
</script>

<template>
  <KvModal :title="t('invitePeople.title')" @close="$emit('close')">
    <div class="flex flex-col gap-5">
      <!-- (a) Davet linki -->
      <div class="flex flex-col gap-2">
        <p class="text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
          {{ t('invitePeople.linkLabel') }}
        </p>

        <!-- Yükleniyor iskeleti -->
        <div
          v-if="creating"
          class="h-10 rounded-[var(--kv-radius-md)] animate-pulse"
          style="background-color: var(--kv-bg-elevated);"
        />

        <div
          v-else-if="inviteCode"
          class="flex items-center gap-2 px-3 py-2 rounded-[var(--kv-radius-md)] border"
          style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
        >
          <code class="flex-1 text-[13px] font-mono truncate" style="color: var(--kv-text-primary);">{{ inviteLink }}</code>
          <KvButton size="sm" @click="copy()">
            {{ copied ? t('invite.copied') : t('invite.copy') }}
          </KvButton>
        </div>
      </div>

      <!-- (b) Kanka listesi -->
      <div class="flex flex-col gap-2">
        <p class="text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
          {{ t('invitePeople.friendsLabel') }}
        </p>

        <div v-if="friendsLoading" class="text-[13px]" style="color: var(--kv-text-muted);">
          {{ t('common.loading') }}
        </div>

        <div v-else-if="friends.length === 0" class="text-[13px]" style="color: var(--kv-text-muted);">
          {{ t('invitePeople.noFriends') }}
        </div>

        <ul v-else class="flex flex-col gap-1.5">
          <li
            v-for="friend in friends"
            :key="friend.user.id"
            class="flex items-center gap-2.5 px-3 py-2 rounded-[var(--kv-radius-md)] border"
            style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
          >
            <UserAvatar :username="friend.user.username" :avatar-url="friend.user.avatarUrl" />
            <span class="flex-1 min-w-0 text-[14px] truncate" style="color: var(--kv-text-primary);">
              {{ friend.user.username }}
            </span>
            <KvButton
              size="sm"
              :variant="sendState[friend.user.id] === 'sent' ? 'ghost' : 'primary'"
              :disabled="!!sendState[friend.user.id] || creating"
              :loading="sendState[friend.user.id] === 'sending'"
              @click="inviteFriend(friend)"
            >
              {{ sendState[friend.user.id] === 'sent' ? t('invitePeople.invited') : t('invitePeople.inviteButton') }}
            </KvButton>
          </li>
        </ul>
      </div>
    </div>
  </KvModal>
</template>
