<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useDmStore } from '@/stores/dm'
import { useFriendsStore } from '@/stores/friends'
import { useNotificationPrefsStore } from '@/stores/notificationPrefs'
import { usePresenceStore } from '@/stores/presence'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { useVoiceStore } from '@/stores/voice'
import { voiceSubscribe, voiceUnsubscribe } from '@/composables/useSocket'
import { useTyping } from '@/composables/useTyping'
import { useResponsive } from '@/composables/useResponsive'
import { useAppShellNav } from '@/composables/useAppShellNav'
import { useDmMenuActions } from '@/composables/useDmMenuActions'
import { usersApi } from '@/api/users'
import PresenceDot from '@/components/shared/PresenceDot.vue'
import ContextMenuShell from '@/components/shared/ContextMenuShell.vue'
import MuteDurationFlyout from '@/components/shared/MuteDurationFlyout.vue'
import NotifLevelFlyout from '@/components/shared/NotifLevelFlyout.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import ReportModal from '@/components/shared/ReportModal.vue'
import FullProfileModal from '@/components/shared/FullProfileModal.vue'
import { formatMentionsPlain } from '@/utils/mentions'
import type { DmChannelDto, UserProfileCardDto } from '@/types'

const props = defineProps<{ activeChannelId: string | null }>()
const emit = defineEmits<{ select: [channelId: string] }>()

const { t } = useI18n()
const router = useRouter()
const dmStore = useDmStore()
const friendsStore = useFriendsStore()
const prefsStore = useNotificationPrefsStore()
const presenceStore = usePresenceStore()
const authStore = useAuthStore()
const toast = useToastStore()
const voiceStore = useVoiceStore()
const { isMobile } = useResponsive()
const { openGroupPanel } = useAppShellNav()
const { typingUsersForChannel } = useTyping(() => null)

// C9: bekleyen mesaj isteği kanalları normal DM listesinde GÖRÜNMEZ (istek kutusuna gider).
// Gönderenin giden PENDING isteği optimistik eklenmiş olabilir → burada elenir.
const visibleChannels = computed(() =>
  dmStore.channels.filter((ch) => !(ch.type === 'DM' && ch.requestStatus === 'PENDING')),
)

function truncate(text: string, max = 40) {
  return text.length > max ? text.slice(0, max) + '…' : text
}

// ── D47 — grup DM satırında ses göstergesi ───────────────────────────────────
// **Yalnız grup DM.** 1-1 DM'de "seste" zaten arama demek; o akış çalma sesi + `DmCallPanel` ile
// karşılanıyor, ikinci bir yüzey gürültü olur.
//
// Abonelik burada (liste) yönetilir, çizim aşağıda satırda — `VoiceParticipantList`in kanal
// panelindeki ayrımının aynısı. Açık grup DM'e `DmConversation` da abone olduğu için
// `voiceSubscribe` referans sayılıdır (bkz. `useSocket.ts`); ikisi aynı kanalı çakışmadan izler.
//
// Bağımlılık kanal DİZİSİ değil, grup DM kimliklerinin sıralanmış anahtarı: `dmStore.channels`
// her yeni mesajda (sıralama/önizleme) yeni referans alır, ham diziye baksaydık her mesajda
// abonelik sökülüp yeniden kurulurdu.
const groupDmIdsKey = computed(() =>
  visibleChannels.value
    .filter((ch) => ch.type === 'GROUP_DM')
    .map((ch) => ch.id)
    .sort()
    .join(','),
)

let subscribedVoiceIds: string[] = []

watch(
  groupDmIdsKey,
  (key) => {
    const next = key ? key.split(',') : []
    const prev = subscribedVoiceIds
    // Önce yeniye abone ol, sonra eskiyi bırak: iki kümede de olan kanalın sayacı sıfıra düşmez,
    // gereksiz unsubscribe/subscribe turu (ve o turda kaybolan gösterge) olmaz.
    for (const id of next) voiceSubscribe(id)
    for (const id of prev) voiceUnsubscribe(id)
    subscribedVoiceIds = next
    // Abonelik yalnız BUNDAN SONRAKİ olayları taşır; hâlihazırda seste olanlar için anlık görüntü
    // gerekli (`VoiceParticipantList`in mount deseniyle aynı). Yalnız yeni gelen kanallar için.
    const prevSet = new Set(prev)
    for (const id of next) {
      if (!prevSet.has(id)) void voiceStore.loadParticipants(id)
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  for (const id of subscribedVoiceIds) voiceUnsubscribe(id)
  subscribedVoiceIds = []
})

/** Seste kaç kişi var — grup DM dışında her zaman 0 (gösterge çizilmez). */
function voiceCount(ch: DmChannelDto): number {
  return ch.type === 'GROUP_DM' ? voiceStore.participantsFor(ch.id).length : 0
}

/**
 * Sprint WEB-PARITE §2.3 — susturulmuş (veya seviyesi `NONE`) DM'in görsel dili: rozet çizilmez,
 * ad kalınlaşmaz, satır sönük durur. Sohbet listeden GİZLENMEZ (kayıp sohbet hissi yaratma).
 *
 * Süzgeç sunucu ham `unread` döndürdüğü için çizimde de gerekli (yenilemeden sonra doğru davranış).
 * Tek kaynak `channelBadgeEffect`; `countMention` yanlış olan hâller tam olarak "mute veya NONE"dur
 * (`MENTIONS` DM'de bahsetme sayacı olmadığı için normal görünür — ikinci bir mute mantığı yazmıyoruz).
 */
function dmSilenced(ch: DmChannelDto): boolean {
  return !prefsStore.channelBadgeEffect(ch.id).countMention
}

/** Rozet + kalın ad yalnız okunmamış VE susturulmamışken. */
function dmShowUnread(ch: DmChannelDto): boolean {
  return ch.unread && !dmSilenced(ch)
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

// ── DM satırı context menüsü (SPRINT_DM_MENU §3) ──
// Hedef, aktif DM değil **menünün açıldığı** satırdır (ChannelPanel `contextChannel` deseni).
const menuChannel = ref<DmChannelDto | null>(null)
const menuX = ref(0)
const menuY = ref(0)
const menuDm = computed(() => (menuChannel.value?.type === 'DM' ? menuChannel.value : null))
// İş 2 (2026-08-03) — grup DM'e özgü menü öğeleri (Üye Ekle / Gruptan Ayrıl), taşındığı yer:
// `GroupManagePanel.vue` artık bu ikisini göstermiyor.
const menuGroup = computed(() => (menuChannel.value?.type === 'GROUP_DM' ? menuChannel.value : null))

function closeMenu() {
  menuChannel.value = null
}

// Satıra sağ-tık → imleç konumunda menü
function onRowContext(e: MouseEvent, ch: DmChannelDto) {
  e.preventDefault()
  e.stopPropagation()
  menuX.value = e.clientX
  menuY.value = e.clientY
  menuChannel.value = ch
}

// ⋯ butonu → butonun altına konumla + toggle (GuildMemberRow deseni: iki giriş, tek menü)
function onDotsClick(e: MouseEvent, ch: DmChannelDto) {
  if (menuChannel.value?.id === ch.id) {
    closeMenu()
    return
  }
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  menuX.value = r.right - 4
  menuY.value = r.bottom + 4
  menuChannel.value = ch
}

const {
  markDmRead,
  isDmMuted,
  dmMutedUntil,
  muteDmFor,
  unmuteDm,
  dmLevel,
  setDmLevel,
  clearDm,
  canAddFriend,
  addFriendFromDm,
} = useDmMenuActions(() => menuChannel.value)

// Profil → tam profil modalı (kartı istek anında çeker; liste kart verisi taşımıyor)
const profileCard = ref<UserProfileCardDto | null>(null)

async function openProfile() {
  const ch = menuDm.value
  closeMenu()
  if (!ch) return
  try {
    const { data } = await usersApi.getCard(ch.otherUser.id)
    profileCard.value = data
  } catch {
    // erişim kapısı 404 → kart yok; sessiz kalmak yerine kullanıcıya söylenir
    toast.error(t('common.error'))
  }
}

function doMarkRead() {
  markDmRead()
  closeMenu()
}

function doAddFriend() {
  addFriendFromDm()
  closeMenu()
}

// Sohbeti temizle — onay diyaloğu (aktif DM temizlenirse ana sayfaya dönülür: DmView'ın
// bugünkü `cleared` davranışının aynısı, kanal listeden düşünce ekran boş kalmasın).
const clearTarget = ref<DmChannelDto | null>(null)
const clearing = ref(false)

function askClear() {
  clearTarget.value = menuChannel.value
  closeMenu()
}

async function confirmClear() {
  const ch = clearTarget.value
  if (!ch) return
  clearing.value = true
  try {
    await clearDm(ch.id)
    if (props.activeChannelId === ch.id) router.push({ name: 'app' })
  } catch {
    toast.error(t('common.error'))
  } finally {
    clearing.value = false
    clearTarget.value = null
  }
}

// Şikâyet — hedef kullanıcı (grup DM'de gösterilmez: şikâyet hedefi tek kullanıcı)
const reportUserId = ref<string | null>(null)

function openReport() {
  const ch = menuDm.value
  closeMenu()
  if (ch) reportUserId.value = ch.otherUser.id
}

// ── Grup DM: Üye Ekle (İş 2 — panelden taşındı, akış aynı: `dmStore.addGroupMember`) ──
// Hedef ayrı bir ref'te tutulur: menü kapanınca `menuChannel` null'a düşer, modal açıkken
// hâlâ hangi gruba eklediğimizi bilmemiz gerekiyor.
type GroupDmChannel = Extract<DmChannelDto, { type: 'GROUP_DM' }>
const addMemberTarget = ref<GroupDmChannel | null>(null)
const addingMemberId = ref<string | null>(null)
const addMemberError = ref('')

const addableFriends = computed(() => {
  const group = addMemberTarget.value
  if (!group) return []
  const memberIds = new Set(group.members.map((m) => m.id))
  return friendsStore.friends.filter((f) => !memberIds.has(f.user.id))
})

function openAddMember() {
  const group = menuGroup.value
  closeMenu()
  if (!group) return
  addMemberError.value = ''
  addMemberTarget.value = group
}

function closeAddMember() {
  addMemberTarget.value = null
  addMemberError.value = ''
}

async function doAddGroupMember(userId: string) {
  const target = addMemberTarget.value
  if (!target || addingMemberId.value) return
  addMemberError.value = ''
  addingMemberId.value = userId
  try {
    await dmStore.addGroupMember(target.id, userId)
    addMemberTarget.value = null
  } catch {
    addMemberError.value = t('group.addMemberError')
  } finally {
    addingMemberId.value = null
  }
}

// ── Grup DM: Düzenle (Sprint R18 §2 — YENİ MODAL YOK. Grup ayarları yüzeyi zaten
// `GroupManagePanel.vue`; menü yalnız açar, gerekiyorsa önce gruba geçer. Panel state'i
// `useAppShellNav`in paylaşılan singleton'ında (`DmConversation` da aynısını okuyor) —
// router.push'in `afterEach` hook'u state'i breakpoint varsayılanına döndürüyor, bu yüzden
// `openGroupPanel()` navigasyon TAMAMLANDIKTAN SONRA çağrılıyor; sıra tersine çevrilirse
// zorla-açma anında ezilir. ──
async function openGroupSettings() {
  const group = menuGroup.value
  closeMenu()
  if (!group) return
  if (props.activeChannelId !== group.id) {
    await router.push({ name: 'dm', params: { channelId: group.id } })
  }
  openGroupPanel()
}

// ── Grup DM: Gruptan Ayrıl (İş 2 — panelden taşındı, akış aynı: `dmStore.leaveGroup`) ──
// Aktif sohbet ayrılırsa `askClear`/`confirmClear` ile aynı desen: ana sayfaya dön (kayıp
// sohbet ekranında kalınmaz).
const leaveGroupTarget = ref<GroupDmChannel | null>(null)
const leavingGroup = ref(false)

function askLeaveGroup() {
  leaveGroupTarget.value = menuGroup.value
  closeMenu()
}

async function confirmLeaveGroup() {
  const target = leaveGroupTarget.value
  if (!target) return
  leavingGroup.value = true
  try {
    await dmStore.leaveGroup(target.id)
    if (props.activeChannelId === target.id) router.push({ name: 'app' })
  } catch {
    toast.error(t('group.leaveError'))
  } finally {
    leavingGroup.value = false
    leaveGroupTarget.value = null
  }
}

// ── Grup DM: Grubu Sil (Sprint R18 §3 — yalnız SAHİP, geri alınamaz + tüm üyeleri etkiler).
// Onay deseni `leaveGroupTarget`/`confirmLeaveGroup` ile birebir aynı; mantık kopyalanmadı,
// yalnız `dmStore.deleteGroup` çağrılıyor. İstemci `ownerId` kontrolü yalnız GİZLEME amaçlı —
// kapı sunucuda (owner-only uç) zaten var, burada ikinci bir yetki üretilmiyor. ──
const canDeleteGroup = computed(
  () => !!menuGroup.value && menuGroup.value.ownerId === authStore.user?.id,
)

const deleteGroupTarget = ref<GroupDmChannel | null>(null)
const deletingGroupDm = ref(false)

function askDeleteGroup() {
  deleteGroupTarget.value = menuGroup.value
  closeMenu()
}

async function confirmDeleteGroup() {
  const target = deleteGroupTarget.value
  if (!target) return
  deletingGroupDm.value = true
  try {
    await dmStore.deleteGroup(target.id)
    if (props.activeChannelId === target.id) router.push({ name: 'app' })
  } catch {
    toast.error(t('group.deleteError'))
  } finally {
    deletingGroupDm.value = false
    deleteGroupTarget.value = null
  }
}
</script>

<template>
  <div class="flex-1 overflow-y-auto px-2 pt-2 pb-20">

    <p v-if="!visibleChannels.length" class="px-2 py-3 text-[13px]" style="color: var(--kv-text-muted);">
      {{ t('dm.noDms') }}
    </p>

    <!-- Satır sarmalayıcı: ⋯ butonu satır butonunun İÇİNE konamaz (iç içe <button> geçersiz),
         bu yüzden ikisi kardeş; sarmalayıcı hover (`group`) ve konum çapası. -->
    <div
      v-for="ch in visibleChannels"
      :key="ch.id"
      class="group relative"
      @contextmenu="onRowContext($event, ch)"
    >
      <button
        class="w-full flex items-center gap-3 pl-2 pr-9 py-2 rounded-[var(--kv-radius-md)] transition-colors cursor-pointer text-left"
        :style="activeChannelId === ch.id
          ? 'background-color: var(--kv-bg-elevated); color: var(--kv-text-primary); box-shadow: inset 2px 0 0 var(--kv-accent-500);'
          : dmSilenced(ch)
            ? 'color: var(--kv-text-muted);'
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
            <!-- Okunmamış rozet — susturulmuş DM'de çizilmez (§2.3) -->
            <span
              v-if="dmShowUnread(ch)"
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
            <!-- Okunmamış rozet — susturulmuş grup DM'de çizilmez (§2.3) -->
            <span
              v-if="dmShowUnread(ch)"
              class="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
              style="background-color: var(--kv-accent-500); border-color: var(--kv-bg-sidebar);"
            />
          </template>
        </div>

        <!-- İsim + son mesaj -->
        <div class="flex-1 min-w-0">
          <p
            class="text-[13px] font-medium truncate"
            :style="dmShowUnread(ch) ? 'color: var(--kv-text-primary); font-weight: 600;' : ''"
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

        <!-- D47 — grup DM'de ses göstergesi. Seste kimse yoksa HİÇBİR ŞEY çizilmez (boş rozet yok),
             1-1 DM'de hiç çizilmez (`voiceCount` orada zaten 0). Görsel dil kanal panelindeki ses
             sayacı hapı: yuvarlak hap + `tabular-nums`; rengi aksan, çünkü satır etkinken arka plan
             `--kv-bg-elevated` oluyor ve o tonda hap kaybolurdu. -->
        <span
          v-if="voiceCount(ch) > 0"
          class="shrink-0 flex items-center gap-1 text-[11px] font-semibold px-1.5 rounded-full"
          style="background-color: var(--kv-accent-subtle); color: var(--kv-accent-500); line-height: 1.5; font-variant-numeric: tabular-nums;"
          :title="t('dm.voiceActive', { n: voiceCount(ch) })"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
          {{ voiceCount(ch) }}
        </span>
      </button>

      <!-- ⋯ menü butonu. Dokunmatikte hover yok → <768'de kalıcı görünür (sözleşme §5).
           Görünürlük Tailwind `max-md:` varyantıyla değil composable ile kuruluyor:
           varyant sırasına güvenmek gerekmesin. -->
      <button
        class="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-opacity hover:bg-[var(--kv-bg-rail)]"
        :class="menuChannel?.id === ch.id || isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
        style="width: 24px; height: 24px; color: var(--kv-text-muted);"
        :title="t('dm.menuTitle')"
        :aria-label="t('dm.menuTitle')"
        @click.stop="onDotsClick($event, ch)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="5" r="1" fill="currentColor"/>
          <circle cx="12" cy="12" r="1" fill="currentColor"/>
          <circle cx="12" cy="19" r="1" fill="currentColor"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- DM menüsü — paylaşılan kabuk (öğe sırası sözleşme §3.1/§3.2 ile bağlayıcı) -->
  <ContextMenuShell
    v-if="menuChannel"
    :x="menuX"
    :y="menuY"
    menu-id="dm-row"
    @close="closeMenu"
  >
    <!-- 1. Profil (yalnız 1-1) -->
    <button v-if="menuDm" class="kv-ctx__item" role="menuitem" @click="openProfile">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <span>{{ t('member.actions.profile') }}</span>
    </button>

    <!-- 2. Kanka Ekle (yalnız 1-1 ve kanka değilse) -->
    <button v-if="menuDm && canAddFriend" class="kv-ctx__item" role="menuitem" @click="doAddFriend">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
      <span>{{ t('friends.add') }}</span>
    </button>

    <!-- 2b. Üye Ekle (yalnız grup DM — İş 2, panelden taşındı) -->
    <button v-if="menuGroup" class="kv-ctx__item" role="menuitem" @click="openAddMember">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
      <span>{{ t('group.addMember') }}</span>
    </button>

    <!-- 2c. Düzenle (yalnız grup DM — Sprint R18: `GroupManagePanel.vue`i açar, mantık orada
         kalıyor, ikinci kopya yok) -->
    <button v-if="menuGroup" class="kv-ctx__item" role="menuitem" @click="openGroupSettings">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      <span>{{ t('group.editGroup') }}</span>
    </button>

    <!-- 3. Okunmuş Olarak İşaretle -->
    <button class="kv-ctx__item" role="menuitem" @click="doMarkRead">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M20 6 9 17l-5-5"/></svg>
      <span>{{ t('guildMenu.markRead') }}</span>
    </button>

    <!-- 4. Sustur / Susturmayı Kaldır (hedef: CHANNEL + DM kanal id) -->
    <MuteDurationFlyout
      :muted="isDmMuted"
      :muted-until="dmMutedUntil"
      :label="t('dm.mute')"
      :unmute-label="t('dm.unmute')"
      @mute="muteDmFor"
      @unmute="unmuteDm"
    />

    <!-- 5. Bildirim Ayarları -->
    <NotifLevelFlyout :level="dmLevel" @select="setDmLevel" />

    <div class="kv-ctx__divider" />

    <!-- 6. Sohbeti Temizle -->
    <button class="kv-ctx__item" role="menuitem" @click="askClear">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
      <span>{{ t('dm.clearConversation') }}</span>
    </button>

    <!-- 7. Şikâyet Et (yalnız 1-1; hedef tek kullanıcı) -->
    <button v-if="menuDm" class="kv-ctx__item kv-ctx__item--danger" role="menuitem" @click="openReport">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
      <span>{{ t('report.reportUser') }}</span>
    </button>

    <!-- 7b. Gruptan Ayrıl (yalnız grup DM, danger — İş 2, panelden taşındı) -->
    <button v-if="menuGroup" class="kv-ctx__item kv-ctx__item--danger" role="menuitem" @click="askLeaveGroup">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      <span>{{ t('group.leaveGroup') }}</span>
    </button>

    <!-- 7c. Grubu Sil (yalnız SAHİP, en altta ayrı bir ayırıcıyla — Sprint R18 §3: geri
         alınamaz ve yalnız kendini değil tüm üyeleri etkiler, en yıkıcı aksiyon) -->
    <template v-if="canDeleteGroup">
      <div class="kv-ctx__divider" />
      <button class="kv-ctx__item kv-ctx__item--danger" role="menuitem" @click="askDeleteGroup">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        <span>{{ t('group.deleteGroup') }}</span>
      </button>
    </template>
  </ContextMenuShell>

  <!-- Sohbeti temizle onayı (mevcut metin/akış) -->
  <ConfirmDialog
    v-if="clearTarget"
    :message="t('dm.clearConfirmMsg')"
    :confirm-label="t('dm.clearButton')"
    :loading="clearing"
    @confirm="confirmClear"
    @cancel="clearTarget = null"
  />

  <!-- Şikâyet modalı (kullanıcı) -->
  <ReportModal
    v-if="reportUserId"
    target-type="USER"
    :target-id="reportUserId"
    @close="reportUserId = null"
  />

  <!-- Tam profil modalı -->
  <FullProfileModal
    v-if="profileCard"
    :card="profileCard"
    @close="profileCard = null"
    @open-dm="(id: string) => { profileCard = null; emit('select', id) }"
  />

  <!-- Grup: üye ekle mini-modal (İş 2 — GroupManagePanel'den taşındı, aynı akış/görünüm) -->
  <div
    v-if="addMemberTarget"
    class="fixed inset-0 z-50 flex items-center justify-center"
    style="background-color: rgba(0,0,0,0.5);"
    @click.self="closeAddMember"
  >
    <div
      class="w-[360px] max-h-[60vh] flex flex-col rounded-[var(--kv-radius-lg)] overflow-hidden"
      style="background-color: var(--kv-bg-sidebar);"
    >
      <div class="flex items-center justify-between px-4 py-3 border-b shrink-0" style="border-color: var(--kv-border-subtle);">
        <h3 class="text-[15px] font-semibold" style="color: var(--kv-text-primary);">
          {{ t('group.addMemberTitle') }}
        </h3>
        <button class="text-[18px] cursor-pointer hover:opacity-70" style="color: var(--kv-text-muted);" @click="closeAddMember">✕</button>
      </div>
      <div class="flex-1 overflow-y-auto px-3 py-2">
        <p v-if="!addableFriends.length" class="text-[13px] px-2 py-3" style="color: var(--kv-text-muted);">
          {{ t('group.noFriends') }}
        </p>
        <button
          v-for="f in addableFriends"
          :key="f.user.id"
          class="w-full flex items-center gap-3 px-2 py-2 rounded-[var(--kv-radius-md)] cursor-pointer transition-colors text-left"
          :class="addingMemberId === f.user.id ? 'opacity-50 pointer-events-none' : ''"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'transparent'"
          @click="doAddGroupMember(f.user.id)"
        >
          <div
            class="w-7 h-7 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-semibold text-white"
            style="background-color: var(--kv-accent-500);"
          >
            <img v-if="f.user.avatarUrl" :src="f.user.avatarUrl" :alt="f.user.username" class="w-full h-full object-cover" />
            <span v-else>{{ f.user.username[0].toUpperCase() }}</span>
          </div>
          <span class="text-[14px] truncate" style="color: var(--kv-text-primary);">{{ f.user.username }}</span>
        </button>
        <p v-if="addMemberError" class="text-[13px] px-2 mt-1" style="color: var(--kv-danger);">{{ addMemberError }}</p>
      </div>
    </div>
  </div>

  <!-- Grup: gruptan ayrıl onayı (İş 2 — GroupManagePanel'den taşındı, aynı metin/akış) -->
  <ConfirmDialog
    v-if="leaveGroupTarget"
    :message="t('group.leaveConfirm')"
    :confirm-label="t('group.leaveAction')"
    :loading="leavingGroup"
    @confirm="confirmLeaveGroup"
    @cancel="leaveGroupTarget = null"
  />

  <!-- Grup: grubu sil onayı (Sprint R18 — GroupManagePanel'deki metin/akışın aynısı, DM
       satırı menüsünden taşındı; yalnız owner tetikleyebilir) -->
  <ConfirmDialog
    v-if="deleteGroupTarget"
    :message="t('group.deleteConfirm')"
    :confirm-label="t('group.deleteAction')"
    :loading="deletingGroupDm"
    @confirm="confirmDeleteGroup"
    @cancel="deleteGroupTarget = null"
  />
</template>
