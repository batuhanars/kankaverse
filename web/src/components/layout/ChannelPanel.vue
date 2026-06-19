<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useAuthStore } from '@/stores/auth'
import { useVoiceStore } from '@/stores/voice'
import { useRolesStore } from '@/stores/roles'
import { useMembersStore } from '@/stores/members'
import { useEventsStore } from '@/stores/events'
import { useToastStore } from '@/stores/toast'
import { useGuildPermissions } from '@/composables/useGuildPermissions'
import { useGuildMenuActions } from '@/composables/useGuildMenuActions'
import { useMenuCoordinator } from '@/composables/useMenuCoordinator'
import { useGuildQuickAction } from '@/composables/useGuildQuickAction'
import { useChannelMenuActions } from '@/composables/useChannelMenuActions'
import { useNotificationPrefsStore } from '@/stores/notificationPrefs'
import { guildsApi } from '@/api/guilds'
import { channelsApi } from '@/api/channels'
import { NotificationLevel, NotifTargetType } from '@/types'
import NotifLevelFlyout from '@/components/shared/NotifLevelFlyout.vue'
import MuteDurationFlyout from '@/components/shared/MuteDurationFlyout.vue'
import GuildSettingsView from '@/views/app/components/GuildSettingsView.vue'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'
import KvInput from '@/components/ui/KvInput.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import VoiceParticipantList from '@/components/shared/VoiceParticipantList.vue'
import EventsModal from '@/views/app/components/EventsModal.vue'
import CreateEventWizard from '@/views/app/components/CreateEventWizard.vue'
import InvitePeopleModal from '@/components/layout/InvitePeopleModal.vue'
import type { ChannelDto, CategoryDto, ChannelMemberDto, GuildMemberDto } from '@/types'

const { t } = useI18n()
const router = useRouter()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const authStore = useAuthStore()
const voiceStore = useVoiceStore()
const rolesStore = useRolesStore()
const membersStore = useMembersStore()
const eventsStore = useEventsStore()
const toastStore = useToastStore()
const prefsStore = useNotificationPrefsStore()

// ── İş A: kanal okunmamış göstergelerini bildirim tercihine göre filtrele ──
// GÖSTERİM katmanı — okunmamış HESABINI bozmaz; yalnız badge/dim görünürlüğü.
// Efektif değer kanal pref'i yoksa guild'e düşer (effectiveLevel + isMuted GUILD fallback).
//   muted veya NONE  → genel okunmamış + mention rozeti İKİSİ de gizli (kanal sönük)
//   MENTIONS         → genel okunmamış gizli, mention rozeti kalır
//   ALL (varsayılan) → mevcut davranış
function channelMuted(channel: ChannelDto): boolean {
  return (
    prefsStore.isMuted(NotifTargetType.CHANNEL, channel.id) ||
    (channel.guildId ? prefsStore.isMuted(NotifTargetType.GUILD, channel.guildId) : false)
  )
}
function channelLevelFor(channel: ChannelDto): string {
  return prefsStore.effectiveLevel(
    NotifTargetType.CHANNEL,
    channel.id,
    channel.guildId ?? undefined,
  )
}
/** Genel okunmamış göstergesi (sayaç + kalın ad) — muted/NONE/MENTIONS gizler */
function channelShowGenericUnread(channel: ChannelDto): boolean {
  if (channel.unreadCount <= 0) return false
  if (channelMuted(channel)) return false
  return channelLevelFor(channel) === NotificationLevel.ALL
}
/** Mention rozeti — muted/NONE gizler; MENTIONS/ALL'da bahsetme varsa gösterir */
function channelShowMention(channel: ChannelDto): boolean {
  if (channel.unreadMentionCount <= 0) return false
  if (channelMuted(channel)) return false
  return channelLevelFor(channel) !== NotificationLevel.NONE
}
/** Kanal satırında okunmamış göstergesi (badge/kalın ad) görünür mü? */
function channelHasVisibleUnread(channel: ChannelDto): boolean {
  return channelShowGenericUnread(channel) || channelShowMention(channel)
}
/** Sönük (muted/NONE → okunmamışken bile vurgusuz) — hafif opaklık */
function channelDimmed(channel: ChannelDto): boolean {
  return channel.unreadCount > 0 && !channelHasVisibleUnread(channel)
}

const showSettings = ref(false)
// R12: Ayarlar-dışı hızlı "Üye Davet Et" modalı (CREATE_INVITE ile gated)
const showInvitePeople = ref(false)

// Efektif izin (UX gating) — backend otorite kalır.
const { can, canOpenSettings } = useGuildPermissions(() => guildsStore.activeGuildId ?? '')

// Kategori + kanal yönetimi → MANAGE_CHANNELS (owner / enum-admin / ADMINISTRATOR dahil).
// İsim "isAdmin" geriye-uyum için korunur; tüm kanal-yönetimi ref'leri buradan beslenir.
const isAdmin = computed(() => can('MANAGE_CHANNELS'))

// Sprint V3 — Etkinlik yönetimi izni (oluştur/düzenle/sil). Listeleme/ilgi her üyeye açık.
const canManageEvents = computed(() => can('MANAGE_EVENTS'))

// Ortam ayarları (ad, ikon, vb.): yalnız OWNER (önceki davranış korunur)
const isOwner = computed(() => {
  const guild = guildsStore.activeGuild()
  if (!guild || !authStore.user) return false
  return guild.ownerId === authStore.user.id
})

// ── Katlama state (localStorage) ──
function collapseKey(guildId: string, categoryId: string) {
  return `kv:cat-collapsed:${guildId}:${categoryId}`
}

function isCategoryCollapsed(guildId: string, categoryId: string): boolean {
  return localStorage.getItem(collapseKey(guildId, categoryId)) === '1'
}

function toggleCollapse(guildId: string, categoryId: string) {
  const key = collapseKey(guildId, categoryId)
  if (localStorage.getItem(key) === '1') {
    localStorage.removeItem(key)
  } else {
    localStorage.setItem(key, '1')
  }
  // Reaktiflik için sayacı tetikle
  collapseToggleTick.value++
}

// localStorage reaktif değil — toggle sonrası computed yeniden hesaplanması için tick
const collapseToggleTick = ref(0)

// ── Gruplanmış kanal listesi ──
const activeGuildId = computed(() => guildsStore.activeGuildId ?? '')

const uncategorizedChannels = computed(() => {
  void collapseToggleTick.value
  return channelsStore.channelsForGuild(activeGuildId.value)
    .filter((c) => !c.categoryId)
    .sort((a, b) => a.position - b.position)
})

const sortedCategories = computed(() => {
  return channelsStore.categoriesForGuild(activeGuildId.value)
    .slice()
    .sort((a, b) => a.position - b.position)
})

function channelsForCategory(categoryId: string): ChannelDto[] {
  return channelsStore.channelsForGuild(activeGuildId.value)
    .filter((c) => c.categoryId === categoryId)
    .sort((a, b) => a.position - b.position)
}

function categoryIsCollapsed(categoryId: string): boolean {
  void collapseToggleTick.value
  return isCategoryCollapsed(activeGuildId.value, categoryId)
}

// ── REV-4: Bahsetme bandı — okunmamış bahsetmesi olan kanallar arası zıplama döngüsü ──
// Bant tıklandıkça sıradaki bahsetme kanalına sidebar'da KAYAR + vurgular; kanalın
// İÇİNE GİRMEZ (kullanıcı manuel tıklar). Hepsi okununca bant kaybolur.
const mentionChannels = computed(() => channelsStore.channelsWithMentions(activeGuildId.value))
const totalMentions = computed(() => channelsStore.totalMentionsForGuild(activeGuildId.value))
const highlightedChannelId = ref<string | null>(null)
let mentionCycleIndex = 0

function jumpToNextMention() {
  const list = mentionChannels.value
  if (!list.length) return
  if (mentionCycleIndex >= list.length) mentionCycleIndex = 0
  const target = list[mentionCycleIndex]
  mentionCycleIndex++
  // Katlanmış kategorideyse aç (kanal DOM'da görünür olsun)
  if (target.categoryId && isCategoryCollapsed(activeGuildId.value, target.categoryId)) {
    toggleCollapse(activeGuildId.value, target.categoryId)
  }
  highlightedChannelId.value = target.id
  nextTick(() => {
    document
      .querySelector(`[data-channel-row="${target.id}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
}

// Ortam değişince döngü + vurgu sıfırlanır
watch(activeGuildId, () => {
  mentionCycleIndex = 0
  highlightedChannelId.value = null
})

// Efektif izin çözümü için roller + üyeler yüklü olmalı (granular yetki UI gating).
// OWNER/enum-ADMIN yolu bunlar olmadan da çalışır; granular roller için gerekir.
watch(
  activeGuildId,
  (id) => {
    if (!id) return
    rolesStore.fetchRoles(id).catch(() => {})
    membersStore.fetchMembers(id).catch(() => {})
    eventsStore.fetchEvents(id).catch(() => {})
  },
  { immediate: true },
)

// ── Etkinlikler (Sprint V3) ──
const showEventsModal = ref(false)
const showCreateEventWizard = ref(false)
const eventCount = computed(() => eventsStore.countFor(activeGuildId.value))

// ── Deep-link: ?event=<id> → etkinlik modalını aç + kartı vurgula (Motor §6) ──
// MVP'de paylaş linki kopyalanıyordu ama açılmıyordu — bu açık kalemi kapatır.
// Aktif guild yeterli: link aynı ortamda paylaşılıyor, kart vurgusu modalda yapılır.
const highlightEventId = ref<string | null>(null)
onMounted(() => {
  const raw = router.currentRoute.value.query.event
  const eventId = Array.isArray(raw) ? raw[0] : raw
  if (!eventId) return
  highlightEventId.value = eventId
  showEventsModal.value = true
  // Query'yi tüket — geri/yenile derin linki tekrar tetiklemesin.
  const { event: _consumed, ...rest } = router.currentRoute.value.query
  router.replace({ query: rest }).catch(() => {})
})

// REV-13b: ses kanalı aktif-süresi (sidebar, yeşil) — saniyede bir tik
const voiceNow = ref(Date.now())
let voiceTick: ReturnType<typeof setInterval> | null = null
onMounted(() => { voiceTick = setInterval(() => { voiceNow.value = Date.now() }, 1000) })
onUnmounted(() => { if (voiceTick) clearInterval(voiceTick) })

function voiceDuration(channelId: string): string {
  const startedAt = voiceStore.startedAtFor(channelId)
  if (!startedAt) return ''
  const sec = Math.max(0, Math.floor((voiceNow.value - startedAt) / 1000))
  const h = Math.floor(sec / 3600)
  const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
  const ss = String(sec % 60).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// Ses kanalındaki canlı kişi sayısı — bağlı kanalda LiveKit odası (güvenilir),
// diğerlerinde WS-beslemeli panel listesi. "00 / limit" rozeti için.
function voiceCount(channelId: string): number {
  if (voiceStore.connectedChannelId === channelId) return voiceStore.roomParticipants.length
  return voiceStore.participantsFor(channelId).length
}

// ── Drag-reorder (native HTML5 DnD; yalnız OWNER/ADMIN) ──
const dragChannelId = ref<string | null>(null)
const dragCategoryId = ref<string | null>(null)
const dragOverChannelId = ref<string | null>(null)
const dragOverCategoryId = ref<string | null>(null)

function onChannelDragStart(e: DragEvent, channel: ChannelDto) {
  if (!isAdmin.value) return
  dragChannelId.value = channel.id
  dragCategoryId.value = null
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onCategoryDragStart(e: DragEvent, cat: CategoryDto) {
  if (!isAdmin.value) return
  dragCategoryId.value = cat.id
  dragChannelId.value = null
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDragEnd() {
  dragChannelId.value = null
  dragCategoryId.value = null
  dragOverChannelId.value = null
  dragOverCategoryId.value = null
}

// Bir grubun (kategori veya kategorisiz) kanalları, position sırasında
function groupChannels(categoryId: string | null): ChannelDto[] {
  return channelsStore.channelsForGuild(activeGuildId.value)
    .filter((c) => (c.categoryId ?? null) === categoryId)
    .sort((a, b) => a.position - b.position)
}

async function dropChannelInto(targetCategoryId: string | null, beforeChannelId: string | null) {
  const draggedId = dragChannelId.value
  onDragEnd()
  if (!draggedId || !isAdmin.value) return
  const dragged = channelsStore.channelsForGuild(activeGuildId.value).find((c) => c.id === draggedId)
  if (!dragged || draggedId === beforeChannelId) return

  const group = groupChannels(targetCategoryId).filter((c) => c.id !== draggedId)
  let insertIdx = group.length
  if (beforeChannelId) {
    const i = group.findIndex((c) => c.id === beforeChannelId)
    if (i !== -1) insertIdx = i
  }
  group.splice(insertIdx, 0, dragged)
  const items = group.map((c, idx) => ({ id: c.id, position: idx, categoryId: targetCategoryId }))

  channelsStore.applyChannelReorder(activeGuildId.value, items) // optimistik
  try {
    await guildsApi.reorderChannels(activeGuildId.value, items)
  } catch {
    await channelsStore.fetchChannels(activeGuildId.value) // hata → sunucudan tazele
  }
}

async function dropCategoryBefore(beforeCategoryId: string | null) {
  const draggedId = dragCategoryId.value
  onDragEnd()
  if (!draggedId || !isAdmin.value) return
  const all = channelsStore.categoriesForGuild(activeGuildId.value).slice().sort((a, b) => a.position - b.position)
  const dragged = all.find((c) => c.id === draggedId)
  if (!dragged || draggedId === beforeCategoryId) return
  const rest = all.filter((c) => c.id !== draggedId)
  let idx = rest.length
  if (beforeCategoryId) {
    const i = rest.findIndex((c) => c.id === beforeCategoryId)
    if (i !== -1) idx = i
  }
  rest.splice(idx, 0, dragged)
  const items = rest.map((c, i) => ({ id: c.id, position: i }))

  channelsStore.applyCategoryReorder(activeGuildId.value, items) // optimistik
  try {
    await guildsApi.reorderCategories(activeGuildId.value, items)
  } catch {
    await channelsStore.fetchChannelsAndCategories(activeGuildId.value, authStore.user?.id)
  }
}

// Kategori başlığına bırak: kanal sürükleniyorsa o kategoriye taşı (sona); kategori ise sırala
function onCategoryHeaderDrop(cat: CategoryDto) {
  if (dragChannelId.value) dropChannelInto(cat.id, null)
  else if (dragCategoryId.value) dropCategoryBefore(cat.id)
}

// ── Kanal seçme ──
function selectChannel(channel: ChannelDto) {
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  // item 6: kilitli özel kanal → görünür ama giriş yok. Yetkili içerideyse seni
  // ekleyebilir; o zaman locked=false olur (channel.updated ile anında açılır).
  if (channel.locked) {
    toastStore.info(t('channel.lockedToast'))
    return
  }
  // Yaş-kapılı kanal + minör → giriş yok, sakin/dürüst mesaj (backend de otoriter engeller).
  if (channel.ageGated && authStore.user?.isMinor) {
    toastStore.info(t('channel.ageRestrictedToast'))
    return
  }
  // Ses kanalı: oturuma katıl + kanalı aktif yap (merkez VoiceRoomView'a geçer)
  if (channel.type === 'GUILD_VOICE') {
    voiceStore.join(channel.id)
  }
  router.push({ name: 'channel', params: { guildId, channelId: channel.id } })
}

// ── Kanal oluştur ──
const showCreate = ref(false)
const createName = ref('')
const createType = ref<'GUILD_TEXT' | 'GUILD_VOICE'>('GUILD_TEXT')
const createAgeGated = ref(false)
const createIsPrivate = ref(false)
const createCategoryId = ref<string | null>(null)
const creating = ref(false)
const createError = ref('')

function openCreate(categoryId?: string | null) {
  createName.value = ''
  createType.value = 'GUILD_TEXT'
  createAgeGated.value = false
  createIsPrivate.value = false
  createCategoryId.value = categoryId ?? null
  createError.value = ''
  showCreate.value = true
}

async function submitCreate() {
  const name = createName.value.trim()
  if (!name) return
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  creating.value = true
  createError.value = ''
  try {
    await channelsStore.createChannel(guildId, {
      name,
      type: createType.value,
      ageGated: createAgeGated.value,
      isPrivate: createIsPrivate.value,
      categoryId: createCategoryId.value,
    })
    showCreate.value = false
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    createError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    creating.value = false
  }
}

// ── Kanal ayarları (yeniden adlandır + yavaş mod + kullanıcı limiti) ──
// Kategori taşıma sürükle-bırakla yapılır → settings modalında kategori select yok.
const settingsTarget = ref<ChannelDto | null>(null)
const settingsName = ref('')
const settingsAgeGated = ref(false)
const settingsSlowMode = ref(0)
const settingsUserLimit = ref<number | null>(0) // R10 — ses kanalı kullanıcı limiti (0 = sınırsız)
const settingsBitrate = ref(64) // R10 — ses kanalı bit hızı (kbps, 8–96)
const settingsSaving = ref(false)
const settingsError = ref('')

const SLOW_MODE_OPTIONS = [
  { label: t('channel.slowModeOff'), value: 0 },
  { label: t('channel.slowMode5s'), value: 5 },
  { label: t('channel.slowMode10s'), value: 10 },
  { label: t('channel.slowMode30s'), value: 30 },
  { label: t('channel.slowMode1m'), value: 60 },
  { label: t('channel.slowMode5m'), value: 300 },
  { label: t('channel.slowMode15m'), value: 900 },
]

function openSettings(channel: ChannelDto) {
  settingsTarget.value = channel
  settingsName.value = channel.name ?? ''
  settingsAgeGated.value = channel.ageGated ?? false
  settingsSlowMode.value = channel.slowModeSeconds ?? 0
  settingsUserLimit.value = channel.userLimit ?? 0
  settingsBitrate.value = channel.bitrate ?? 64
  settingsError.value = ''
  // Özel kanal ise üye listesini ve guild üyelerini çek
  if (channel.isPrivate) {
    fetchChannelMembers(channel.id)
    fetchGuildMembersForPicker()
  }
}

// ── Özel kanal üye yönetimi ──

const channelMembers = ref<ChannelMemberDto[]>([])
const membersLoading = ref(false)
const membersError = ref('')

const guildMembersAll = ref<GuildMemberDto[]>([])
const memberSearchQuery = ref('')
const addMemberLoading = ref(false)
const addMemberError = ref('')

async function fetchChannelMembers(channelId: string) {
  membersLoading.value = true
  membersError.value = ''
  try {
    const res = await channelsApi.getMembers(channelId)
    channelMembers.value = res.data
  } catch {
    channelMembers.value = []
  } finally {
    membersLoading.value = false
  }
}

async function fetchGuildMembersForPicker() {
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  try {
    const res = await guildsApi.getMembers(guildId)
    guildMembersAll.value = res.data
  } catch {
    guildMembersAll.value = []
  }
}

// Guild üyeleri arasından henüz ekli olmayanlar (OWNER/ADMIN zaten erişir — göstermek opsiyonel ama ekleyemeyiz)
const eligibleToAdd = computed(() => {
  const channel = settingsTarget.value
  if (!channel) return []
  const addedIds = new Set(channelMembers.value.map((m) => m.id))
  const query = memberSearchQuery.value.toLowerCase().trim()
  return guildMembersAll.value.filter((m) => {
    // Zaten ekli mi?
    if (addedIds.has(m.userId)) return false
    // Yaş-kapılı kanalda minör gösterme
    if (channel.ageGated && (m as GuildMemberDto & { isMinor?: boolean }).isMinor) return false
    // Arama filtresi
    if (query && !m.username.toLowerCase().includes(query)) return false
    return true
  })
})

async function addChannelMember(userId: string) {
  const target = settingsTarget.value
  if (!target) return
  addMemberLoading.value = true
  addMemberError.value = ''
  try {
    await channelsApi.addMember(target.id, userId)
    await fetchChannelMembers(target.id)
    memberSearchQuery.value = ''
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    const code = err.response?.data?.error
    addMemberError.value = code && ['NOT_PRIVATE_CHANNEL', 'NOT_GUILD_MEMBER', 'AGE_RESTRICTED', 'FORBIDDEN'].includes(code)
      ? t(`channel.members.errors.${code}`)
      : (err.response?.data?.message ?? t('common.error'))
  } finally {
    addMemberLoading.value = false
  }
}

async function removeChannelMember(userId: string) {
  const target = settingsTarget.value
  if (!target) return
  try {
    await channelsApi.removeMember(target.id, userId)
    await fetchChannelMembers(target.id)
  } catch {
    // sessiz — liste zaten güncel kalır
  }
}

// Ayarlar kapanınca üye state'ini temizle
watch(
  () => settingsTarget.value,
  (val) => {
    if (!val) {
      channelMembers.value = []
      guildMembersAll.value = []
      memberSearchQuery.value = ''
      addMemberError.value = ''
      membersError.value = ''
    }
  },
)

async function submitSettings() {
  const target = settingsTarget.value
  if (!target) return
  const name = settingsName.value.trim()
  if (!name) return
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  settingsSaving.value = true
  settingsError.value = ''
  try {
    const payload: { name?: string; ageGated?: boolean; slowModeSeconds?: number; userLimit?: number; bitrate?: number } = {}
    if (name !== target.name) payload.name = name
    if (settingsAgeGated.value !== (target.ageGated ?? false)) payload.ageGated = settingsAgeGated.value
    if (settingsSlowMode.value !== (target.slowModeSeconds ?? 0)) payload.slowModeSeconds = settingsSlowMode.value
    // R10 — ses kanalı kullanıcı limiti + bit hızı (yalnız GUILD_VOICE)
    if (target.type === 'GUILD_VOICE') {
      const limit = Math.min(99, Math.max(0, Math.floor(settingsUserLimit.value || 0)))
      if (limit !== (target.userLimit ?? 0)) payload.userLimit = limit
      const bitrate = Math.min(96, Math.max(8, Math.floor(settingsBitrate.value || 64)))
      if (bitrate !== (target.bitrate ?? 64)) payload.bitrate = bitrate
    }
    if (Object.keys(payload).length > 0) {
      await channelsStore.updateChannel(target.id, guildId, payload)
    }
    settingsTarget.value = null
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    settingsError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    settingsSaving.value = false
  }
}

// ── Kanal sil ──
const deleteTarget = ref<ChannelDto | null>(null)
const deleting = ref(false)
const deleteError = ref('')

function openDelete(channel: ChannelDto) {
  deleteTarget.value = channel
  deleteError.value = ''
}

// Düzenleme modalından sil → ayarlar kapanır, silme onayı açılır (her yerden sil)
function deleteFromSettings() {
  const ch = settingsTarget.value
  settingsTarget.value = null
  if (ch) openDelete(ch)
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  deleting.value = true
  deleteError.value = ''
  try {
    await channelsStore.deleteChannel(target.id, guildId)
    deleteTarget.value = null
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    const code = err.response?.data?.error
    deleteError.value = code === 'LAST_CHANNEL'
      ? t('channel.errors.LAST_CHANNEL')
      : (err.response?.data?.message ?? t('common.error'))
  } finally {
    deleting.value = false
  }
}

// ── Kategori oluştur ──
const showCreateCategory = ref(false)
const createCategoryName = ref('')
const creatingCategory = ref(false)
const createCategoryError = ref('')

function openCreateCategory() {
  createCategoryName.value = ''
  createCategoryError.value = ''
  showCreateCategory.value = true
}

// ServerRail sağ-tık menüsünden gelen hızlı-aksiyonlar (Kanal/Kategori/Etkinlik oluştur):
// hedef ortama geçince burada tüketilip ilgili modal açılır.
const { pending: quickActionPending, consume: consumeQuickAction } = useGuildQuickAction()
watch(
  [quickActionPending, activeGuildId],
  () => {
    if (!quickActionPending.value) return
    const action = consumeQuickAction(activeGuildId.value)
    if (action === 'create-channel') openCreate(null)
    else if (action === 'create-category') openCreateCategory()
    else if (action === 'create-event') showCreateEventWizard.value = true
  },
  { immediate: true, flush: 'post' },
)

async function submitCreateCategory() {
  const name = createCategoryName.value.trim()
  if (!name) return
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  creatingCategory.value = true
  createCategoryError.value = ''
  try {
    await channelsStore.createCategory(guildId, name)
    showCreateCategory.value = false
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    createCategoryError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    creatingCategory.value = false
  }
}

// ── Kategori yeniden adlandır ──
const renameTarget = ref<CategoryDto | null>(null)
const renameName = ref('')
const renaming = ref(false)
const renameError = ref('')

function openRenameCategory(cat: CategoryDto) {
  renameTarget.value = cat
  renameName.value = cat.name
  renameError.value = ''
}

async function submitRenameCategory() {
  const target = renameTarget.value
  if (!target) return
  const name = renameName.value.trim()
  if (!name) return
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  renaming.value = true
  renameError.value = ''
  try {
    await channelsStore.renameCategory(target.id, guildId, name)
    renameTarget.value = null
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    renameError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    renaming.value = false
  }
}

// ── Kategori sil ──
const deleteCategoryTarget = ref<CategoryDto | null>(null)
const deletingCategory = ref(false)
const deleteCategoryError = ref('')

function openDeleteCategory(cat: CategoryDto) {
  deleteCategoryTarget.value = cat
  deleteCategoryError.value = ''
}

async function confirmDeleteCategory() {
  const target = deleteCategoryTarget.value
  if (!target) return
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  deletingCategory.value = true
  deleteCategoryError.value = ''
  try {
    await channelsStore.deleteCategory(target.id, guildId)
    deleteCategoryTarget.value = null
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    deleteCategoryError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    deletingCategory.value = false
  }
}

// Kategori menüsü görünürlüğü
const openCategoryMenuId = ref<string | null>(null)

function toggleCategoryMenu(categoryId: string) {
  openCategoryMenuId.value = openCategoryMenuId.value === categoryId ? null : categoryId
}

function closeCategoryMenu() {
  openCategoryMenuId.value = null
}

// ── Ortam menüsü (başlık tek-buton → Discord-tarzı dropdown) ──
// Menü koordinatörü: aynı anda tek menü (Görsel #14 — rail menüsüyle üst üste binmesin)
const { openExclusive, releaseIfOwner, closeOnOther } = useMenuCoordinator()
const showGuildMenu = ref(false)
function toggleGuildMenu() {
  showGuildMenu.value = !showGuildMenu.value
  if (showGuildMenu.value) openExclusive('cp-guild')
  else releaseIfOwner('cp-guild')
}
function closeGuildMenu() {
  showGuildMenu.value = false
  releaseIfOwner('cp-guild')
}
closeOnOther('cp-guild', () => { showGuildMenu.value = false })
closeOnOther('cp-channel', () => { contextChannel.value = null })

// ── Ortam menü aksiyonları (ServerRail ile paylaşılan composable) ──
const {
  markGuildRead,
  isGuildMuted,
  guildMutedUntil,
  muteGuildFor,
  unmuteGuild,
  guildLevel,
  setGuildLevel,
  copyGuildId,
} = useGuildMenuActions(() => guildsStore.activeGuildId ?? '')

// Okundu işaretle → menüyü kapat (aksiyon arka planda)
function doMarkRead() {
  markGuildRead()
  closeGuildMenu()
}

// ── Ortamdan ayrıl ──
const showLeaveConfirm = ref(false)
const leaving = ref(false)
const leaveError = ref('')
async function doLeave() {
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  leaving.value = true
  leaveError.value = ''
  try {
    await guildsApi.leaveGuild(guildId)
    guildsStore.removeGuildLocal(guildId)
    showLeaveConfirm.value = false
    router.push({ name: 'app' }) // anasayfaya dön
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    leaveError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    leaving.value = false
  }
}

// ── Kanal sağ-tık context menüsü (cursor-konumlu; ServerRail deseni) ──
// contextChannel: hangi kanala sağ-tıklandı (aktif kanal DEĞİL; hedef kanal).
const contextChannel = ref<ChannelDto | null>(null)
const chCtxX = ref(0)
const chCtxY = ref(0)

// Menü panel ölçüleri (kenar-taşma clamp'i)
const CH_CTX_MENU_W = 224
const CH_CTX_MENU_H = 380

const chCtxPosStyle = computed(() => {
  const left = Math.min(chCtxX.value, window.innerWidth - CH_CTX_MENU_W - 8)
  const top = Math.min(chCtxY.value, window.innerHeight - CH_CTX_MENU_H - 8)
  return `top:${Math.max(8, top)}px;left:${Math.max(8, left)}px;`
})

function openChannelContext(event: MouseEvent, channel: ChannelDto) {
  // Bu sağ-tık document'taki kapatıcıya ULAŞMASIN (yoksa açıldığı anda kapanır).
  event.stopPropagation()
  // Tek anda tek menü: guild/kategori menülerini + diğer component menülerini kapat.
  closeGuildMenu()
  closeCategoryMenu()
  openExclusive('cp-channel')
  chCtxX.value = event.clientX
  chCtxY.value = event.clientY
  contextChannel.value = channel
}

function closeChannelContext() {
  contextChannel.value = null
  releaseIfOwner('cp-channel')
}

// Kanal context aksiyonları (paylaşılan composable; hedef = contextChannel)
const {
  markChannelRead,
  isChannelMuted,
  toggleChannelMute,
  channelLevel,
  setChannelLevel,
  copyChannelId,
  copyChannelLink,
} = useChannelMenuActions(() => contextChannel.value)

// Okundu işaretle → menüyü kapat (aksiyon arka planda sürer)
function doChannelMarkRead() {
  markChannelRead()
  closeChannelContext()
}

// Davet et → mevcut hızlı davet modalı
function openChannelInvite() {
  closeChannelContext()
  showInvitePeople.value = true
}

// Düzenle / Sil / Oluştur → mevcut akışlar (snapshot al; menü kapanınca contextChannel sıfırlanır)
function openChannelSettings() {
  const ch = contextChannel.value
  closeChannelContext()
  if (ch) openSettings(ch)
}
function openChannelDelete() {
  const ch = contextChannel.value
  closeChannelContext()
  if (ch) openDelete(ch)
}
function openChannelCreate() {
  const categoryId = contextChannel.value?.categoryId ?? null
  closeChannelContext()
  openCreate(categoryId)
}

// Kopyala aksiyonları → çalıştır + menüyü kapat
function doCopyChannelLink() {
  copyChannelLink()
  closeChannelContext()
}
function doCopyChannelId() {
  copyChannelId()
  closeChannelContext()
}

// Dışarı-tık / Esc / scroll ile kapan (ServerRail deseni)
function onChCtxDocPointer() { closeChannelContext() }
function onChCtxKey(e: KeyboardEvent) { if (e.key === 'Escape') closeChannelContext() }
function onChCtxScroll() { closeChannelContext() }
onMounted(() => {
  document.addEventListener('click', onChCtxDocPointer)
  document.addEventListener('contextmenu', onChCtxDocPointer)
  document.addEventListener('keydown', onChCtxKey)
  window.addEventListener('scroll', onChCtxScroll, true)
})
onUnmounted(() => {
  document.removeEventListener('click', onChCtxDocPointer)
  document.removeEventListener('contextmenu', onChCtxDocPointer)
  document.removeEventListener('keydown', onChCtxKey)
  window.removeEventListener('scroll', onChCtxScroll, true)
})
</script>

<template>
  <!-- F: 4 köşe radius — HomeSidebar ile tutarlı -->
  <aside
    class="flex flex-col shrink-0 rounded-[var(--kv-radius-lg)] overflow-hidden mt-4"
    style="width: var(--kv-panel-width); background-color: var(--kv-bg-sidebar);"
    @click="closeCategoryMenu(); closeGuildMenu()"
  >
    <!-- Ortam adı başlığı — sol: ad + chevron (menü tetikler), sağ: üye davet ikonu -->
    <div class="relative shrink-0 border-b flex items-center px-2 gap-1" style="border-color: var(--kv-border-subtle); height: var(--kv-header-height);">
      <!-- Ad + chevron grubu — tıkla → Discord-tarzı menü -->
      <button
        class="flex-1 min-w-0 flex items-center px-2 gap-1.5 h-9 rounded-[var(--kv-radius-sm)] font-semibold text-[15px] cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
        style="color: var(--kv-text-primary);"
        @click.stop="toggleGuildMenu"
      >
        <span class="truncate text-left">{{ guildsStore.activeGuild()?.name ?? '' }}</span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
          class="shrink-0 transition-transform" :class="showGuildMenu ? 'rotate-180' : ''"
          style="color: var(--kv-text-muted);"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <!-- Üye davet ikon-butonu (en sağ) — mevcut davet modalını açar -->
      <button
        v-if="can('CREATE_INVITE')"
        class="shrink-0 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
        style="width: var(--kv-control-sm); height: var(--kv-control-sm); color: var(--kv-text-muted);"
        :title="t('invitePeople.title')"
        :aria-label="t('invitePeople.title')"
        @click.stop="showInvitePeople = true"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
        </svg>
      </button>

      <!-- Dropdown menü (başlık + ikon satırları) -->
      <div
        v-if="showGuildMenu"
        class="absolute left-2 right-2 top-full mt-1 z-50 rounded-[var(--kv-radius-md)] py-1 border overflow-hidden"
        style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
        @click.stop
      >
        <!-- Okunmuş Olarak İşaretle — herkese -->
        <button
          class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-text-primary);"
          @click="doMarkRead"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);" class="shrink-0"><path d="M20 6 9 17l-5-5"/></svg>
          <span>{{ t('guildMenu.markRead') }}</span>
        </button>

        <div class="my-1 mx-2 border-t" style="border-color: var(--kv-border-subtle);" />

        <!-- Kanal Oluştur (admin) -->
        <button
          v-if="isAdmin"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-text-primary);"
          @click="closeGuildMenu(); openCreate(null)"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);" class="shrink-0"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>{{ t('channel.addUncategorized') }}</span>
        </button>
        <!-- Kategori Oluştur (admin) -->
        <button
          v-if="isAdmin"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-text-primary);"
          @click="closeGuildMenu(); openCreateCategory()"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);" class="shrink-0"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><line x1="17" y1="14" x2="17" y2="20"/><line x1="14" y1="17" x2="20" y2="17"/></svg>
          <span>{{ t('category.createCategory') }}</span>
        </button>
        <!-- Etkinlik Oluştur (MANAGE_EVENTS) -->
        <button
          v-if="canManageEvents"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-text-primary);"
          @click="closeGuildMenu(); showCreateEventWizard = true"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);" class="shrink-0"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>{{ t('event.menuCreate') }}</span>
        </button>
        <!-- Üye Davet Et (CREATE_INVITE — @everyone'da var → pratikte herkes) -->
        <button
          v-if="can('CREATE_INVITE')"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-text-primary);"
          @click="closeGuildMenu(); showInvitePeople = true"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);" class="shrink-0"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          <span>{{ t('invitePeople.title') }}</span>
        </button>

        <div class="my-1 mx-2 border-t" style="border-color: var(--kv-border-subtle);" />

        <!-- Sunucuyu Sustur — süre menüsü (Görsel #15) -->
        <MuteDurationFlyout
          :muted="isGuildMuted"
          :muted-until="guildMutedUntil"
          @mute="muteGuildFor"
          @unmute="unmuteGuild"
        />

        <!-- Bildirim Ayarları — yana açılan flyout (NotifLevelFlyout) -->
        <NotifLevelFlyout :level="guildLevel" @select="setGuildLevel" />

        <!-- Ortam Ayarları (settings'te yapabileceği bir şey olan herkes) -->
        <button
          v-if="canOpenSettings"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-text-primary);"
          @click="closeGuildMenu(); showSettings = true"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);" class="shrink-0"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>{{ t('common.settings') }}</span>
        </button>

        <div class="my-1 mx-2 border-t" style="border-color: var(--kv-border-subtle);" />

        <!-- Sunucu ID'sini Kopyala — herkese -->
        <button
          class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-text-primary);"
          @click="copyGuildId"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);" class="shrink-0"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span class="flex-1 min-w-0">{{ t('guildMenu.copyId') }}</span>
          <span class="shrink-0 text-[10px] font-bold px-1.5 rounded-[var(--kv-radius-sm)]" style="background-color: var(--kv-bg-rail); color: var(--kv-text-muted);">{{ t('guildMenu.idBadge') }}</span>
        </button>

        <!-- Ayraç + Ortamdan Ayrıl (OWNER hariç) -->
        <template v-if="!isOwner">
          <div class="my-1 mx-2 border-t" style="border-color: var(--kv-border-subtle);" />
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left cursor-pointer transition-colors"
            style="color: var(--kv-danger);"
            @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'rgba(242,59,75,0.1)'"
            @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = ''"
            @click="closeGuildMenu(); showLeaveConfirm = true"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span>{{ t('guild.leave') }}</span>
          </button>
        </template>
      </div>
    </div>

    <!-- Kanal listesi -->
    <div class="flex-1 overflow-y-auto pt-4 pb-20 px-2">

      <!-- ── (0) Etkinlikler satırı — kanal listesinin üstünde, border ile ayrılmış ── -->
      <button
        type="button"
        class="w-full flex items-center gap-2 py-1.5 px-2 mb-3 pb-3 rounded-[var(--kv-radius-sm)] text-[14px] text-left transition-colors border-b"
        style="border-color: var(--kv-border-subtle); color: var(--kv-text-secondary);"
        @mouseenter="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-primary)'"
        @mouseleave="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-secondary)'"
        @click="showEventsModal = true"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);" class="shrink-0"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span class="flex-1 truncate">{{ t('event.sidebarLabel') }}</span>
        <span
          v-if="eventCount > 0"
          class="shrink-0 text-[11px] font-bold px-1.5 rounded-full"
          style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary); line-height: 1.5;"
        >{{ eventCount > 99 ? '99+' : eventCount }}</span>
      </button>

      <!-- ── (1) Kategorisiz kanallar — en üstte ── -->
      <template v-for="channel in uncategorizedChannels" :key="channel.id">
      <div
        :data-channel-row="channel.id"
        :draggable="isAdmin"
        class="group relative w-full flex items-center gap-2 py-1.5 rounded-[var(--kv-radius-sm)] text-[14px] text-left transition-colors"
        :class="[
          channelsStore.activeChannelId === channel.id
            ? 'bg-[var(--kv-accent-subtle)] text-[var(--kv-text-primary)]'
            : 'text-[var(--kv-text-secondary)] hover:bg-[var(--kv-accent-subtle)] hover:text-[var(--kv-text-primary)]',
          highlightedChannelId === channel.id ? 'kv-mention-highlight' : '',
          dragOverChannelId === channel.id ? 'kv-drop-target' : '',
        ]"
        @dragstart="onChannelDragStart($event, channel)"
        @dragend="onDragEnd"
        @dragover.prevent="dragOverChannelId = channel.id"
        @dragleave="dragOverChannelId === channel.id ? (dragOverChannelId = null) : null"
        @drop="dropChannelInto(channel.categoryId ?? null, channel.id)"
        @contextmenu.prevent="openChannelContext($event, channel)"
      >
        <button
          class="flex-1 flex items-center gap-2 min-w-0 cursor-pointer pl-2 pr-2"
          @click="selectChannel(channel)"
        >
          <!-- C: kanal türü ikonu — ses kanalı hoparlör, metin # -->
          <svg v-if="channel.type === 'GUILD_VOICE'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);" class="shrink-0">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          </svg>
          <span v-else class="text-[16px] font-semibold leading-none" style="color: var(--kv-text-muted);">#</span>
          <span
            class="truncate"
            :class="[
              channel.unreadCount > 0 && channelsStore.activeChannelId !== channel.id
                ? 'font-semibold text-[var(--kv-text-primary)]'
                : '',
            ]"
          >{{ channel.name }}</span>
          <!-- C: isPrivate kilit rozeti -->
          <span
            v-if="channel.isPrivate"
            class="shrink-0"
            :title="t('channel.privateLabel')"
            style="color: var(--kv-text-muted);"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </span>
          <!-- Yaş-kapılı kanal: nötr kilit ikonu (özel kanalla aynı dil); "18+" yazısı yerine tooltip -->
          <span
            v-if="channel.ageGated"
            class="shrink-0"
            :title="t('channel.ageRestrictedLockTitle')"
            style="color: var(--kv-text-muted);"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </span>
          <span
            v-if="channel.slowModeSeconds > 0"
            class="shrink-0"
            :title="t('channel.slowModeLabel')"
            style="color: var(--kv-text-muted);"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </span>
        </button>

        <span
          v-if="channel.type === 'GUILD_VOICE' && channel.userLimit > 0"
          class="shrink-0 text-[11px] font-semibold px-1.5 rounded-full mr-1 group-hover:hidden"
          style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary); line-height: 1.5; font-variant-numeric: tabular-nums;"
          :title="t('channel.voiceCountLabel')"
        >{{ String(voiceCount(channel.id)).padStart(2, '0') }} / {{ channel.userLimit }}</span>

        <span
          v-if="channel.type === 'GUILD_VOICE' && voiceDuration(channel.id)"
          class="shrink-0 text-[11px] font-semibold mr-1.5"
          style="color: var(--kv-online, #3DB46E); font-variant-numeric: tabular-nums;"
        >{{ voiceDuration(channel.id) }}</span>

        <span
          v-if="channel.unreadCount > 0 && channelsStore.activeChannelId !== channel.id"
          class="shrink-0 channel-unread-badge"
        >
          {{ channel.unreadCount > 99 ? '99+' : channel.unreadCount }}
        </span>

        <div
          v-if="isAdmin"
          class="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pr-2"
        >
          <!-- Davet et (solda) -->
          <button
            class="kv-chan-action flex items-center justify-center rounded-[var(--kv-radius-sm)] hover:bg-[var(--kv-bg-elevated)] cursor-pointer transition-colors"
            style="width: var(--kv-control-sm); height: var(--kv-control-sm);"
            :title="t('channel.invite')"
            @click.stop="showInvitePeople = true"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/>
              <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
          </button>
          <!-- Düzenle / dişli (sağda) -->
          <button
            class="kv-chan-action flex items-center justify-center rounded-[var(--kv-radius-sm)] hover:bg-[var(--kv-bg-elevated)] cursor-pointer transition-colors"
            style="width: var(--kv-control-sm); height: var(--kv-control-sm);"
            :title="t('channel.settingsTitle')"
            @click.stop="openSettings(channel)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>
      <!-- Ses kanalı → katılımcı alt-listesi -->
      <VoiceParticipantList v-if="channel.type === 'GUILD_VOICE'" :channel-id="channel.id" :guild-id="channel.guildId ?? ''" />
      </template>

      <!-- ── (2) Kategoriler — position asc; E: başlıklar DB'den gelir ── -->
      <template v-for="cat in sortedCategories" :key="cat.id">
        <!-- Kategori başlığı (sürüklenebilir; kanal/kategori drop hedefi) -->
        <div
          class="group/cat mt-3 mb-0.5 px-1 flex items-center gap-1 transition-colors"
          :class="dragOverCategoryId === cat.id ? 'kv-drop-target' : ''"
          :draggable="isAdmin"
          @dragstart="onCategoryDragStart($event, cat)"
          @dragend="onDragEnd"
          @dragover.prevent="dragOverCategoryId = cat.id"
          @dragleave="dragOverCategoryId === cat.id ? (dragOverCategoryId = null) : null"
          @drop="onCategoryHeaderDrop(cat)"
        >
          <!-- Katla/aç butonu + ad -->
          <button
            class="flex-1 flex items-center gap-1 min-w-0 cursor-pointer"
            :aria-label="categoryIsCollapsed(cat.id) ? cat.name + ' — aç' : cat.name + ' — katla'"
            @click="toggleCollapse(activeGuildId, cat.id)"
          >
            <!-- Ok ikonu -->
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
              :class="categoryIsCollapsed(cat.id) ? '' : 'rotate-90'"
              class="shrink-0 transition-transform"
              style="color: var(--kv-text-muted);"
            >
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span
              class="text-[11px] font-semibold uppercase tracking-widest truncate"
              style="color: var(--kv-text-muted);"
            >{{ cat.name }}</span>
          </button>

          <!-- ADMIN: kategori menü butonu + kanal ekle -->
          <div v-if="isAdmin" class="shrink-0 flex items-center gap-0.5">
            <!-- Bu kategoriye kanal ekle (D: per-kategori "+", categoryId geçirir) -->
            <button
              class="flex items-center justify-center rounded-[var(--kv-radius-sm)] hover:bg-[var(--kv-bg-elevated)] cursor-pointer"
              style="width: var(--kv-control-sm); height: var(--kv-control-sm); color: var(--kv-text-muted);"
              :title="t('category.addChannel')"
              @click.stop="openCreate(cat.id)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>

            <!-- Üç nokta menü -->
            <div class="relative">
              <button
                class="flex items-center justify-center rounded-[var(--kv-radius-sm)] hover:bg-[var(--kv-bg-elevated)] cursor-pointer"
                style="width: var(--kv-control-sm); height: var(--kv-control-sm); color: var(--kv-text-muted);"
                :title="t('common.settings')"
                @click.stop="toggleCategoryMenu(cat.id)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="5" r="1" fill="currentColor"/>
                  <circle cx="12" cy="12" r="1" fill="currentColor"/>
                  <circle cx="12" cy="19" r="1" fill="currentColor"/>
                </svg>
              </button>

              <!-- Menü paneli -->
              <div
                v-if="openCategoryMenuId === cat.id"
                class="absolute right-0 top-full mt-1 z-20 rounded-[var(--kv-radius-md)] border overflow-hidden"
                style="min-width: 148px; background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
                @click.stop
              >
                <button
                  class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                  style="color: var(--kv-text-secondary);"
                  @click="closeCategoryMenu(); openRenameCategory(cat)"
                >
                  {{ t('category.rename') }}
                </button>
                <button
                  class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                  style="color: var(--kv-danger);"
                  @click="closeCategoryMenu(); openDeleteCategory(cat)"
                >
                  {{ t('category.delete') }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Kategorinin kanalları (katlanmışsa gizli) -->
        <template v-if="!categoryIsCollapsed(cat.id)">
          <template v-for="channel in channelsForCategory(cat.id)" :key="channel.id">
          <div
            :data-channel-row="channel.id"
            :draggable="isAdmin"
            class="group relative w-full flex items-center gap-2 py-1.5 rounded-[var(--kv-radius-sm)] text-[14px] text-left transition-colors"
            :class="[
              channelsStore.activeChannelId === channel.id
                ? 'bg-[var(--kv-accent-subtle)] text-[var(--kv-text-primary)]'
                : 'text-[var(--kv-text-secondary)] hover:bg-[var(--kv-accent-subtle)] hover:text-[var(--kv-text-primary)]',
              highlightedChannelId === channel.id ? 'kv-mention-highlight' : '',
              dragOverChannelId === channel.id ? 'kv-drop-target' : '',
            ]"
            @dragstart="onChannelDragStart($event, channel)"
            @dragend="onDragEnd"
            @dragover.prevent="dragOverChannelId = channel.id"
            @dragleave="dragOverChannelId === channel.id ? (dragOverChannelId = null) : null"
            @drop="dropChannelInto(channel.categoryId ?? null, channel.id)"
            @contextmenu.prevent="openChannelContext($event, channel)"
          >
            <button
              class="flex-1 flex items-center gap-2 min-w-0 cursor-pointer pl-4 pr-2"
              @click="selectChannel(channel)"
            >
              <!-- C: kanal türü ikonu — ses kanalı hoparlör, metin # -->
              <svg v-if="channel.type === 'GUILD_VOICE'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);" class="shrink-0">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              </svg>
              <span v-else class="text-[16px] font-semibold leading-none" style="color: var(--kv-text-muted);">#</span>
              <span
                class="truncate"
                :class="[
                  channelHasVisibleUnread(channel) && channelsStore.activeChannelId !== channel.id
                    ? 'font-semibold text-[var(--kv-text-primary)]'
                    : '',
                  channelDimmed(channel) && channelsStore.activeChannelId !== channel.id
                    ? 'opacity-60'
                    : '',
                ]"
              >{{ channel.name }}</span>
              <!-- C: isPrivate kilit rozeti -->
              <span
                v-if="channel.isPrivate"
                class="shrink-0"
                :title="t('channel.privateLabel')"
                style="color: var(--kv-text-muted);"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <!-- Yaş-kapılı kanal: nötr kilit ikonu (özel kanalla aynı dil); "18+" yazısı yerine tooltip -->
              <span
                v-if="channel.ageGated"
                class="shrink-0"
                :title="t('channel.ageRestrictedLockTitle')"
                style="color: var(--kv-text-muted);"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <span
                v-if="channel.slowModeSeconds > 0"
                class="shrink-0"
                :title="t('channel.slowModeLabel')"
                style="color: var(--kv-text-muted);"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </span>
            </button>

            <span
              v-if="channel.type === 'GUILD_VOICE' && voiceDuration(channel.id)"
              class="shrink-0 text-[11px] font-semibold mr-1.5"
              style="color: var(--kv-online, #3DB46E); font-variant-numeric: tabular-nums;"
            >{{ voiceDuration(channel.id) }}</span>

            <span
              v-if="channelHasVisibleUnread(channel) && channelsStore.activeChannelId !== channel.id"
              class="shrink-0 channel-unread-badge"
            >
              {{
                (channelShowGenericUnread(channel) ? channel.unreadCount : channel.unreadMentionCount) > 99
                  ? '99+'
                  : (channelShowGenericUnread(channel) ? channel.unreadCount : channel.unreadMentionCount)
              }}
            </span>

            <div
              v-if="isAdmin"
              class="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pr-2"
            >
              <!-- Davet et (solda) -->
              <button
                class="kv-chan-action flex items-center justify-center rounded-[var(--kv-radius-sm)] hover:bg-[var(--kv-bg-elevated)] cursor-pointer transition-colors"
                style="width: var(--kv-control-sm); height: var(--kv-control-sm);"
                :title="t('channel.invite')"
                @click.stop="showInvitePeople = true"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/>
                  <line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
              </button>
              <!-- Düzenle / dişli (sağda) -->
              <button
                class="kv-chan-action flex items-center justify-center rounded-[var(--kv-radius-sm)] hover:bg-[var(--kv-bg-elevated)] cursor-pointer transition-colors"
                style="width: var(--kv-control-sm); height: var(--kv-control-sm);"
                :title="t('channel.settingsTitle')"
                @click.stop="openSettings(channel)"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
            </div>
          </div>
          <!-- Ses kanalı → katılımcı alt-listesi -->
          <VoiceParticipantList v-if="channel.type === 'GUILD_VOICE'" :channel-id="channel.id" :guild-id="channel.guildId ?? ''" />
          </template>
        </template>
      </template>

      <p
        v-if="!uncategorizedChannels.length && !sortedCategories.length"
        class="px-2 text-[13px]"
        style="color: var(--kv-text-muted);"
      >
        {{ t('channel.noChannels') }}
      </p>
    </div>

    <!-- REV-4: bahsetme bandı — sidebar altında, tam genişlik, kırmızı; tıkla → sıradaki
         bahsetme kanalına zıpla+vurgula (içine girmez). Hepsi okununca kaybolur. -->
    <button
      v-if="totalMentions > 0"
      type="button"
      class="shrink-0 flex items-center gap-2 px-4 py-2.5 text-left transition-opacity cursor-pointer hover:opacity-90"
      style="background-color: var(--kv-danger); color: #ffffff;"
      :title="t('mention.bannerHint')"
      @click="jumpToNextMention"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <span class="flex-1 text-[13px] font-semibold leading-tight">{{ t('mention.banner') }}</span>
      <span class="shrink-0 text-[12px] font-bold px-1.5 rounded-full" style="background-color: rgba(255,255,255,0.25);">
        {{ totalMentions > 99 ? '99+' : totalMentions }}
      </span>
    </button>
  </aside>

  <!-- Ortam Ayarları Tam-Ekran -->
  <GuildSettingsView
    v-if="showSettings && guildsStore.activeGuild()"
    :guild="guildsStore.activeGuild()!"
    :is-owner="isOwner"
    :is-admin="isAdmin"
    @close="showSettings = false"
  />

  <!-- R12: Üye Davet Et modalı (davet linki + kanka listesi) -->
  <InvitePeopleModal
    v-if="showInvitePeople && activeGuildId"
    :guild-id="activeGuildId"
    @close="showInvitePeople = false"
  />

  <!-- Kanal oluştur modalı -->
  <KvModal
    v-if="showCreate"
    :title="t('channel.createTitle')"
    @close="showCreate = false"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submitCreate">
      <KvInput
        v-model="createName"
        :label="t('channel.nameLabel')"
        :placeholder="t('channel.namePlaceholder')"
        :error="createError"
        autofocus
      />

      <!-- C: Kanal türü seçici (yalnız görsel) -->
      <div class="flex flex-col gap-2">
        <p class="text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
          {{ t('channel.channelTypeLabel') }}
        </p>
        <div class="flex gap-2">
          <!-- Metin — seçilebilir -->
          <button
            type="button"
            class="flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-[var(--kv-radius-md)] cursor-pointer transition-colors"
            :class="createType === 'GUILD_TEXT' ? 'border-2' : 'border'"
            :style="createType === 'GUILD_TEXT'
              ? 'border-color: var(--kv-accent-500); background-color: var(--kv-accent-subtle);'
              : 'border-color: var(--kv-border-subtle);'"
            @click="createType = 'GUILD_TEXT'"
          >
            <span class="text-[18px] font-bold leading-none" :style="{ color: createType === 'GUILD_TEXT' ? 'var(--kv-accent-500)' : 'var(--kv-text-muted)' }">#</span>
            <span class="text-[12px] font-medium" :style="{ color: createType === 'GUILD_TEXT' ? 'var(--kv-text-primary)' : 'var(--kv-text-muted)' }">{{ t('channel.channelTypeText') }}</span>
          </button>
          <!-- Ses — seçilebilir (audio-only) -->
          <button
            type="button"
            class="flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-[var(--kv-radius-md)] cursor-pointer transition-colors"
            :class="createType === 'GUILD_VOICE' ? 'border-2' : 'border'"
            :style="createType === 'GUILD_VOICE'
              ? 'border-color: var(--kv-accent-500); background-color: var(--kv-accent-subtle);'
              : 'border-color: var(--kv-border-subtle);'"
            @click="createType = 'GUILD_VOICE'"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ color: createType === 'GUILD_VOICE' ? 'var(--kv-accent-500)' : 'var(--kv-text-muted)' }">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
            <span class="text-[12px] font-medium" :style="{ color: createType === 'GUILD_VOICE' ? 'var(--kv-text-primary)' : 'var(--kv-text-muted)' }">{{ t('channel.channelTypeVoice') }}</span>
          </button>
          <!-- Forum — devre dışı -->
          <div
            class="flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-[var(--kv-radius-md)] border cursor-not-allowed opacity-50"
            style="border-color: var(--kv-border-subtle);"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="text-[12px] font-medium" style="color: var(--kv-text-muted);">{{ t('channel.channelTypeForum') }}</span>
            <span
              class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
              style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
            >{{ t('channel.channelTypeSoon') }}</span>
          </div>
        </div>
      </div>

      <!-- D: isPrivate toggle -->
      <div
        class="flex items-center justify-between gap-4 px-3 py-3 rounded-[var(--kv-radius-md)] border"
        style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
      >
        <div class="flex-1 min-w-0">
          <p class="text-[14px] font-medium" style="color: var(--kv-text-primary);">
            {{ t('channel.privateLabel') }}
          </p>
          <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
            {{ t('channel.privateDesc') }}
          </p>
        </div>
        <button
          type="button"
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
          :style="createIsPrivate ? 'background-color: var(--kv-accent-500);' : 'background-color: var(--kv-bg-rail);'"
          @click="createIsPrivate = !createIsPrivate"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200"
            :class="createIsPrivate ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>

      <!-- 18+ yaş-kapılı toggle (aynen durur) -->
      <div
        class="flex items-center justify-between gap-4 px-3 py-3 rounded-[var(--kv-radius-md)] border"
        style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
      >
        <div class="flex-1 min-w-0">
          <p class="text-[14px] font-medium" style="color: var(--kv-text-primary);">
            {{ t('channel.ageGatedLabel') }}
          </p>
          <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
            {{ t('channel.ageGatedDesc') }}
          </p>
        </div>
        <button
          type="button"
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
          :style="createAgeGated ? 'background-color: var(--kv-accent-500);' : 'background-color: var(--kv-bg-rail);'"
          @click="createAgeGated = !createAgeGated"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200"
            :class="createAgeGated ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>

      <!-- D: Kategori dropdown KALDIRILDI -->

      <div class="flex justify-end gap-3 pt-1">
        <KvButton type="button" variant="ghost" @click="showCreate = false">
          {{ t('common.cancel') }}
        </KvButton>
        <KvButton type="submit" :loading="creating" :disabled="!createName.trim()">
          {{ t('channel.createButton') }}
        </KvButton>
      </div>
    </form>
  </KvModal>

  <!-- Kanal ayarları modalı (yeniden adlandır + yavaş mod + kategori) -->
  <KvModal
    v-if="settingsTarget"
    :title="t('channel.settingsTitle')"
    @close="settingsTarget = null"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submitSettings">
      <KvInput
        v-model="settingsName"
        :label="t('channel.nameLabel')"
        :placeholder="t('channel.namePlaceholder')"
        :error="settingsError"
        autofocus
      />

      <!-- Yavaş mod seçimi -->
      <div class="flex flex-col gap-1.5">
        <label class="text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
          {{ t('channel.slowModeLabel') }}
        </label>
        <p class="text-[12px]" style="color: var(--kv-text-muted);">
          {{ t('channel.slowModeDesc') }}
        </p>
        <select
          v-model.number="settingsSlowMode"
          class="w-full px-3 py-2 rounded-[var(--kv-radius-sm)] text-[14px] outline-none border cursor-pointer"
          style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong); color: var(--kv-text-primary);"
        >
          <option
            v-for="opt in SLOW_MODE_OPTIONS"
            :key="opt.value"
            :value="opt.value"
          >{{ opt.label }}</option>
        </select>
      </div>

      <!-- 18+ yaş-kapılı toggle -->
      <div
        class="flex items-center justify-between gap-4 px-3 py-3 rounded-[var(--kv-radius-md)] border"
        style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
      >
        <div class="flex-1 min-w-0">
          <p class="text-[14px] font-medium" style="color: var(--kv-text-primary);">
            {{ t('channel.ageGatedLabel') }}
          </p>
          <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
            {{ t('channel.ageGatedDesc') }}
          </p>
        </div>
        <button
          type="button"
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
          :style="settingsAgeGated ? 'background-color: var(--kv-accent-500);' : 'background-color: var(--kv-bg-rail);'"
          @click="settingsAgeGated = !settingsAgeGated"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200"
            :class="settingsAgeGated ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>

      <!-- Kullanıcı limiti (R10 — yalnız ses kanalları; Discord-tarzı kaydırıcı: ∞ … 99) -->
      <div v-if="settingsTarget.type === 'GUILD_VOICE'" class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <label class="text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
            {{ t('channel.userLimitLabel') }}
          </label>
          <span class="text-[13px] font-semibold" style="color: var(--kv-text-primary); font-variant-numeric: tabular-nums;">
            {{ (settingsUserLimit ?? 0) > 0 ? settingsUserLimit : '∞' }}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="99"
          step="1"
          :value="settingsUserLimit ?? 0"
          class="kv-range w-full"
          :style="`background: linear-gradient(to right, var(--kv-accent-500) ${((settingsUserLimit ?? 0) / 99) * 100}%, var(--kv-bg-elevated) ${((settingsUserLimit ?? 0) / 99) * 100}%);`"
          @input="settingsUserLimit = Number(($event.target as HTMLInputElement).value)"
        />
        <div class="flex justify-between text-[11px]" style="color: var(--kv-text-muted);">
          <span>∞</span><span>99</span>
        </div>
        <p class="text-[12px]" style="color: var(--kv-text-muted);">
          {{ t('channel.userLimitHint') }}
        </p>
      </div>

      <!-- Bit hızı (R10 — yalnız ses kanalları; Discord-tarzı kaydırıcı: 8 … 96 kbps) -->
      <div v-if="settingsTarget.type === 'GUILD_VOICE'" class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <label class="text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
            {{ t('channel.bitrateLabel') }}
          </label>
          <span class="text-[13px] font-semibold" style="color: var(--kv-text-primary); font-variant-numeric: tabular-nums;">
            {{ settingsBitrate }} kbps
          </span>
        </div>
        <input
          type="range"
          min="8"
          max="96"
          step="8"
          :value="settingsBitrate"
          class="kv-range w-full"
          :style="`background: linear-gradient(to right, var(--kv-accent-500) ${((settingsBitrate - 8) / 88) * 100}%, var(--kv-bg-elevated) ${((settingsBitrate - 8) / 88) * 100}%);`"
          @input="settingsBitrate = Number(($event.target as HTMLInputElement).value)"
        />
        <div class="flex justify-between text-[11px]" style="color: var(--kv-text-muted);">
          <span>8 kbps</span><span>96 kbps</span>
        </div>
        <p class="text-[12px]" style="color: var(--kv-text-muted);">
          {{ t('channel.bitrateHint') }}
        </p>
      </div>

      <!-- ── Özel kanal üye yönetimi (yalnız isPrivate + OWNER/ADMIN) ── -->
      <template v-if="settingsTarget.isPrivate && isAdmin">
        <div class="flex flex-col gap-3 pt-1">
          <!-- Bölüm başlığı -->
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-widest mb-1" style="color: var(--kv-text-muted);">
              {{ t('channel.members.sectionTitle') }}
            </p>
            <p class="text-[12px]" style="color: var(--kv-text-muted);">
              {{ t('channel.members.privateNote') }}
            </p>
          </div>

          <!-- Mevcut üyeler listesi -->
          <div
            class="rounded-[var(--kv-radius-md)] border overflow-hidden"
            style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
          >
            <p
              v-if="membersLoading"
              class="px-3 py-2 text-[13px]"
              style="color: var(--kv-text-muted);"
            >
              {{ t('channel.members.loading') }}
            </p>
            <p
              v-else-if="channelMembers.length === 0"
              class="px-3 py-2 text-[13px]"
              style="color: var(--kv-text-muted);"
            >
              {{ t('channel.members.noMembers') }}
            </p>
            <div
              v-for="member in channelMembers"
              v-else
              :key="member.id"
              class="flex items-center gap-2 px-3 py-2 border-b last:border-b-0"
              style="border-color: var(--kv-border-subtle);"
            >
              <!-- Avatar (daire) -->
              <div
                class="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[12px] font-semibold overflow-hidden"
                style="background-color: var(--kv-accent-500); color: #fff;"
              >
                <img
                  v-if="member.avatarUrl"
                  :src="member.avatarUrl"
                  :alt="member.username"
                  class="w-full h-full object-cover"
                />
                <span v-else>{{ member.username.charAt(0).toUpperCase() }}</span>
              </div>
              <!-- Ad -->
              <span class="flex-1 text-[14px] truncate" style="color: var(--kv-text-primary);">
                {{ member.username }}
              </span>
              <!-- Çıkar butonu -->
              <button
                class="shrink-0 flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer hover:bg-[var(--kv-bg-rail)]"
                style="width: 24px; height: 24px; color: var(--kv-danger);"
                :title="t('channel.members.remove')"
                type="button"
                @click="removeChannelMember(member.id)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Üye ekle: arama + liste -->
          <div class="flex flex-col gap-2">
            <p class="text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
              {{ t('channel.members.addMember') }}
            </p>
            <input
              v-model="memberSearchQuery"
              type="text"
              :placeholder="t('channel.members.addMemberSearch')"
              class="w-full px-3 py-2 rounded-[var(--kv-radius-sm)] text-[14px] outline-none border"
              style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong); color: var(--kv-text-primary);"
            />
            <!-- Hata mesajı -->
            <p v-if="addMemberError" class="text-[12px]" style="color: var(--kv-danger);">
              {{ addMemberError }}
            </p>
            <!-- Eklenebilir üye listesi -->
            <div
              v-if="eligibleToAdd.length > 0"
              class="rounded-[var(--kv-radius-md)] border overflow-hidden"
              style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated); max-height: 180px; overflow-y: auto;"
            >
              <button
                v-for="member in eligibleToAdd"
                :key="member.userId"
                type="button"
                :disabled="addMemberLoading"
                class="w-full flex items-center gap-2 px-3 py-2 text-left border-b last:border-b-0 transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)] disabled:opacity-50 disabled:cursor-not-allowed"
                style="border-color: var(--kv-border-subtle);"
                @click="addChannelMember(member.userId)"
              >
                <!-- Avatar (daire) -->
                <div
                  class="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-semibold overflow-hidden"
                  style="background-color: var(--kv-accent-500); color: #fff;"
                >
                  <img
                    v-if="member.avatarUrl"
                    :src="member.avatarUrl"
                    :alt="member.username"
                    class="w-full h-full object-cover"
                  />
                  <span v-else>{{ member.username.charAt(0).toUpperCase() }}</span>
                </div>
                <span class="flex-1 text-[13px] truncate" style="color: var(--kv-text-secondary);">
                  {{ member.username }}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted); shrink: 0;">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            </div>
            <p
              v-else-if="!addMemberLoading && guildMembersAll.length > 0"
              class="text-[13px]"
              style="color: var(--kv-text-muted);"
            >
              {{ t('channel.members.noEligible') }}
            </p>
          </div>
        </div>
      </template>

      <div class="flex items-center justify-between gap-3 pt-1">
        <!-- Her yerden sil: düzenleme ekranından da kanal silinebilir (Görsel #5/#6) -->
        <KvButton type="button" variant="danger" @click="deleteFromSettings">
          {{ t('channel.delete') }}
        </KvButton>
        <div class="flex gap-3">
          <KvButton type="button" variant="ghost" @click="settingsTarget = null">
            {{ t('common.cancel') }}
          </KvButton>
          <KvButton type="submit" :loading="settingsSaving" :disabled="!settingsName.trim()">
            {{ t('channel.settingsButton') }}
          </KvButton>
        </div>
      </div>
    </form>
  </KvModal>

  <!-- Kanal sil onay diyaloğu -->
  <KvModal
    v-if="deleteTarget && deleteError"
    :title="t('channel.deleteTitle')"
    @close="deleteTarget = null; deleteError = ''"
  >
    <p class="text-[14px] mb-4" style="color: var(--kv-danger);">{{ deleteError }}</p>
    <div class="flex justify-end">
      <KvButton variant="ghost" @click="deleteTarget = null; deleteError = ''">
        {{ t('common.close') }}
      </KvButton>
    </div>
  </KvModal>

  <ConfirmDialog
    v-else-if="deleteTarget"
    :title="t('channel.deleteTitle')"
    :message="t('channel.deleteConfirm', { name: deleteTarget.name ?? '' })"
    :confirm-label="t('channel.deleteButton')"
    :loading="deleting"
    @confirm="confirmDelete"
    @cancel="deleteTarget = null"
  />

  <!-- Kategori oluştur modalı -->
  <KvModal
    v-if="showCreateCategory"
    :title="t('category.createTitle')"
    @close="showCreateCategory = false"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submitCreateCategory">
      <KvInput
        v-model="createCategoryName"
        :label="t('category.nameLabel')"
        :placeholder="t('category.namePlaceholder')"
        :error="createCategoryError"
        autofocus
      />
      <div class="flex justify-end gap-3 pt-1">
        <KvButton type="button" variant="ghost" @click="showCreateCategory = false">
          {{ t('common.cancel') }}
        </KvButton>
        <KvButton type="submit" :loading="creatingCategory" :disabled="!createCategoryName.trim()">
          {{ t('category.createButton') }}
        </KvButton>
      </div>
    </form>
  </KvModal>

  <!-- Kategori yeniden adlandır modalı -->
  <KvModal
    v-if="renameTarget"
    :title="t('category.renameTitle')"
    @close="renameTarget = null"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submitRenameCategory">
      <KvInput
        v-model="renameName"
        :label="t('category.nameLabel')"
        :placeholder="t('category.namePlaceholder')"
        :error="renameError"
        autofocus
      />
      <div class="flex justify-end gap-3 pt-1">
        <KvButton type="button" variant="ghost" @click="renameTarget = null">
          {{ t('common.cancel') }}
        </KvButton>
        <KvButton type="submit" :loading="renaming" :disabled="!renameName.trim()">
          {{ t('category.renameButton') }}
        </KvButton>
      </div>
    </form>
  </KvModal>

  <!-- Kategori sil onay diyaloğu -->
  <ConfirmDialog
    v-if="deleteCategoryTarget"
    :title="t('category.deleteTitle')"
    :message="t('category.deleteConfirm', { name: deleteCategoryTarget.name })"
    :confirm-label="t('category.deleteButton')"
    :loading="deletingCategory"
    @confirm="confirmDeleteCategory"
    @cancel="deleteCategoryTarget = null"
  />

  <!-- Ortamdan ayrıl onay diyaloğu -->
  <ConfirmDialog
    v-if="showLeaveConfirm"
    :title="t('guild.leaveTitle')"
    :message="leaveError || t('guild.leaveConfirm', { name: guildsStore.activeGuild()?.name ?? '' })"
    :confirm-label="t('guild.leave')"
    :loading="leaving"
    @confirm="doLeave"
    @cancel="showLeaveConfirm = false; leaveError = ''"
  />

  <!-- Etkinlikler modalı -->
  <EventsModal
    v-if="showEventsModal && activeGuildId"
    :guild-id="activeGuildId"
    :can-manage="canManageEvents"
    :highlight-event-id="highlightEventId"
    @close="showEventsModal = false; highlightEventId = null"
  />

  <!-- Etkinlik oluştur sihirbazı (ortam menüsünden) -->
  <CreateEventWizard
    v-if="showCreateEventWizard && activeGuildId"
    :guild-id="activeGuildId"
    @close="showCreateEventWizard = false"
    @created="showCreateEventWizard = false"
  />

  <!-- ── Kanal sağ-tık context menüsü (cursor-konumlu; body'ye teleport) ──
       Metin (GUILD_TEXT) vs ses (GUILD_VOICE) farklı öğe seti. Görsel ServerRail
       ortam menüsüyle tutarlı: elevated bg, ince subtle kenarlık, gölge YOK. -->
  <Teleport to="body">
    <div
      v-if="contextChannel"
      class="ch-ctx"
      role="menu"
      :style="chCtxPosStyle"
      @click.stop
      @contextmenu.prevent.stop
    >
      <!-- 1. Okunmuş Olarak İşaretle — yalnız metin (ses kanalında okunmamış yok) -->
      <button
        v-if="contextChannel.type === 'GUILD_TEXT'"
        class="ch-ctx__item"
        role="menuitem"
        @click="doChannelMarkRead"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ch-ctx__icon"><path d="M20 6 9 17l-5-5"/></svg>
        <span>{{ t('guildMenu.markRead') }}</span>
      </button>

      <!-- 2. Davet Et — CREATE_INVITE (etiket türe göre) -->
      <button
        v-if="can('CREATE_INVITE')"
        class="ch-ctx__item"
        role="menuitem"
        @click="openChannelInvite"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="ch-ctx__icon"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        <span>{{ contextChannel.type === 'GUILD_VOICE' ? t('channelMenu.inviteVoice') : t('channelMenu.inviteText') }}</span>
      </button>

      <!-- 3. Bağlantıyı Kopyala — herkese -->
      <button
        class="ch-ctx__item"
        role="menuitem"
        @click="doCopyChannelLink"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ch-ctx__icon"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        <span>{{ t('channelMenu.copyLink') }}</span>
      </button>

      <div class="ch-ctx__divider" />

      <!-- 4. Kanalı Sustur — sağda işaret (✓) muted ise -->
      <button
        class="ch-ctx__item"
        role="menuitemcheckbox"
        :aria-checked="isChannelMuted"
        @click="toggleChannelMute"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ch-ctx__icon"><path d="M11 5 6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
        <span class="ch-ctx__label">{{ t('channelMenu.mute') }}</span>
        <svg v-if="isChannelMuted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="ch-ctx__check"><path d="M20 6 9 17l-5-5"/></svg>
      </button>

      <!-- 5. Bildirim Ayarları — yana açılan flyout (NotifLevelFlyout) -->
      <NotifLevelFlyout :level="channelLevel" @select="setChannelLevel" />

      <!-- 6-8. Yönetim öğeleri — MANAGE_CHANNELS (isAdmin) -->
      <template v-if="isAdmin">
        <div class="ch-ctx__divider" />
        <!-- 6. Kanalı Düzenle -->
        <button
          class="ch-ctx__item"
          role="menuitem"
          @click="openChannelSettings"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ch-ctx__icon"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          <span>{{ t('channelMenu.edit') }}</span>
        </button>
        <!-- 7. Kanal Oluştur (türe göre: metin → metin, ses → ses; o kategoride) -->
        <button
          class="ch-ctx__item"
          role="menuitem"
          @click="openChannelCreate"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="ch-ctx__icon"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>{{ contextChannel.type === 'GUILD_VOICE' ? t('channelMenu.createVoice') : t('channelMenu.createText') }}</span>
        </button>
        <!-- 8. Kanalı Sil (danger) -->
        <button
          class="ch-ctx__item ch-ctx__item--danger"
          role="menuitem"
          @click="openChannelDelete"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ch-ctx__icon"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          <span>{{ t('channelMenu.delete') }}</span>
        </button>
      </template>

      <div class="ch-ctx__divider" />

      <!-- 9. Kanal ID'sini Kopyala — herkese -->
      <button
        class="ch-ctx__item"
        role="menuitem"
        @click="doCopyChannelId"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ch-ctx__icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span class="ch-ctx__label">{{ t('channelMenu.copyId') }}</span>
        <span class="ch-ctx__id-badge">{{ t('guildMenu.idBadge') }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
/* REV-4: bahsetme bandı zıplama vurgusu — kanal satırına geçici aksan halkası */
.kv-mention-highlight {
  outline: 2px solid var(--kv-danger);
  outline-offset: -2px;
  animation: kv-mention-pulse 1.2s ease-in-out;
}
@keyframes kv-mention-pulse {
  0%, 100% { background-color: transparent; }
  30% { background-color: var(--kv-accent-subtle); }
}

/* Drag-reorder: üzerine bırakılacak hedef göstergesi (üst aksan çizgisi) */
.kv-drop-target {
  box-shadow: inset 0 2px 0 0 var(--kv-accent-500);
}

/* Ses kanalı kullanıcı-limiti kaydırıcısı (Discord-tarzı: accent dolgu + beyaz thumb) */
.kv-range {
  -webkit-appearance: none;
  appearance: none;
  height: 8px;
  border-radius: 4px;
  outline: none;
  cursor: pointer;
}
.kv-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  border: none;
  cursor: pointer;
}
.kv-range::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  border: none;
  cursor: pointer;
}

/* Kanal satırı hover aksiyon butonları (davet/dişli) — Discord gibi belirgin,
   sönük değil (Görsel #7→#8). Muted yerine secondary; hover'da primary. */
.kv-chan-action {
  color: var(--kv-text-secondary);
}
.kv-chan-action:hover {
  color: var(--kv-text-primary);
}

/* Kırmızı okunmamış sayaç rozeti — kanal satırı sağında */
.channel-unread-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background-color: var(--kv-danger);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  white-space: nowrap;
  margin-right: 6px;
  flex-shrink: 0;
}
</style>

<!-- Teleport hedefi body olduğu için scoped class çalışmaz — global stil (ServerRail .rail-ctx ile aynı) -->
<style>
/* ── Kanal sağ-tık context menüsü (Teleport → body, fixed konumlama) ── */
.ch-ctx {
  position: fixed;
  z-index: 9999;
  min-width: 216px;
  padding: 4px;
  background-color: var(--kv-bg-elevated);
  border: 1px solid var(--kv-border-subtle);
  border-radius: var(--kv-radius-md);
  overflow: hidden;
}

.ch-ctx__item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--kv-radius-sm);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  color: var(--kv-text-primary);
  background: transparent;
  border: none;
  transition: background-color 0.12s;
}

.ch-ctx__item:hover {
  background-color: var(--kv-accent-subtle);
}

.ch-ctx__icon {
  flex-shrink: 0;
  color: var(--kv-text-muted);
}

.ch-ctx__item--danger {
  color: var(--kv-danger);
}

.ch-ctx__item--danger .ch-ctx__icon {
  color: var(--kv-danger);
}

.ch-ctx__item--danger:hover {
  background-color: rgba(242, 59, 75, 0.1);
}

.ch-ctx__divider {
  height: 1px;
  margin: 4px 6px;
  background-color: var(--kv-border-subtle);
}

/* Etiket esner → sağdaki işaret/rozet/chevron sağa yapışır */
.ch-ctx__label {
  flex: 1 1 auto;
  min-width: 0;
}

.ch-ctx__check {
  flex-shrink: 0;
  color: var(--kv-accent-500);
}

.ch-ctx__id-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: var(--kv-radius-sm);
  background-color: var(--kv-bg-rail);
  color: var(--kv-text-muted);
}
</style>
