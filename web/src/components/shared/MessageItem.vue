<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useRolesStore } from '@/stores/roles'
import { useMessagesStore } from '@/stores/messages'
import { messagesApi } from '@/api/messages'
import MessageRow from './MessageRow.vue'
import UserCardPopover from './UserCardPopover.vue'
import ReportModal from './ReportModal.vue'
import ForwardMessageModal from './ForwardMessageModal.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import ReactionPill from './ReactionPill.vue'
import ReactionsModal from './ReactionsModal.vue'
import type { MessageDto, GuildMemberDto } from '@/types'

const props = defineProps<{
  message: MessageDto
  isGroupStart: boolean
  // Sprint V2: guild üyeleri (MessageArea'dan aktarılır; mention çözümü için)
  guildMembers?: GuildMemberDto[]
  // Sprint V2 Pins: kullanıcı bu kanalda mesaj sabitleyebilir mi?
  canPin?: boolean
  // Faz 3: MANAGE_MESSAGES — başkasının mesajını silebilir mi?
  canManageMessages?: boolean
  // C10: guild kanalında ise → kullanıcı kartı rol rozetlerini bu ortam bağlamında gösterir
  guildId?: string
}>()
const emit = defineEmits<{
  reply: [message: MessageDto]
  // C29: başarısız geçici mesaj
  retry: [message: MessageDto]
  discard: [message: MessageDto]
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const messagesStore = useMessagesStore()

const isMine = computed(() => props.message.author.id === authStore.user?.id)

// Sprint V2: mention çözücü — guild üye listesinden userId → username
function mentionResolver(userId: string): string {
  const member = props.guildMembers?.find((m) => m.userId === userId)
  return member ? member.username : t('mention.unknown')
}

/**
 * R15 — rol çözücü: roleId → { ad, renk }. Roller store'dan okunur (kart/ayarlar hattı zaten
 * dolduruyor). Bulunamazsa `undefined` döner ve render "@rol" yedeğine düşer — silinmiş ya da
 * henüz yüklenmemiş rol için uydurma ad basmayız.
 */
const rolesStore = useRolesStore()
function roleResolver(roleId: string): { name: string; color?: string | null } | undefined {
  if (!props.guildId) return undefined
  const role = rolesStore.rolesFor(props.guildId).find((r) => r.id === roleId)
  return role ? { name: role.name, color: role.color } : undefined
}

/** R15 — bana atanmış rol id'leri (bahsetme bandı kesişimi için). */
const myRoleIds = computed<string[]>(() => {
  if (!props.guildId) return []
  const me = props.guildMembers?.find((m) => m.userId === authStore.user?.id)
  return me?.roles?.map((r) => r.id) ?? []
})

// Sprint V2: kendi bahsedilme vurgusu — R15: rolümden bahsedilmek de sayılır
const isMentioned = computed(() => {
  if (props.message.mentionsEveryone === true) return true
  if (props.message.mentions?.includes(authStore.user?.id ?? '')) return true
  const roles = props.message.mentionRoles
  if (roles?.length && myRoleIds.value.length) {
    return roles.some((id) => myRoleIds.value.includes(id))
  }
  return false
})

// Kullanıcı kartı popover (yazar adına tıklama — MessageRow gelecekte emit ile bağlanabilir)
const showCard = ref(false)
const cardX = ref(0)
const cardY = ref(0)

// Şikâyet modalı
const showReportModal = ref(false)
// İlet (forward) modalı
const showForward = ref(false)
// C46: kimler tepki verdi penceresi
const showReactions = ref(false)

// Düzenleme durumu
const editing = ref(false)
const editContent = ref('')
const editLoading = ref(false)
const editError = ref('')
const editTextareaEl = ref<HTMLTextAreaElement | null>(null)

// Silme durumu
const showDeleteConfirm = ref(false)
const deleteLoading = ref(false)

// Sprint V2 Pins: sabitleme / kaldırma (WS echo ile state güncellenir)
async function pinMessage() {
  try {
    await messagesApi.pinMessage(props.message.channelId, props.message.id)
  } catch {
    // sessizce yut — WS echo gelmezse state değişmez
  }
}

async function unpinMessage() {
  try {
    await messagesApi.unpinMessage(props.message.channelId, props.message.id)
  } catch {
    // sessizce yut
  }
}

// Reaksiyon
async function addReaction(_msgId: string, emoji: string) {
  try {
    await messagesApi.addReaction(props.message.channelId, props.message.id, emoji)
    // Store güncellemesi useSocket reaction.added handler'ından gelir
  } catch {
    // sessizce yut
  }
}

async function toggleReaction(emoji: string, reactedByMe: boolean) {
  try {
    if (reactedByMe) {
      await messagesApi.removeReaction(props.message.channelId, props.message.id, emoji)
    } else {
      await messagesApi.addReaction(props.message.channelId, props.message.id, emoji)
    }
    // Store güncellemesi useSocket reaction.added/reaction.removed handler'ından gelir
  } catch {
    // sessizce yut
  }
}

// Kullanıcı kartı
function closeCard() {
  showCard.value = false
}

// Düzenleme
function startEdit() {
  editContent.value = props.message.content
  editError.value = ''
  editing.value = true
  nextTick(() => {
    if (editTextareaEl.value) {
      editTextareaEl.value.focus()
      editTextareaEl.value.style.height = 'auto'
      editTextareaEl.value.style.height = editTextareaEl.value.scrollHeight + 'px'
    }
  })
}

function cancelEdit() {
  editing.value = false
  editError.value = ''
}

async function saveEdit() {
  const trimmed = editContent.value.trim()
  if (!trimmed || editLoading.value) return
  editLoading.value = true
  editError.value = ''
  try {
    const { data } = await messagesApi.editMessage(
      props.message.channelId,
      props.message.id,
      trimmed,
    )
    messagesStore.updateMessage(data)
    editing.value = false
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } } }
    const code = err.response?.data?.error
    editError.value =
      code === 'MESSAGE_BLOCKED' ? t('message.errors.MESSAGE_BLOCKED') : t('common.error')
  } finally {
    editLoading.value = false
  }
}

function onEditKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    saveEdit()
  }
  if (e.key === 'Escape') {
    cancelEdit()
  }
}

// Silme
function openDeleteConfirm() {
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  deleteLoading.value = true
  try {
    await messagesApi.deleteMessage(props.message.channelId, props.message.id)
    messagesStore.removeMessage(props.message.channelId, props.message.id)
  } catch {
    // Sunucu hatası — WS zaten kaldıracak
  } finally {
    deleteLoading.value = false
    showDeleteConfirm.value = false
  }
}

onMounted(() => {
  window.addEventListener('kv:close-user-cards', closeCard)
})
onUnmounted(() => {
  window.removeEventListener('kv:close-user-cards', closeCard)
})
</script>

<template>
  <MessageRow
    :message="message"
    :is-mine="isMine"
    :is-group-start="isGroupStart"
    :is-editing="editing"
    :mention-resolver="mentionResolver"
    :role-resolver="roleResolver"
    :is-mentioned="isMentioned"
    :can-pin="canPin ?? false"
    :can-manage-messages="canManageMessages ?? false"
    @reply="emit('reply', $event)"
    @forward="showForward = true"
    @edit="startEdit"
    @delete="openDeleteConfirm"
    @report="showReportModal = true"
    @add-reaction="addReaction"
    @view-reactions="showReactions = true"
    @pin="pinMessage"
    @unpin="unpinMessage"
    @retry="emit('retry', $event)"
    @discard="emit('discard', $event)"
  >
    <!-- Düzenleme modu -->
    <template #editing>
      <div v-if="editing" class="mt-1">
        <textarea
          ref="editTextareaEl"
          v-model="editContent"
          rows="1"
          class="w-full px-3 py-2 rounded-[var(--kv-radius-sm)] text-[14px] resize-none outline-none border"
          style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary); border-color: var(--kv-border-strong); font-family: var(--kv-font-ui); max-height: 200px;"
          :disabled="editLoading"
          @keydown="onEditKeydown"
          @input="($event.target as HTMLTextAreaElement).style.height = 'auto'; ($event.target as HTMLTextAreaElement).style.height = ($event.target as HTMLTextAreaElement).scrollHeight + 'px'"
        />
        <p v-if="editError" class="text-[12px] mt-1" style="color: var(--kv-danger);">{{ editError }}</p>
        <div class="flex gap-2 mt-1 text-[12px]" style="color: var(--kv-text-muted);">
          <span>{{ t('message.editHint') }}</span>
          <button
            class="underline cursor-pointer hover:opacity-80"
            style="color: var(--kv-danger);"
            @click="cancelEdit"
          >
            {{ t('common.cancel') }}
          </button>
        </div>
      </div>
    </template>

    <!-- Reaksiyon pill'leri (guild kanalı) -->
    <template #reactions>
      <ReactionPill
        v-for="reaction in message.reactions"
        :key="reaction.emoji"
        :reaction="reaction"
        :channel-id="message.channelId"
        :message-id="message.id"
        @toggle="toggleReaction(reaction.emoji, reaction.reactedByMe)"
      />
    </template>
  </MessageRow>

  <!-- Kullanıcı kartı (yazar adına tıklama — yalnız grup başında görünür) -->
  <UserCardPopover
    v-if="showCard"
    :user-id="message.author.id"
    :x="cardX"
    :y="cardY"
    :guild-id="guildId"
    @close="showCard = false"
  />

  <!-- Mesaj şikâyet modalı -->
  <ReportModal
    v-if="showReportModal"
    target-type="MESSAGE"
    :target-id="message.id"
    @close="showReportModal = false"
  />

  <!-- C46: kimler tepki verdi -->
  <ReactionsModal
    v-if="showReactions"
    :channel-id="message.channelId"
    :message-id="message.id"
    :guild-id="guildId"
    @close="showReactions = false"
  />

  <!-- Mesaj ilet (forward) modalı -->
  <ForwardMessageModal
    v-if="showForward"
    :message="message"
    @close="showForward = false"
  />

  <!-- Mesaj silme onayı -->
  <ConfirmDialog
    v-if="showDeleteConfirm"
    :message="t('message.deleteConfirm')"
    :confirm-label="t('message.delete')"
    :loading="deleteLoading"
    @confirm="confirmDelete"
    @cancel="showDeleteConfirm = false"
  />
</template>
