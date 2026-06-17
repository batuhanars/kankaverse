<script setup lang="ts">
/**
 * VoiceParticipantList — ChannelPanel'de bir ses kanalının altında "kanalda kim var".
 * Bağlı olduğun kanal → LiveKit Room'dan CANLI (webhook gerekmez); diğer kanallar → WS/GET snapshot.
 * Konuşan göstergesi yalnız bağlı kanalda (animasyonlu yeşil halka).
 *
 * #1 — YAYINDA rozeti: yayın yapan kullanıcının adının yanında (WS broadcastingByChannel).
 * #2 — Rozete hover → popup: "Yayını İzle" butonu (kanala katıl).
 * #3 — Sağ-tık context menüsü: standart (Profil/Mesaj/Kanka Ekle/Engelle) + mod aksiyonları.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { onClickOutside } from '@vueuse/core'
import { useVoiceStore, type VoiceParticipant } from '@/stores/voice'
import { useAuthStore } from '@/stores/auth'
import { useGuildPermissions } from '@/composables/useGuildPermissions'
import { useGuildsStore } from '@/stores/guilds'
import { useToastStore } from '@/stores/toast'
import { useChannelsStore } from '@/stores/channels'
import { useFriendsStore } from '@/stores/friends'
import { voiceSubscribe, voiceUnsubscribe } from '@/composables/useSocket'
import { voiceApi } from '@/api/voice'
import { dmApi } from '@/api/dm'
import { friendsApi } from '@/api/friends'
import type { ChannelDto } from '@/types'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import UserCardPopover from '@/components/shared/UserCardPopover.vue'

const props = defineProps<{
  channelId: string
  guildId?: string
}>()

const { t } = useI18n()
const router = useRouter()
const voiceStore = useVoiceStore()
const authStore = useAuthStore()
const guildsStore = useGuildsStore()
const toast = useToastStore()
const channelsStore = useChannelsStore()
const friendsStore = useFriendsStore()

const connectedHere = computed(() => voiceStore.connectedChannelId === props.channelId)

// Bağlıysak canlı oda listesi; değilsek snapshot (diğer üyeler webhook ile)
const members = computed<(VoiceParticipant & { isLocal?: boolean })[]>(() =>
  connectedHere.value ? voiceStore.roomParticipants : voiceStore.participantsFor(props.channelId),
)

function isSpeaking(userId: string): boolean {
  return connectedHere.value && voiceStore.speakingUserIds.has(userId)
}
function isMuted(userId: string, isLocal?: boolean): boolean {
  if (!connectedHere.value) return false
  return isLocal ? voiceStore.isMuted : voiceStore.mutedUserIds.has(userId)
}
function isBroadcasting(userId: string): boolean {
  return voiceStore.isBroadcasting(props.channelId, userId)
}

onMounted(() => {
  if (!connectedHere.value) voiceStore.loadParticipants(props.channelId)
  voiceSubscribe(props.channelId)
})
onUnmounted(() => voiceUnsubscribe(props.channelId))

watch(
  () => props.channelId,
  (next, prev) => {
    if (prev) voiceUnsubscribe(prev)
    voiceSubscribe(next)
    if (voiceStore.connectedChannelId !== next) voiceStore.loadParticipants(next)
  },
)

// ── #2 — YAYINDA rozet popup ──────────────────────────────────────────────────
const livePopupUserId = ref<string | null>(null)
const livePopupRef = ref<HTMLElement | null>(null)
onClickOutside(livePopupRef, () => { livePopupUserId.value = null })

async function watchStream() {
  livePopupUserId.value = null
  if (connectedHere.value) return // zaten bu kanalda — popup kapandı yeter
  await voiceStore.join(props.channelId)
}

// ── #3 — Sağ-tık context menüsü ──────────────────────────────────────────────
const ctxMenu = ref<{ userId: string; x: number; y: number } | null>(null)
const ctxMenuRef = ref<HTMLElement | null>(null)
const ctxMoveSubmenuOpen = ref(false)
onClickOutside(ctxMenuRef, () => { ctxMenu.value = null; ctxMoveSubmenuOpen.value = false })

const selfId = computed(() => authStore.user?.id ?? '')
const guildIdResolved = computed(() => props.guildId ?? channelsStore.findChannelById(props.channelId)?.guildId ?? '')
const { can } = useGuildPermissions(() => guildIdResolved.value)
const canMute = computed(() => can('MUTE_MEMBERS'))
const canMove = computed(() => can('MOVE_MEMBERS'))

const ownerId = computed(() => guildsStore.guilds.find((g) => g.id === guildIdResolved.value)?.ownerId ?? null)

function openContextMenu(e: MouseEvent, userId: string) {
  ctxMoveSubmenuOpen.value = false
  ctxMenu.value = { userId, x: e.clientX, y: e.clientY }
}

function isCtxSelf(): boolean {
  return ctxMenu.value?.userId === selfId.value
}
function isCtxOwner(): boolean {
  return !!ownerId.value && ctxMenu.value?.userId === ownerId.value
}

// Mod aksiyonları yalnız kendi+owner dışı
function canModCtx(): boolean {
  if (!ctxMenu.value) return false
  if (isCtxSelf() || isCtxOwner()) return false
  return canMute.value || canMove.value
}

function isCtxBroadcasting(): boolean {
  return ctxMenu.value ? voiceStore.isBroadcasting(props.channelId, ctxMenu.value.userId) : false
}

// Server mute durumu (sadece bağlı olduğumuz kanalda anlamlı)
function isCtxServerMuted(): boolean {
  return ctxMenu.value ? voiceStore.serverMutedUserIds.has(ctxMenu.value.userId) : false
}

// Zaten arkadaş mı → "Kanka Ekle" gizlenir (friends AppShell'de hidrate edilir)
function isCtxFriend(): boolean {
  return ctxMenu.value ? friendsStore.friends.some((f) => f.user.id === ctxMenu.value!.userId) : false
}

// Taşı: aynı guild'in diğer ses kanalları (mevcut hariç)
const ctxMoveTargets = computed<ChannelDto[]>(() =>
  channelsStore
    .channelsForGuild(guildIdResolved.value)
    .filter((c) => c.type === 'GUILD_VOICE' && c.id !== props.channelId),
)
async function ctxMoveTo(targetChannelId: string) {
  const userId = ctxMenu.value!.userId
  ctxMenu.value = null
  ctxMoveSubmenuOpen.value = false
  try {
    await voiceApi.move(props.channelId, userId, targetChannelId)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    toast.error(err.response?.data?.message ?? t('voice.moveFailed'))
  }
}

// ── Kullanıcı kartı (UserCardPopover) ────────────────────────────────────────
const showCard = ref(false)
const cardUserId = ref('')
const cardX = ref(0)
const cardY = ref(0)

// ── Context menu aksiyonları ─────────────────────────────────────────────────
function ctxViewProfile() {
  if (!ctxMenu.value) return
  cardUserId.value = ctxMenu.value.userId
  cardX.value = ctxMenu.value.x
  cardY.value = ctxMenu.value.y
  ctxMenu.value = null
  showCard.value = true
}

async function ctxSendMessage() {
  const userId = ctxMenu.value!.userId
  ctxMenu.value = null
  try {
    const { data } = await dmApi.openChannel(userId)
    router.push({ name: 'dm', params: { channelId: data.id } })
  } catch {
    toast.error(t('common.error'))
  }
}

async function ctxAddFriend() {
  const userId = ctxMenu.value!.userId
  ctxMenu.value = null
  try {
    await friendsApi.sendRequestByUser(userId)
    toast.success(t('userCard.requestSent'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    toast.error(err.response?.data?.message ?? t('common.error'))
  }
}

// Engelle — onaylı yıkıcı
const showBlockConfirm = ref(false)
const blockingUserId = ref<string | null>(null)
const blockingUsername = ref('')

function ctxBlock() {
  const member = members.value.find(m => m.userId === ctxMenu.value!.userId)
  blockingUserId.value = ctxMenu.value!.userId
  blockingUsername.value = member?.username ?? ctxMenu.value!.userId
  ctxMenu.value = null
  showBlockConfirm.value = true
}
async function doBlock() {
  if (!blockingUserId.value) return
  showBlockConfirm.value = false
  try {
    await friendsApi.blockUser(blockingUserId.value)
    toast.success(t('common.done'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    toast.error(err.response?.data?.message ?? t('common.error'))
  } finally {
    blockingUserId.value = null
  }
}

// Moderasyon: server-mute toggle
async function ctxToggleMute() {
  const userId = ctxMenu.value!.userId
  ctxMenu.value = null
  try {
    if (isCtxServerMuted()) await voiceApi.unmute(props.channelId, userId)
    else await voiceApi.mute(props.channelId, userId)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    toast.error(err.response?.data?.message ?? t('voice.muteFailed'))
  }
}

// Moderasyon: yayını durdur
async function ctxStopBroadcast() {
  const userId = ctxMenu.value!.userId
  ctxMenu.value = null
  try {
    await voiceApi.stopBroadcast(props.channelId, userId)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    toast.error(err.response?.data?.message ?? t('voice.stopBroadcastFailed'))
  }
}

// Moderasyon: odadan çıkar — onaylı yıkıcı
const showDisconnectConfirm = ref(false)
const disconnectingUserId = ref<string | null>(null)
const disconnectingUsername = ref('')

function ctxDisconnect() {
  const member = members.value.find(m => m.userId === ctxMenu.value!.userId)
  disconnectingUserId.value = ctxMenu.value!.userId
  disconnectingUsername.value = member?.username ?? ctxMenu.value!.userId
  ctxMenu.value = null
  showDisconnectConfirm.value = true
}
async function doDisconnect() {
  if (!disconnectingUserId.value) return
  showDisconnectConfirm.value = false
  try {
    await voiceApi.disconnect(props.channelId, disconnectingUserId.value)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    toast.error(err.response?.data?.message ?? t('voice.disconnectFailed'))
  } finally {
    disconnectingUserId.value = null
  }
}


</script>

<template>
  <div v-if="members.length" class="flex flex-col gap-0.5 pl-8 pr-2 pb-1">
    <div
      v-for="p in members"
      :key="p.userId"
      class="flex items-center gap-2 py-0.5 text-[13px] group/row"
      style="color: var(--kv-text-secondary);"
      @contextmenu.prevent="openContextMenu($event, p.userId)"
    >
      <!-- Avatar (daire) + konuşma halkası -->
      <div
        class="w-5 h-5 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-semibold text-white"
        :class="{ 'kv-speaking': isSpeaking(p.userId) }"
        style="background-color: var(--kv-accent-500);"
      >
        <img v-if="p.avatarUrl" :src="p.avatarUrl" :alt="p.username" class="w-full h-full object-cover" />
        <span v-else>{{ p.username[0]?.toUpperCase() }}</span>
      </div>
      <span class="truncate flex-1">{{ p.username }}</span>

      <!-- #1 — YAYINDA rozeti + #2 popup -->
      <div v-if="isBroadcasting(p.userId)" class="relative shrink-0">
        <button
          class="text-[10px] font-bold px-1.5 py-0.5 rounded-sm leading-none cursor-pointer"
          style="background-color: var(--kv-accent-500); color: #fff;"
          @click.stop="livePopupUserId = livePopupUserId === p.userId ? null : p.userId"
        >
          {{ t('voice.live') }}
        </button>

        <!-- #2 — Popup: "Yayını İzle" -->
        <div
          v-if="livePopupUserId === p.userId"
          ref="livePopupRef"
          class="absolute left-0 top-full mt-1 z-30 rounded-[var(--kv-radius-md)] border p-3 min-w-[160px]"
          style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
          @click.stop
        >
          <p class="text-[12px] font-semibold mb-1" style="color: var(--kv-text-primary);">
            {{ t('voice.nowStreaming') }}
          </p>
          <span class="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-sm mb-2 leading-none" style="background-color: var(--kv-accent-500); color: #fff;">
            {{ t('voice.live') }}
          </span>
          <button
            class="flex items-center gap-1.5 w-full py-1.5 px-2 rounded-[var(--kv-radius-sm)] text-[12px] font-medium text-white cursor-pointer transition-opacity hover:opacity-90"
            style="background-color: var(--kv-success, #3DB46E);"
            @click="watchStream"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            {{ t('voice.watchStream') }}
          </button>
        </div>
      </div>

      <!-- Mute göstergesi -->
      <svg
        v-if="isMuted(p.userId, p.isLocal)"
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        style="color: var(--kv-danger);" class="shrink-0"
      >
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
      </svg>
    </div>
  </div>

  <!-- #3 — Sağ-tık context menüsü -->
  <Teleport to="body">
    <div
      v-if="ctxMenu"
      ref="ctxMenuRef"
      class="fixed z-50 rounded-[var(--kv-radius-md)] border overflow-hidden py-1"
      :style="`top:${ctxMenu.y}px;left:${ctxMenu.x}px;min-width:180px;background-color:var(--kv-bg-elevated);border-color:var(--kv-border-subtle);`"
      @click.stop
    >
      <!-- Standart aksiyonlar: Profil (herkes için) -->
      <button
        class="w-full text-left px-3 py-1.5 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
        style="color: var(--kv-text-secondary);"
        @click="ctxViewProfile"
      >
        {{ t('voice.viewProfile') }}
      </button>

      <!-- Kendine sağ-tık: yalnız Profil -->
      <template v-if="!isCtxSelf()">
        <!-- Mesaj Gönder -->
        <button
          class="w-full text-left px-3 py-1.5 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-text-secondary);"
          @click="ctxSendMessage"
        >
          {{ t('voice.sendMessage') }}
        </button>
        <!-- Kanka Ekle (zaten arkadaşsa gizli) -->
        <button
          v-if="!isCtxFriend()"
          class="w-full text-left px-3 py-1.5 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-text-secondary);"
          @click="ctxAddFriend"
        >
          {{ t('voice.addFriend') }}
        </button>
        <!-- Engelle (danger) -->
        <button
          class="w-full text-left px-3 py-1.5 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-danger);"
          @click="ctxBlock"
        >
          {{ t('voice.blockUser') }}
        </button>

        <!-- Ayraç + Mod aksiyonları (yalnız yetkili, hedef owner değilse) -->
        <template v-if="canModCtx()">
          <div class="my-1 border-t" style="border-color: var(--kv-border-subtle);"></div>
          <!-- Sustur / Susturmayı kaldır (MUTE_MEMBERS) -->
          <button
            v-if="canMute"
            class="w-full text-left px-3 py-1.5 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
            style="color: var(--kv-text-secondary);"
            @click="ctxToggleMute"
          >
            {{ isCtxServerMuted() ? t('voice.serverUnmute') : t('voice.serverMute') }}
          </button>
          <!-- Yayını Durdur (MUTE_MEMBERS, yalnız yayın yapıyorsa) -->
          <button
            v-if="canMute && isCtxBroadcasting()"
            class="w-full text-left px-3 py-1.5 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
            style="color: var(--kv-text-secondary);"
            @click="ctxStopBroadcast"
          >
            {{ t('voice.stopBroadcast') }}
          </button>
          <!-- Taşı (MOVE_MEMBERS) — alt liste -->
          <template v-if="canMove">
            <button
              class="w-full text-left px-3 py-1.5 text-[13px] flex items-center justify-between transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
              style="color: var(--kv-text-secondary);"
              @click.stop="ctxMoveSubmenuOpen = !ctxMoveSubmenuOpen"
            >
              <span>{{ t('voice.moveTo') }}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 transition-transform" :class="ctxMoveSubmenuOpen ? 'rotate-90' : ''"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <div v-if="ctxMoveSubmenuOpen" class="max-h-44 overflow-y-auto">
              <p v-if="ctxMoveTargets.length === 0" class="px-5 py-1.5 text-[12px]" style="color: var(--kv-text-muted);">
                {{ t('voice.noMoveTargets') }}
              </p>
              <button
                v-for="target in ctxMoveTargets"
                :key="target.id"
                class="w-full text-left px-5 py-1.5 text-[12px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)] truncate"
                style="color: var(--kv-text-secondary);"
                @click="ctxMoveTo(target.id)"
              >
                {{ target.name }}
              </button>
            </div>
          </template>
          <!-- Odadan Çıkar (MOVE_MEMBERS) -->
          <button
            v-if="canMove"
            class="w-full text-left px-3 py-1.5 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
            style="color: var(--kv-danger);"
            @click="ctxDisconnect"
          >
            {{ t('voice.disconnectUser') }}
          </button>
        </template>
      </template>
    </div>
  </Teleport>

  <!-- Engelle onay dialog -->
  <ConfirmDialog
    v-if="showBlockConfirm"
    :message="t('friends.confirmBlock')"
    :confirm-label="t('friends.block')"
    @confirm="doBlock"
    @cancel="showBlockConfirm = false; blockingUserId = null"
  />

  <!-- Odadan çıkar onay dialog -->
  <ConfirmDialog
    v-if="showDisconnectConfirm"
    :message="t('voice.disconnectConfirm', { username: disconnectingUsername })"
    :confirm-label="t('voice.disconnectUser')"
    @confirm="doDisconnect"
    @cancel="showDisconnectConfirm = false; disconnectingUserId = null"
  />

  <!-- Kullanıcı kartı -->
  <UserCardPopover
    v-if="showCard"
    :user-id="cardUserId"
    :x="cardX"
    :y="cardY"
    @close="showCard = false"
  />
</template>
