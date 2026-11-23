<script setup lang="ts">
import { ref, watch, nextTick, computed, onUnmounted } from 'vue'
import { useStickToBottom } from '@/composables/useStickToBottom'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useToastStore } from '@/stores/toast'
import { useMessagesStore } from '@/stores/messages'
import { useDmStore } from '@/stores/dm'
import { useAuthStore } from '@/stores/auth'
import { useFriendsStore } from '@/stores/friends'
import { useSocket, voiceSubscribe, voiceUnsubscribe } from '@/composables/useSocket'
import { useOptimisticSend } from '@/composables/useOptimisticSend'
import { useTyping, useTypingLabel } from '@/composables/useTyping'
import { useMentionAutocomplete } from '@/composables/useMentionAutocomplete'
import { useComposerMentionBridge } from '@/composables/useComposerMentionBridge'
import { useJumpToMessage } from '@/composables/useMessageJump'
import { useAudioQueue } from '@/composables/useExclusivePlayback'
import { useCall } from '@/composables/useCall'
import { useCallStore } from '@/stores/call'
import { useVoiceStore } from '@/stores/voice'
import DmCallPanel from './DmCallPanel.vue'
import { messagesApi } from '@/api/messages'
import { formatMentionsPlain } from '@/utils/mentions'
import { canModerateGroupTarget, groupRoleOf } from '@/utils/groupRoles'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import ScrollToBottomButton from '@/components/shared/ScrollToBottomButton.vue'
import ReplyQuote from '@/components/shared/ReplyQuote.vue'
import AttachmentComposeModal from '@/components/shared/AttachmentComposeModal.vue'
import { ATTACHMENT_ACCEPT } from '@/utils/attachmentType'
import { useComposerFileIntake } from '@/composables/useComposerFileIntake'
import ReportModal from '@/components/shared/ReportModal.vue'
import ComposerBar from '@/components/shared/ComposerBar.vue'
import MessageRow from '@/components/shared/MessageRow.vue'
import DateDivider from '@/components/shared/DateDivider.vue'
import E2eeDeviceNotice from '@/components/shared/E2eeDeviceNotice.vue'
import E2eeDivider from '@/components/shared/E2eeDivider.vue'
import E2eeLockIcon from '@/components/shared/E2eeLockIcon.vue'
import SafetyCodeModal from '@/components/shared/SafetyCodeModal.vue'
import E2eeWarningBanner from '@/components/shared/E2eeWarningBanner.vue'
import { useE2eeChannelView } from '@/composables/useE2eeChannelView'
import { useE2eeStore } from '@/stores/e2ee'
import { useE2eeNoticesStore } from '@/stores/e2eeNotices'
import { useGroupEventsStore } from '@/stores/groupEvents'
import { groupEventSlots } from '@/utils/groupEventSlots'
import GroupEventNotice from '@/components/shared/GroupEventNotice.vue'
import { useE2eeBackupStore } from '@/stores/e2eeBackup'
import MessageEditModal from '@/components/shared/MessageEditModal.vue'
import ForwardMessageModal from '@/components/shared/ForwardMessageModal.vue'
import ReactionPill from '@/components/shared/ReactionPill.vue'
import ReactionsModal from '@/components/shared/ReactionsModal.vue'
import PinsPopover from '@/components/shared/PinsPopover.vue'
import SearchPopover from '@/components/shared/SearchPopover.vue'
import GroupManagePanel from './GroupManagePanel.vue'
import SeenAvatars from './SeenAvatars.vue'
import { useAppShellNav } from '@/composables/useAppShellNav'
import { isNewDay, dayDividerLabel } from '@/utils/dateSeparator'
import type { DmChannelDto, MessageDto, SeenReader } from '@/types'
import { usePresenceStore, type PresenceStatus } from '@/stores/presence'

// Web `UserCard.vue` presenceColor ile aynı palet; `offline: null` = satır hiç çizilmez.
// (Mobil `dm/[id].tsx` PRESENCE_COLOR ile birebir aynı kural — iki istemci aynı şeyi söylesin.)
const PRESENCE_COLOR: Record<PresenceStatus, string | null> = {
  online: '#3DB46E',
  away: '#E8A33D',
  dnd: '#F23B4B',
  offline: null,
}

// Yanıt state
const replyingTo = ref<MessageDto | null>(null)

// İlet (forward) modalı
const showForward = ref(false)
// C46: kimler tepki verdi penceresi (hedef mesaj kimliği)
const reactionsMsgId = ref<string | null>(null)
const forwardMsg = ref<MessageDto | null>(null)

function startReply(msg: MessageDto) {
  replyingTo.value = msg
  nextTick(() => dmTextareaEl.value?.focus())
}

function cancelReply() {
  replyingTo.value = null
}

// Sprint 6.2: mesaj düzenleme / silme state
interface EditState {
  messageId: string
  content: string
  loading: boolean
  error: string
}

const editState = ref<EditState | null>(null)
const editTarget = computed(() => messages.value.find((m) => m.id === editState.value?.messageId))
const showDeleteConfirm = ref(false)
const deleteTargetId = ref<string | null>(null)
const deleteLoading = ref(false)

// Giriş satırı bileşeni; textarea'ya ComposerBar'ın expose ettiği ref üzerinden erişilir
const composerEl = ref<{ textarea: HTMLTextAreaElement | null } | null>(null)
const dmTextareaEl = computed(() => composerEl.value?.textarea ?? null)

async function pickDmEmoji(msg: MessageDto, emoji: string) {
  if (isDeparted.value) return
  try {
    await messagesApi.addReaction(props.channel.id, msg.id, emoji)
    // Store güncellemesi useSocket reaction.added handler'ından gelir (çift-sayım önleme)
  } catch {
    // sessizce yut
  }
}

async function toggleDmReaction(msg: MessageDto, emoji: string, reactedByMe: boolean) {
  if (isDeparted.value) return // C62: eski üye tepki veremez (sunucu 403)
  try {
    if (reactedByMe) {
      await messagesApi.removeReaction(props.channel.id, msg.id, emoji)
    } else {
      await messagesApi.addReaction(props.channel.id, msg.id, emoji)
    }
    // Store güncellemesi useSocket reaction.added/reaction.removed handler'ından gelir (çift-sayım önleme)
  } catch {
    // sessizce yut
  }
}

const props = defineProps<{
  channel: DmChannelDto
  /** Sprint WEB-PARITE §4 — sağ profil panelinin efektif görünürlüğü (yalnız <1280'de anlamlı). */
  profilePanelOpen?: boolean
}>()
// `left` kalktı: GroupManagePanel artık hiç emit etmiyor (İş 2 — ayrıl DM satırı menüsüne taşındı).
const emit = defineEmits<{ toggleProfile: [] }>()

const { t } = useI18n()
const router = useRouter()
const toast = useToastStore()
const optimistic = useOptimisticSend()
const messagesStore = useMessagesStore()
const dmStore = useDmStore()
const e2eeStore = useE2eeStore()
const noticesStore = useE2eeNoticesStore()
const groupEventsStore = useGroupEventsStore()
const backupStore = useE2eeBackupStore()
const authStore = useAuthStore()
const friendsStore = useFriendsStore()
const callStore = useCallStore()
const voiceStore = useVoiceStore()
const { startCall, startGroupCall } = useCall()
const { joinChannel, leaveChannel } = useSocket()
const { onInput: onTypingInput, stopTyping } = useTyping(() => props.channel.id)
const { label: typingLabel } = useTypingLabel(() => props.channel.id, t, { named: false })

// Sprint V2: mention üye kaynağı — DM bağlamına göre
// 1-1 DM: karşı kullanıcı; GROUP_DM: grup üyeleri
const dmMentionMembers = computed(() => {
  if (props.channel.type === 'DM') {
    return [{ id: props.channel.otherUser.id, username: props.channel.otherUser.username, avatarUrl: props.channel.otherUser.avatarUrl }]
  }
  // GROUP_DM — kendin listede yok (sunucu kendi bahsetmeni yok sayıyor; bkz. MessageArea notu)
  return props.channel.members
    .filter((m) => m.id !== authStore.user?.id)
    .map((m) => ({ id: m.id, username: m.username, avatarUrl: m.avatarUrl }))
})

// Sprint V2: mention çözücü — userId → username (DM katılımcıları)
function dmUserName(userId: string): string | undefined {
  const member = dmMentionMembers.value.find((m) => m.id === userId)
  if (member) return member.username
  // Gönderen kendisi de olabilir
  if (userId === authStore.user?.id) return authStore.user.username
  return undefined
}
function dmMentionResolver(userId: string): string {
  return dmUserName(userId) ?? t('mention.unknown')
}

// Sprint V2: kendi-bahsedilme vurgusu (DM bağlamı)
// Şifreli grup mesajında sunucu bahsetme listesini bilmez (mentions = []): vurgu çözülen metindeki token'dan çıkar (E2 §0).
function isDmMentioned(msg: MessageDto): boolean {
  const me = authStore.user?.id ?? ''
  if (msg.mentions?.includes(me)) return true
  return msg.encrypted === true && msg.e2eeStatus === 'ok' && msg.content.includes(`<@${me}>`)
}

// Sprint V2: mention autocomplete
const mention = useMentionAutocomplete(
  dmMentionMembers,
  () => content.value,
  (v) => { content.value = v },
  () => dmTextareaEl.value?.selectionStart ?? 0,
  (pos) => { nextTick(() => { dmTextareaEl.value?.setSelectionRange(pos, pos) }) },
)

// D95 — "Bahset" kısayolu: yalnız grup DM (1-1 DM'de bahsetmenin etkisi yok) ve yazma kutusu açıkken
useComposerMentionBridge({
  mention,
  textareaEl: dmTextareaEl,
  canMention: () => props.channel.type === 'GROUP_DM' && canMessage.value,
})

// C54: düzenleme kutusu için token<->ad dönüşümü (composer'dan ayrı örnek; pending haritaları karışmasın)
const editMention = useMentionAutocomplete(
  () => [],
  () => editState.value?.content ?? '',
  (v) => { if (editState.value) editState.value.content = v },
  () => 0,
  () => {},
)
// Değişmeden kaydedilirse sunucuya gönderilmez
let editInitial = ''

// Tip yardımcıları
const isGroup = computed(() => props.channel.type === 'GROUP_DM')
const dmChannel = computed(() => props.channel.type === 'DM' ? props.channel : null)

// Başlıkta karşı tarafın durumu (sahip isteği 2026-08-11 — mobil DM başlığıyla parite). DM
// listesindeki yeşil baloncuk zaten var; bu onun yerine değil, adın altındaki AÇIK metin.
// Aktif olan her durum yazılır (çevrimiçi/boşta/rahatsız etme), çevrimdışıyken hiçbir şey.
// Görünürlük kararı sunucuda (`PresenceService.canSeePresence`, R7) — göremediğimiz kişinin
// durumu store'a hiç düşmez, burada ek bir kapı yok.
const presenceStore = usePresenceStore()
const dmPresence = computed<PresenceStatus | null>(() =>
  dmChannel.value ? presenceStore.getStatus(dmChannel.value.otherUser.id) : null,
)
const dmPresenceColor = computed(() => (dmPresence.value ? PRESENCE_COLOR[dmPresence.value] : null))
const groupChannel = computed(() => props.channel.type === 'GROUP_DM' ? props.channel : null)
// E7 §4.7: başlıktaki kilit güvenlik kodunu açar (1-1: karşı taraf; grup: kişi seçilir). Üye kaynağı bahsetmelerle aynı.
const safetyOpen = ref(false)
// C62: ayrıldığım/çıkarıldığım grup = salt okunur (composer yerine band; yanıt/tepki/düzenle/sil/sabitle/arama/üye paneli kapalı)
const departure = computed(() => groupChannel.value?.departed ?? null)
const isDeparted = computed(() => !!departure.value)
// Grup DM: kurucu/yönetici başkasının mesajını silebilir (hiyerarşi groupRoles'ta; kapı sunucuda).
// 1-1 DM'de hep false.
const myGroupRole = computed(() =>
  groupChannel.value ? groupRoleOf(groupChannel.value, authStore.user?.id) : 'member',
)
function canDeleteOthers(msg: MessageDto): boolean {
  const g = groupChannel.value
  if (!g || msg.author.id === authStore.user?.id) return false
  return canModerateGroupTarget(myGroupRole.value, groupRoleOf(g, msg.author.id))
}

// REV-5: 1-1 DM'de karşı taraf arkadaş değilse "Arkadaş ekle" göster.
// Engelliyken veya zaten arkadaşken/istek gönderildikten sonra gizlenir.
// Buton minöre göre gizlenMEZ (Sprint 4A G2 deseni); ret jenerik, statü sızmaz.
const otherUserId = computed(() => dmChannel.value?.otherUser.id ?? null)
const isFriendInDm = computed(
  () => !!otherUserId.value && friendsStore.friends.some((f) => f.user.id === otherUserId.value),
)
const addFriendSent = ref(false)
const addingFriend = ref(false)
const showAddFriend = computed(
  () => !!dmChannel.value && !dmChannel.value.selfBlocked && !isFriendInDm.value && !addFriendSent.value,
)

async function addFriendInDm() {
  if (!otherUserId.value || addingFriend.value) return
  // REV-10b güvenlik: ben engellediysem önce engel kaldırılmalı (buton zaten gizli; defansif).
  // Karşı taraf engellediyse backend zaten jenerik reddeder (sızıntı yok).
  if (dmChannel.value?.selfBlocked) return
  addingFriend.value = true
  try {
    await friendsStore.sendRequestByUser(otherUserId.value)
    addFriendSent.value = true // jenerik başarı; mutual ise zaten arkadaş olur
  } catch {
    // jenerik — sebep/statü gösterme (T&S); kullanıcı kod ile de ekleyebilir
    sendError.value = t('friends.addFailed')
  } finally {
    addingFriend.value = false
  }
}

// Kanal değişince ekle-durumunu sıfırla (yeni DM açılınca buton tekrar değerlendirilsin)
watch(() => props.channel.id, () => { addFriendSent.value = false })

// Grup adı: verilen ad yoksa üye adlarından üretilir
const groupDisplayName = computed(() => {
  const g = groupChannel.value
  if (!g) return ''
  if (g.name) return g.name
  const names = g.members.map((m) => m.username)
  if (names.length <= 3) return names.join(', ')
  return names.slice(0, 2).join(', ') + ` +${names.length - 2}`
})

const content = ref('')
const sendError = ref('')
const listEl = ref<HTMLElement | null>(null)
const fileInputEl = ref<HTMLInputElement | null>(null)
const gifInputEl = ref<HTMLInputElement | null>(null)
const realtimeError = ref(false)
const unblocking = ref(false)
const reportTargetId = ref<string | null>(null)
const reportTargetType = ref<'MESSAGE' | 'USER'>('MESSAGE')
// Grup üye paneli — sahip talebi 2026-07-30: "varsayılan olarak açık kalsın, sonradan kapatabilelim".
// **Nullable-tercih deseni** (app-shell'in üye panelinde zaten kullanılan desen, icat değil):
//   null  = kullanıcı henüz dokunmadı → genişlikten türet (≥1280 açık)
//   true/false = kullanıcı bir kez seçti → tercihi kalıcı, pencere boyu artık ezmez
// Doğrudan `ref(true)` YAPILMADI: dar pencerede panel sohbeti sıkıştırırdı — bugün düzelttiğimiz
// "modal sidebar'a hapsoldu" hatasıyla aynı sınıf hata olurdu. Eşik `isWide` (xl = 1280), ortam
// görünümündeki üye panelinin eşiğiyle aynı.
// Sprint R18: state `useAppShellNav`in paylaşılan singleton'ına taşındı (eski lokal
// `groupPanelPref` ref'i kalktı, eşiği zaten composable içinde `isWide` ile hesaplıyor) —
// `DmList`teki "Düzenle" menü öğesi paneli buradan (bu component henüz mount olmamış/farklı
// kanal açıkken bile) zorla açabiliyor.
const { groupPanelVisible: showGroupPanel, toggleGroupPanel, closeGroupPanel } = useAppShellNav()

// Sprint 5 R1 — modal akışı
const composeFile = ref<File | null>(null)
const intake = useComposerFileIntake({ composeFile, disabled: () => !!editState.value })
const onFileSelected = intake.onFileSelected

function openReportMessage(msgId: string) {
  reportTargetType.value = 'MESSAGE'
  reportTargetId.value = msgId
}

// Sprint 6.2: düzenleme fonksiyonları
function startEdit(msg: MessageDto) {
  const text = editMention.prepareEdit(msg.content, dmUserName, () => undefined)
  editInitial = text
  editState.value = { messageId: msg.id, content: text, loading: false, error: '' }
}

function cancelEdit() {
  editState.value = null
}

async function saveEdit() {
  if (!editState.value || editState.value.loading) return
  const state = editState.value
  const trimmed = state.content.trim()
  if (!trimmed) return
  if (state.content === editInitial) {
    cancelEdit()
    return
  }
  state.loading = true
  state.error = ''
  try {
    const text = editMention.applyMentionTokens(trimmed)
    const target = messages.value.find((m) => m.id === state.messageId)
    // E1: şifreli mesaj düzenlemesi yeni ciphertext ile gider (PATCH ciphertext), düz içerik sunucuya gitmez.
    const updated = target?.encrypted
      ? await e2eeStore.editEncrypted(props.channel.id, state.messageId, text)
      : (await messagesApi.editMessage(props.channel.id, state.messageId, text)).data
    if (updated) messagesStore.updateMessage(updated)
    editState.value = null
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } } }
    const code = err.response?.data?.error
    state.error = code === 'MESSAGE_BLOCKED'
      ? t('message.errors.MESSAGE_BLOCKED')
      : t('common.error')
    state.loading = false
  }
}

function openDeleteConfirm(msgId: string) {
  deleteTargetId.value = msgId
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (!deleteTargetId.value) return
  deleteLoading.value = true
  try {
    await messagesApi.deleteMessage(props.channel.id, deleteTargetId.value)
    messagesStore.removeMessage(props.channel.id, deleteTargetId.value)
    void e2eeStore.forgetMessage(props.channel.id, deleteTargetId.value) // E5a §4.1
  } catch {
    // WS zaten kaldıracak; sessizce yut
  } finally {
    deleteLoading.value = false
    showDeleteConfirm.value = false
    deleteTargetId.value = null
  }
}

// Kullanıcı şikâyeti buradan kalktı (SPRINT_DM_MENU §4) — DM satırı menüsünde ve profil
// panelinde. Bu modal artık yalnız MESAJ şikâyetini taşıyor.

const messages = computed(() => messagesStore.messagesForChannel(props.channel.id))
// M6b §8.4: sesli mesaj sırası (biten ses → sıradaki)
useAudioQueue(() => props.channel.id, messages)
const hasMore = computed(() => messagesStore.hasMoreByChannel[props.channel.id] ?? false)
// E5b Parça C: cihaz öncesi mesajlar gizlendiyse (daha eskisi yokken) listenin başında tek satır.
const hiddenBefore = computed(() => messagesStore.hiddenBeforeDevice[props.channel.id] ?? false)
const e2eeView = useE2eeChannelView(() => props.channel.id, messages, hasMore)
// C64: üyelik olay satırlarının akıştaki yerleri (cihaz satırlarıyla aynı kural)
const groupEventSlotMap = computed(() =>
  groupEventSlots(groupEventsStore.byChannel[props.channel.id] ?? [], messages.value, hasMore.value),
)
/** "{ad} yeni bir cihaz ekledi" satırındaki ad: grup üyesi ya da 1-1'de karşı taraf; bilinmiyorsa null. */
function noticeName(userId: string): string | null {
  if (props.channel.type === 'GROUP_DM') return props.channel.members.find((m) => m.id === userId)?.username ?? null
  return props.channel.otherUser.id === userId ? props.channel.otherUser.username : null
}

// E5a §4.4-1: şifreli DM açıldığında (bu cihazda ilk kez) yedek kurulum sorusu; tek seferlik bayrak store'da.
// Yedek durumu motor açılışında asenkron gelir; ikisi de izlenir ki hangisi geç gelirse soru yine çıksın.
watch([() => e2eeView.encrypted.value, () => backupStore.state], ([enc]) => { if (enc) backupStore.maybePromptSetup() }, { immediate: true })

// E5a §4.4-3: geri yükleme bitince açık sohbet mesajları yeniden yüklenir (yeniden hidrate, yeni kayıtlarla).
watch(() => backupStore.restoreTick, () => { void messagesStore.fetchMessages(props.channel.id) })

watch(
  () => props.channel.id,
  async (id, oldId) => {
    if (oldId) { leaveChannel(oldId); voiceUnsubscribe(oldId) }
    if (!id) return
    // C62: eski üye soket odasına girmez, okundu yazmaz, sese abone olmaz (sunucuda hepsi 403); yalnız geçmişi okur.
    const departedNow = dmStore.isDeparted(id)
    if (!departedNow) {
      const ack = await joinChannel(id)
      realtimeError.value = !ack.ok
    } else {
      realtimeError.value = false
    }
    // E1: şifreli DM'de önce Welcome/commit'ler işlenir ki mesajlar doğru epoch'ta çözülsün.
    await e2eeStore.openChannel(id) // eski grupta no-op (depo kapısı)
    // 🔴 `stickToBottom` aşağıda `let` ile tanımlı: atama İLK await'ten SONRA olmalı (TDZ). C62 sahip bulgusu
    // 2026-11-13: eski grupta joinChannel await'i atlanınca atama kurulum sırasında çalıştı, ekran çöktü
    // ("Cannot access before initialization"). openChannel her yolda await eder (`ready`), atama onun arkasında.
    stickToBottom = true // yükleme/çözme sırasında büyüyen içerik dibe yapışsın
    if (props.channel.type === 'GROUP_DM') void groupEventsStore.load(id) // C64: üyelik olay satırları (eski grupta da)
    void noticesStore.load(id) // E2 §3.3: yerel depodan "yeni cihaz eklendi" satırları
    await messagesStore.fetchMessages(id)
    void e2eeStore.syncChannel(id) // E1: mesajlar çözüldükten SONRA commit senkronu (sıra önemli); eski grupta no-op
    await dmStore.markRead(id) // eski grupta store'da no-op
    // REV-11: bu kanalda devam eden çağrı var mı (snapshot) → "Sese Katıl" göster.
    // Ayrıca canlı presence'a abone ol → biri çıkınca voice.participant_left ile liste
    // güncellenir ("Sese katıl" takılı kalmaz). Guild'de VoiceParticipantList yapar; DM'de burada.
    if (!departedNow) {
      voiceStore.loadParticipants(id)
      voiceSubscribe(id)
    }
    stickToBottom = true
    await nextTick() // liste çizilmeden scrollHeight eski; önce DOM güncellensin
    scrollToBottom()
    // Önceki kanaldan kalan "en alta in" düğmesi yeni kanalda asılı kalmasın
    showScrollDown.value = false
  },
  { immediate: true },
)

// C12 §4.3 — bu DM AÇIKKEN gelen mesaj da anında okundu işaretlenir.
//
// Bu olmadan özellik yarım kalıyor: `markRead` yalnız kanal değişiminde çağrılıyordu, yani iki
// kişi de sohbete bakarken karşı tarafın tiki HİÇ çifte dönmezdi (en sık yaşanacak senaryo tam
// olarak bu). Tetikleyici son mesajın kimliği — uzunluk değil, çünkü eski mesaj yükleme (scroll
// ile geçmişe gitme) de uzunluğu artırıyor ve o bir okuma olayı değil.
//
// Kendi mesajım tetiklemez (zaten okumuş sayılıyorum) ve sekme arkadaysa çağrılmaz: arka planda
// okunmuş saymak, karşı tarafa yalan söylemek olurdu.
watch(
  () => messages.value[messages.value.length - 1]?.id,
  (lastId) => {
    if (!lastId) return
    const last = messages.value[messages.value.length - 1]
    if (!last || isMine(last) || isDeparted.value) return
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    dmStore.markRead(props.channel.id).catch(() => {})
  },
)

// REV-11: bu kanalda (1-1/grup) başkaları seste mi → ring yerine doğrudan "Sese Katıl"
const hasOngoingCall = computed(() => voiceStore.participantsFor(props.channel.id).length > 0)

// REV-11: grup ses. "Devam eden çağrıya katıl vs. yeni çağrı başlat" ayrımı ARTIK BURADA DEĞİL —
// useCall.startGroupCall içinde, tek noktada (PM 2026-08-07). Buradan yalnız niyet iletilir.
function onGroupVoiceClick() {
  void startGroupCall(props.channel.id)
}

// Görüntülü ara (1-1 DM): D39 §6 — oda-önce'de arayan hemen girdiği için niyet doğrudan
// join'e (startWithCamera) geçer; artık "kabul sonrası aç" diye saklanacak bir şey yok.
async function startVideoCall(channelId: string) {
  await startCall(channelId, { startWithCamera: true })
}

// Mesaja zıpla (pins/arama) — zıplama sırasında alta kaymayı bastır
const { isJumping } = useJumpToMessage(listEl, () => props.channel.id)

// REV-1: yeni mesajda dipteyse otomatik kay; geçmiş okurken/loadMore'da yakalamaya
// çalışma. length izlenir (appendMessage in-place push → referans değişmez, eski
// watch(messages) tetiklenmezdi).
let stickToBottom = true
// D50 — mobile useMessageListController'daki `loadingOlder` korumasının web karşılığı:
// `loadMore` (başa ekleme) sırasında uzunluk watcher'ı bastırılır. Guard olmadan watcher
// "kanalın en son mesajı çağırana mı ait" diye bakıp öyleyse listeyi dibe atıyordu — kullanıcı
// tam da o an eski mesajı okumaya çalışırken. Prepend, dipteki son mesajı DEĞİŞTİRMEZ; bu bayrak
// olmadan watcher'ın "mine" dalı yine de tetiklenirdi.
let loadingOlder = false
// REV-9: yukarıda geçmiş okurken gelen yeni mesaj sayısı → sağ-alt "aşağı in" butonu rozeti
const newMessageCount = ref(0)
// "En alta in" düğmesi: dipten bu kadar (px) uzaklaşınca görünür; küçük kaydırmada çıkmasın.
const SCROLL_DOWN_THRESHOLD = 300
const showScrollDown = ref(false)
function onListScroll() {
  const el = listEl.value
  if (!el) return
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  stickToBottom = distance < 120
  if (stickToBottom) newMessageCount.value = 0
  showScrollDown.value = distance > SCROLL_DOWN_THRESHOLD
}

// Sonradan büyüyen içerik (şifre çözme, görsel, ayraç/cihaz satırı) için dibe yapışma
useStickToBottom(listEl, () => stickToBottom, () => isJumping.value || loadingOlder)

watch(() => messages.value.length, async (n, o) => {
  if (isJumping.value || n <= o || loadingOlder) return
  // REV-9 fix: kendi mesajım (HTTP yanıtı VEYA WS eko) → her zaman dibe kay, bildirim sayma.
  const last = messages.value[messages.value.length - 1]
  const mine = last?.author.id === authStore.user?.id
  if (stickToBottom || mine) {
    newMessageCount.value = 0
    await nextTick()
    scrollToBottom()
  } else {
    // Yukarıda okuyorum + başkasının mesajı → kaydırma; gelenleri say
    newMessageCount.value += n - o
  }
}, { flush: 'post' })

function scrollToBottom() {
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
}

// REV-9: aşağı-in butonu → dibe kay + sayacı sıfırla
function jumpToBottom() {
  stickToBottom = true
  newMessageCount.value = 0
  listEl.value?.scrollTo({ top: listEl.value.scrollHeight, behavior: 'smooth' })
}

// D50 — "daha fazla yükle" başa ekleme yapar; scrollTop sabit kalırsa görünüm eklenen
// paketin tamamı kadar kayar (kullanıcı okuduğu yerden kopar). Yükseklik farkını telafi et:
// eski/yeni scrollHeight farkını scrollTop'a ekle, göz aynı içerikte kalsın.
async function loadMore() {
  if (!messages.value.length) return
  const el = listEl.value
  const prevScrollHeight = el?.scrollHeight ?? 0
  const prevScrollTop = el?.scrollTop ?? 0
  loadingOlder = true
  try {
    await messagesStore.fetchMessages(props.channel.id, messages.value[0].id)
    await nextTick()
    if (el) {
      el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight)
    }
  } finally {
    loadingOlder = false
  }
}

function openFilePicker() {
  fileInputEl.value?.click()
}

// GIF düğmesi: yalnız image/gif kabul eden ayrı seçici, sonrası aynı ek akışı
function openGifPicker() {
  gifInputEl.value?.click()
}

async function onAttachmentSent({ attachmentId, caption }: { attachmentId: string; caption: string }) {
  composeFile.value = null
  const replyId = replyingTo.value?.id
  replyingTo.value = null
  try {
    const data = await e2eeStore.send(props.channel.id, caption, replyId, [attachmentId])
    stickToBottom = true // kendi eki gönderdim → dibe kay
    messagesStore.appendMessage(data)
  } catch {
    // hata sessizce yutulur — modal zaten kapandı
  }
}

function send() {
  const hasText = content.value.trim()
  // Grup kanallarında canMessage kontrolü yok (backend kontrol eder)
  const canSend = !isDeparted.value && (isGroup.value || dmChannel.value?.canMessage)
  if (!hasText || !canSend) return
  stopTyping()
  sendError.value = ''
  // Sprint V2: @username → <@userId> dönüşümü gönderimden önce
  const text = mention.applyMentionTokens(content.value.trim())
  mention.clearPending()
  content.value = ''
  void nextTick(resetComposerHeight) // REV-2: gönderince büyüyen textarea normale dönsün
  const reply = replyingTo.value
  replyingTo.value = null
  stickToBottom = true // kendi mesajım → her zaman dibe kay
  // C29: geçici mesaj anında listeye girer; sonuç/hata mesajın kendi altında gösterilir.
  optimistic.sendText(props.channel.id, text, reply)
}

function onKeydown(e: KeyboardEvent) {
  // Sprint V2: mention popover açıkken ↑/↓/Enter/Tab/Esc → autocomplete'e yönlendir
  if (mention.onKeydown(e)) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function onDmTextareaInput() {
  sendError.value = ''
  onTypingInput()
  const el = dmTextareaEl.value
  if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
  // Sprint V2: mention autocomplete tetikle
  mention.onInput()
}

// REV-2: gönderim sonrası textarea'yı tek satıra döndür
function resetComposerHeight() {
  if (dmTextareaEl.value) dmTextareaEl.value.style.height = 'auto'
}

function isMine(msg: MessageDto): boolean {
  return msg.author.id === authStore.user?.id
}

/**
 * C12 §4.2 — bir mesajın okundu göstergesi. null dönerse tik HİÇ çizilmez.
 *
 * Kurallar burada değil, sunucunun verdiği `otherReadAt`te toplanıyor (`visibleReadAt`, R7):
 * alan null geldiyse `showsReceipts` false döner ve gösterge tamamen kaybolur. Bu bilinçli —
 * "tek tikte donmuş" bir gösterge, gizliliğin kapalı olduğunu sızdırmadan yanlış bilgi verirdi.
 * Grup DM (C34): çift tik = uygun üyelerin HEPSİ okudu (`groupAllReadAt`); ara durum yok.
 * Yalnız iki durum: 'sent' (gönderildi) ve 'seen' (okundu). Ortam kanalında tik yok (bu bileşen DM'e özel).
 */
function messageReceipt(msg: MessageDto): 'sent' | 'seen' | null {
  if (!isMine(msg)) return null
  // C67 (sahip kararı): grupta çift tik YOK (okuyanlar avatarla gösterilir), kendi mesajımda tek tik kalır.
  if (props.channel.type !== 'DM') return 'sent'
  // 1-1 DM: C12 davranışı. Kapı kapalıysa tek tik; açıksa `createdAt <= otherReadAt` → çift tik.
  if (!dmStore.showsReceipts(props.channel.id)) return 'sent'
  return dmStore.isSeen(props.channel.id, msg.createdAt) ? 'seen' : 'sent'
}

// C67 — görüldü avatarları. Okuyucu = kanalın güncel üyesi (grupta `members`, 1-1'de `otherUser`); kim görünür
// kararı sunucuda (`seenBy` yalnız görebildiklerimi taşır). Avatar, `createdAt <= readAt` olan EN SON mesajın altına
// konur (yazarı kim olursa olsun); gönderilmemiş (yerel) mesaj sayılmaz. Eski grupta hiçbir şey çizilmez.
const seenReaderPool = computed<Map<string, { username: string; avatarUrl: string | null }>>(() => {
  const pool = new Map<string, { username: string; avatarUrl: string | null }>()
  if (props.channel.type === 'DM') {
    const o = props.channel.otherUser
    pool.set(o.id, { username: o.username, avatarUrl: o.avatarUrl })
  } else {
    for (const m of props.channel.members) pool.set(m.id, { username: m.username, avatarUrl: m.avatarUrl })
  }
  return pool
})

/** mesaj kimliği → o mesajın altındaki okuyucular (eskiden yeniye: en yeni okuyan sağda). */
const seenByMessage = computed<Map<string, SeenReader[]>>(() => {
  const out = new Map<string, SeenReader[]>()
  if (isDeparted.value || props.channel.type !== 'GROUP_DM') return out // C67: avatar yalnız grup DM'de
  const myId = authStore.user?.id
  const sent = messages.value.filter((m) => !m.localStatus)
  const entries = [...(props.channel.seenBy ?? [])].sort((a, b) => (a.readAt < b.readAt ? -1 : a.readAt > b.readAt ? 1 : 0))
  for (const s of entries) {
    const who = seenReaderPool.value.get(s.userId)
    if (!who || s.userId === myId) continue
    for (let i = sent.length - 1; i >= 0; i--) {
      if (sent[i].createdAt <= s.readAt) {
        const list = out.get(sent[i].id) ?? []
        list.push({ userId: s.userId, username: who.username, avatarUrl: who.avatarUrl, readAt: s.readAt })
        out.set(sent[i].id, list)
        break
      }
    }
  }
  return out
})

// FLIP (250 ms, ease-out): bir okuyucunun avatarı başka mesajın altına geçince eski konumundan yeni konumuna kayar.
// Konumlar LİSTE İÇERİĞİNE göre (scrollTop dahil) tutulur: kaydırma/dibe yapışma animasyonu bozmaz; transform
// yerleşimi etkilemediği için scrollHeight değişmez. `prefers-reduced-motion` açıksa animasyon yok.
const SEEN_MOVE_MS = 250
const seenLayoutKey = computed(() => {
  const parts: string[] = []
  for (const [msgId, readers] of seenByMessage.value) for (const r of readers) parts.push(`${r.userId}:${msgId}`)
  return `${props.channel.id}|${parts.sort().join(',')}`
})
function seenAvatarRects(): Map<string, { top: number; left: number }> {
  const out = new Map<string, { top: number; left: number }>()
  const list = listEl.value
  if (!list) return out
  const base = list.getBoundingClientRect()
  list.querySelectorAll<HTMLElement>('[data-seen-user]').forEach((el) => {
    const r = el.getBoundingClientRect()
    out.set(el.dataset.seenUser ?? '', { top: r.top - base.top + list.scrollTop, left: r.left - base.left })
  })
  return out
}
let seenFirst = new Map<string, { top: number; left: number }>()
let seenFirstChannel = ''
watch(seenLayoutKey, () => {
  seenFirst = seenAvatarRects() // DOM henüz eski: "first"
  seenFirstChannel = props.channel.id
}, { flush: 'pre' })
watch(seenLayoutKey, () => {
  const list = listEl.value
  const sameChannel = seenFirstChannel === props.channel.id
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!list || !sameChannel || reduced) return
  const last = seenAvatarRects()
  list.querySelectorAll<HTMLElement>('[data-seen-user]').forEach((el) => {
    const id = el.dataset.seenUser ?? ''
    const from = seenFirst.get(id)
    const to = last.get(id)
    if (!from || !to) return
    const dx = from.left - to.left
    const dy = from.top - to.top
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
    el.style.zIndex = '10'
    const anim = el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
      { duration: SEEN_MOVE_MS, easing: 'ease-out' },
    )
    const done = () => { el.style.zIndex = '' }
    anim.onfinish = done
    anim.oncancel = done
  })
}, { flush: 'post' })

// Sprint V2 Pins: DM/grup DM'de herkes sabitleyebilir (§2)
const showDmPins = ref(false)

function toggleDmPins(e: MouseEvent) {
  e.stopPropagation()
  showDmPins.value = !showDmPins.value
}

// Sprint V2 Search: DM/grup DM mesaj araması
const showDmSearch = ref(false)

function toggleDmSearch(e: MouseEvent) {
  e.stopPropagation()
  showDmSearch.value = !showDmSearch.value
}

async function onPinMessage(messageId: string) {
  try {
    await messagesApi.pinMessage(props.channel.id, messageId)
    // State güncellemesi WS message.pinned ile gelir; popover da WS refresh ile tazelenir
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } } }
    if (err.response?.data?.error === 'PIN_LIMIT') {
      // PIN_LIMIT hatasını kullanıcıya gösterecek bir mekanizma yok şimdi;
      // WS echo gelmediği için store değişmez — kullanıcı zaten menüyü açar ve sabitleme olmaz.
      // Geliştirme notu: sonraki dalga — toast/snackbar ile göster.
    }
  }
}

async function onUnpinMessage(messageId: string) {
  try {
    await messagesApi.unpinMessage(props.channel.id, messageId)
  } catch {
    // sessizce yut — WS echo gelmezse state değişmez
  }
}

// formatTime: DM input bandında hâlâ kullanılmıyor ama MessageRow içinde kendi formatTime'ı var.
// Silmek yerine kullanılmayan olarak işaretle — TypeScript strict modunda kaldır.
// function formatTime(iso: string): string {
//   return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
// }

// 🔴 "Sohbeti Temizle" buradan KALKTI (SPRINT_DM_MENU §4) — akış DM satırı menüsünde
// (`DmList` + `useDmMenuActions`). Aktif DM temizlenince ana sayfaya dönüş davranışı orada
// korunuyor; burada ikinci bir kopya bırakılmadı.

async function unblockUser() {
  if (!dmChannel.value) return
  unblocking.value = true
  try {
    await friendsStore.unblockUser(dmChannel.value.otherUser.id)
    await dmStore.fetchChannels()
  } finally {
    unblocking.value = false
  }
}

// Mesaj inputu için placeholder
const inputPlaceholder = computed(() => {
  if (isGroup.value) {
    const name = groupDisplayName.value || t('group.noName')
    return t('dm.groupPlaceholder', { name })
  }
  return t('dm.placeholder', { user: dmChannel.value?.otherUser.username ?? '' })
})

// 1-1 DM: mesaj gönderme aktif mi?
const canMessage = computed(
  () => !isDeparted.value && (isGroup.value || (dmChannel.value?.canMessage ?? false)),
)
const selfBlocked = computed(() => dmChannel.value?.selfBlocked ?? false)

// C62: ayrılma bandı metni + "Sohbeti sil" (onaylı). Silince store'dan düşer, ana DM ekranına dönülür.
const departedNotice = computed(() =>
  departure.value ? t(`group.departed.${departure.value.reason}`) : '',
)
const showDeleteDeparted = ref(false)
const deletingDeparted = ref(false)
async function confirmDeleteDeparted() {
  deletingDeparted.value = true
  try {
    await dmStore.deleteDeparture(props.channel.id)
    void router.push({ name: 'app' })
  } catch {
    toast.error(t('group.departed.deleteError'))
  } finally {
    deletingDeparted.value = false
    showDeleteDeparted.value = false
  }
}

// Compose emoji picker (aç/kapa ComposerBar'da; imlece yerleştirme burada)
function onDmComposeEmojiSelect(emoji: string) {
  const el = dmTextareaEl.value
  if (!el) {
    content.value += emoji
    return
  }
  const start = el.selectionStart ?? content.value.length
  const end = el.selectionEnd ?? content.value.length
  content.value = content.value.slice(0, start) + emoji + content.value.slice(end)
  nextTick(() => {
    el.focus()
    const pos = start + emoji.length
    el.setSelectionRange(pos, pos)
  })
}

onUnmounted(() => {
  voiceUnsubscribe(props.channel.id)
})

// Gruplama: mesaj grup başı mı?
// Kural: ilk mesaj VEYA önceki yazarı farklı VEYA öncekinden > 7 dakika geçmişse → grup başı.
// C11 §3: tarih ayracı grubu BÖLER — ayraçtan sonraki ilk mesaj aynı yazara ait olsa bile tam
// başlıkla (avatar + ad) çizilir, yoksa ayracın altında sahipsiz bir gövde kalırdı.
function isGroupStart(index: number): boolean {
  if (index === 0) return true
  const cur = messages.value[index]
  const prev = messages.value[index - 1]
  if (isNewDay(cur.createdAt, prev.createdAt)) return true
  if (cur.author.id !== prev.author.id) return true
  const diffMs = new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime()
  return diffMs > 7 * 60 * 1000
}

// C11 — tarih ayraçları listeden TÜRETİLİR (diziye gömülmez): her hesaplamada komşu
// karşılaştırması yapılır, böylece eski paket başa eklendiğinde ayraçlar kendiliğinden doğru
// yere kayar. `null` = o mesajın üstünde ayraç yok. (1-1 DM ve grup DM aynı listeyi kullanır.)
const dayLabels = computed<(string | null)[]>(() =>
  messages.value.map((msg, index) =>
    isNewDay(msg.createdAt, messages.value[index - 1]?.createdAt)
      ? dayDividerLabel(msg.createdAt, t)
      : null,
  ),
)
</script>

<template>
  <div class="flex flex-1 min-w-0 overflow-hidden gap-4">
    <!-- Ana sohbet alanı -->
    <div
      class="relative flex flex-col flex-1 min-w-0 overflow-hidden mb-4 rounded-[var(--kv-radius-lg)]"
      style="background-color: var(--kv-bg-content);"
      @paste="intake.onPaste"
      @dragenter="intake.onDragEnter"
      @dragover="intake.onDragOver"
      @dragleave="intake.onDragLeave"
      @drop="intake.onDrop"
    >
      <div
        v-if="intake.dragging.value"
        class="absolute inset-0 z-40 flex items-center justify-center pointer-events-none rounded-[var(--kv-radius-lg)]"
        style="background-color: color-mix(in srgb, var(--kv-bg-rail) 75%, transparent); border: 2px dashed var(--kv-accent-500);"
      >
        <p class="text-[16px] font-semibold" style="color: var(--kv-text-primary);">{{ t('attachment.dropHint') }}</p>
      </div>
      <!-- Başlık çubuğu -->
      <div
        class="flex items-center px-4 gap-3 shrink-0 border-b rounded-t-[var(--kv-radius-lg)]"
        style="height: var(--kv-header-height); border-color: var(--kv-border-subtle); background-color: var(--kv-bg-content);"
      >
        <!-- 1-1 DM başlığı -->
        <template v-if="dmChannel">
          <div
            class="w-8 h-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[12px] font-bold text-white"
            style="background-color: var(--kv-accent-500);"
          >
            <img
              v-if="dmChannel.otherUser.avatarUrl"
              :src="dmChannel.otherUser.avatarUrl"
              :alt="dmChannel.otherUser.username"
              class="w-full h-full object-cover"
            />
            <span v-else>{{ dmChannel.otherUser.username[0].toUpperCase() }}</span>
          </div>
          <div class="flex-1 min-w-0 flex flex-col justify-center">
            <span class="flex items-center gap-1.5 min-w-0">
              <span class="text-[15px] font-semibold truncate leading-[1.25]" style="color: var(--kv-text-primary);">
                {{ dmChannel.otherUser.username }}
              </span>
              <button
                v-if="e2eeView.encrypted.value"
                class="inline-flex items-center cursor-pointer rounded-[var(--kv-radius-sm)] p-0.5 hover:bg-[var(--kv-bg-elevated)]"
                :title="t('e2ee.identity.openCode')"
                :aria-label="t('e2ee.identity.openCode')"
                @click="safetyOpen = true"
              ><E2eeLockIcon /></button>
            </span>
            <span
              v-if="dmPresenceColor && dmPresence"
              class="text-[11px] truncate leading-[1.2]"
              :style="`color: ${dmPresenceColor};`"
            >
              {{ t(`presence.${dmPresence}`) }}
            </span>
          </div>
          <!-- REV-5: arkadaş değilse "Arkadaş ekle" (Sprint 4A by-user; ret jenerik)
               M1d-0 R1 (2026-07-31): `xl:hidden` — bu düğme YALNIZ sağ profil paneli gizliyken görünür.
               Sahip "mobilde olduğu gibi web'de de ikinci kapıyı kaldıralım, profil kartından ekleniyor"
               dedi; ölçtüm, **≥1280'de doğru ama altında DEĞİL**: `DmView` panelini `max-xl:hidden` ile
               gizliyor ve panelin dar ekranda açılacağı bir toggle YOK. Ekleme kartı (`FullProfileModal`)
               yalnız o panelden açılıyor, DM başlığındaki ad tıklanabilir değil, DM baloncuklarında
               `UserCardPopover` yok → düğme kaldırılsaydı <1280'de ekleme yolu HİÇ kalmazdı (TR trafiği
               mobil ağırlıklı, D22). Bu yüzden tamamen silinmedi, yalnız **çift göründüğü yerde** kalktı.
               `hidden xl:*` kalıbı bilinçle kullanılmadı (eklenti `.hidden` çakışması — DmView'daki not). -->
          <button
            v-if="showAddFriend"
            class="xl:hidden w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors disabled:opacity-60"
            style="color: var(--kv-accent-500); background-color: var(--kv-accent-subtle);"
            :title="t('friends.add')"
            :aria-label="t('friends.add')"
            :disabled="addingFriend"
            @click="addFriendInDm"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
          </button>
          <span
            v-else-if="dmChannel && addFriendSent && !isFriendInDm"
            class="xl:hidden text-[12px] px-1"
            style="color: var(--kv-text-muted);"
          >{{ t('friends.requestSent') }}</span>
          <!-- Sesli arama (1-1): aktif çağrı→Sese Katıl · yoksa→telefon (ring).
               D39 §5: çalıyorken de zaten bağlıyız (oda-önce) → "Bu kanala bağlıyken buton yok
               (kontroller DmCallPanel'de)" aşağıdaki tüm dallar için geçerli; "çalıyor" göstergesi
               artık ayrı bir başlık düğmesi değil, DmCallPanel'in bekleyen-katılımcı kutucuğunda. -->
          <!-- REV-11: devam eden çağrı → ring yerine doğrudan katıl -->
          <button
            v-if="!voiceStore.isConnectedTo(channel.id) && hasOngoingCall"
            class="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors"
            style="color: var(--kv-online, #3DB46E);"
            :title="t('call.joinGroup')"
            @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-content)'"
            @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'transparent'"
            @click="voiceStore.join(channel.id, { autoEndWhenAlone: true })"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            {{ t('call.joinGroup') }}
          </button>
          <button
            v-else-if="!voiceStore.isConnectedTo(channel.id)"
            class="w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
            style="color: var(--kv-text-muted);"
            :title="t('call.callButton')"
            @mouseenter="($event.currentTarget as HTMLElement).style.color = 'var(--kv-online, #3DB46E)'"
            @mouseleave="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-muted)'"
            @click="startCall(channel.id)"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </button>
          <!-- Görüntülü ara (1-1 DM, boşta): camcorder ikonu; join + startWithCamera niyeti -->
          <button
            v-if="!voiceStore.isConnectedTo(channel.id) && !callStore.isRinging(channel.id) && !hasOngoingCall && channel.type === 'DM'"
            class="w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
            style="color: var(--kv-text-muted);"
            :title="t('call.videoCall')"
            @mouseenter="($event.currentTarget as HTMLElement).style.color = 'var(--kv-accent-500)'"
            @mouseleave="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-muted)'"
            @click="startVideoCall(channel.id)"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
          </button>
          <!-- Sabitlenen mesajlar butonu -->
          <div class="relative">
            <button
              class="w-8 h-8 flex items-center justify-center text-[16px] rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
              :class="showDmPins ? 'bg-[var(--kv-accent-subtle)]' : ''"
              :style="showDmPins ? 'color: var(--kv-accent-500);' : 'color: var(--kv-text-muted);'"
              :title="t('message.pinnedMessages')"
              @mouseenter="!showDmPins && (($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-primary)')"
              @mouseleave="!showDmPins && (($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-muted)')"
              @click="toggleDmPins"
            >
              📌
            </button>
            <PinsPopover
              :channel-id="channel.id"
              :open="showDmPins"
              @close="showDmPins = false"
            />
          </div>
          <!-- 🔴 Mesajlarda Ara 1-1 DM'de KALDIRILDI (sahip kararı 2026-08-01). Gerekçe: arama
               ortam kanallarında değerli (çok kişi, çok gün, kaybolan mesaj); 1-1 DM'de karşında
               tek kişi var ve konuşma zaten doğrusal — buton yer kaplıyor, işi görülmüyor.
               GRUP DM'de KALIYOR (aşağıdaki blok) ve ortam kanallarında da kalıyor.
               Aynı kaldırma mobilde de yapıldı; iki istemci ayrışmasın. -->
          <!-- Profil paneli toggle (Sprint WEB-PARITE §4): YALNIZ <1280 — o genişlikte panel
               `DmView`'da overlay olarak açılıyor, ≥1280'de zaten sabit duruyor (çift giriş yok).
               `hidden xl:*` kalıbı bilinçle kullanılmadı (eklenti `.hidden` çakışması). -->
          <button
            class="xl:hidden w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
            :class="profilePanelOpen ? 'bg-[var(--kv-accent-subtle)]' : ''"
            :style="profilePanelOpen ? 'color: var(--kv-accent-500);' : 'color: var(--kv-text-muted);'"
            :title="t('dm.profilePanel')"
            :aria-label="t('dm.profilePanel')"
            :aria-expanded="profilePanelOpen === true"
            @mouseenter="!profilePanelOpen && (($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-primary)')"
            @mouseleave="!profilePanelOpen && (($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-muted)')"
            @click="emit('toggleProfile')"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </button>
          <!-- 🔴 "Kullanıcıyı şikâyet et" ve "Sohbeti Temizle" METİN butonları KALDIRILDI
               (SPRINT_DM_MENU §4): ikon şeridinin arasında sırıtıyorlardı. İkisi de DM satırı
               sağ-tık menüsüne taşındı; şikâyet ayrıca profil panelinde de var. Erişim
               kaybolmadı — menü her genişlikte açılıyor (T&S: güvenlik aksiyonu kaybolmaz). -->
        </template>

        <!-- GROUP_DM başlığı -->
        <template v-else-if="groupChannel">
          <!-- Grup ikonu (küçük çoklu avatar, 2 çember) -->
          <div class="relative w-9 h-8 shrink-0">
            <div
              v-if="groupChannel.members[1]"
              class="absolute bottom-0 right-0 w-6 h-6 rounded-full overflow-hidden border-2 flex items-center justify-center text-[9px] font-semibold text-white"
              style="background-color: var(--kv-accent-500); border-color: var(--kv-bg-content);"
            >
              <img v-if="groupChannel.members[1].avatarUrl" :src="groupChannel.members[1].avatarUrl" :alt="groupChannel.members[1].username" class="w-full h-full object-cover" />
              <span v-else>{{ groupChannel.members[1].username[0].toUpperCase() }}</span>
            </div>
            <div
              class="absolute top-0 left-0 w-6 h-6 rounded-full overflow-hidden border-2 flex items-center justify-center text-[9px] font-semibold text-white"
              style="background-color: var(--kv-accent-500); border-color: var(--kv-bg-content);"
            >
              <img v-if="groupChannel.members[0]?.avatarUrl" :src="groupChannel.members[0].avatarUrl" :alt="groupChannel.members[0].username" class="w-full h-full object-cover" />
              <span v-else>{{ (groupChannel.members[0]?.username ?? '?')[0].toUpperCase() }}</span>
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <p class="flex items-center gap-1.5 min-w-0 text-[15px] font-semibold" style="color: var(--kv-text-primary);">
              <span class="truncate">{{ groupDisplayName }}</span>
              <button
                v-if="e2eeView.encrypted.value"
                class="inline-flex items-center cursor-pointer rounded-[var(--kv-radius-sm)] p-0.5 hover:bg-[var(--kv-bg-elevated)]"
                :title="t('e2ee.identity.openCode')"
                :aria-label="t('e2ee.identity.openCode')"
                @click="safetyOpen = true"
              ><E2eeLockIcon /></button>
            </p>
            <p class="text-[12px]" style="color: var(--kv-text-muted);">
              {{ t('group.memberCount', { n: groupChannel.members.length }) }}
            </p>
          </div>
          <!-- Grup sesli sohbet: sese katıl (zaten bağlıysa gizli — kontrol barda) -->
          <button
            v-if="!voiceStore.isConnectedTo(channel.id) && !isDeparted"
            class="flex items-center gap-1.5 text-[13px] px-2.5 py-1.5 rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors"
            style="color: var(--kv-online, #3DB46E);"
            :title="t('call.joinGroup')"
            @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-content)'"
            @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'transparent'"
            @click="onGroupVoiceClick"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
            {{ t('call.joinGroup') }}
          </button>
          <!-- Sabitlenen mesajlar butonu (GROUP_DM; eski üyede yok: C62) -->
          <div v-if="!isDeparted" class="relative">
            <button
              class="w-8 h-8 flex items-center justify-center text-[16px] rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
              :class="showDmPins ? 'bg-[var(--kv-accent-subtle)]' : ''"
              :style="showDmPins ? 'color: var(--kv-accent-500);' : 'color: var(--kv-text-muted);'"
              :title="t('message.pinnedMessages')"
              @mouseenter="!showDmPins && (($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-primary)')"
              @mouseleave="!showDmPins && (($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-muted)')"
              @click="toggleDmPins"
            >
              📌
            </button>
            <PinsPopover
              :channel-id="channel.id"
              :open="showDmPins"
              @close="showDmPins = false"
            />
          </div>
          <!-- Mesajlarda Ara butonu (GROUP_DM; eski üyede yok: C62) -->
          <div v-if="!isDeparted" class="relative">
            <button
              class="w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
              :class="showDmSearch ? 'bg-[var(--kv-accent-subtle)]' : ''"
              :style="showDmSearch ? 'color: var(--kv-accent-500);' : 'color: var(--kv-text-muted);'"
              :title="t('messageSearch.buttonTitle')"
              @mouseenter="!showDmSearch && (($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-primary)')"
              @mouseleave="!showDmSearch && (($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-muted)')"
              @click="toggleDmSearch"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </button>
            <SearchPopover
              :channel-id="channel.id"
              :open="showDmSearch"
              @close="showDmSearch = false"
            />
          </div>
          <!-- Üye panelini aç/kapat (eski üyede yok: C62) -->
          <button
            v-if="!isDeparted"
            :class="[
              'px-3 py-1 text-[13px] rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer',
              showGroupPanel
                ? 'bg-[var(--kv-accent-subtle)] text-[var(--kv-accent-500)]'
                : 'text-[var(--kv-text-secondary)] hover:text-[var(--kv-text-body)]',
            ]"
            @click="toggleGroupPanel"
          >
            {{ t('group.members') }}
          </button>
        </template>
      </div>

      <!-- Gerçek zamanlı hata bandı -->
      <div
        v-if="realtimeError"
        class="shrink-0 px-4 py-2 text-[13px] text-center"
        style="background-color: var(--kv-warning); color: var(--kv-bg-rail);"
      >
        {{ t('message.realtimeError') }}
      </div>

      <!-- E1: tanınmayan cihaz / cihaz çıkarıldı uyarısı (mesajlaşma durur) -->
      <!-- C62: ayrıldığım grupta cihaz bandı gösterilmez (tek band: aşağıdaki "artık mesaj gönderemezsin") -->
      <E2eeWarningBanner v-if="e2eeView.warning.value && !isDeparted" :kind="e2eeView.warning.value" />

      <!-- Aktif sesli arama kartı (kabul edilince mesajların üstünde) -->
      <DmCallPanel v-if="!isDeparted" :channel-id="channel.id" />

      <!-- Mesaj listesi (Discord stili — baloncuk yok, sola yaslı düz liste) -->
      <div class="relative flex-1 min-h-0 flex flex-col">
      <div ref="listEl" class="flex-1 overflow-y-auto py-4 flex flex-col" @scroll="onListScroll">
        <div v-if="hasMore" class="flex justify-center py-2">
          <button
            class="text-[13px] hover:underline cursor-pointer"
            style="color: var(--kv-accent-400);"
            @click="loadMore"
          >
            {{ t('message.loadMore') }}
          </button>
        </div>
        <p
          v-if="!hasMore && hiddenBefore"
          class="text-center text-[13px] px-4"
          :class="messages.length ? 'py-2' : 'py-8'"
          style="color: var(--kv-text-muted);"
        >
          {{ t('e2ee.backup.history.hiddenNote') }}
        </p>
        <p
          v-else-if="!messages.length"
          class="text-center text-[14px] py-8"
          style="color: var(--kv-text-muted);"
        >
          {{ t('dm.empty') }}
        </p>

        <template v-for="(msg, index) in messages" :key="msg.nonce ?? msg.id">
        <!-- C11: gün değişiminde ayraç (Bugün · Dün · 25 Ekim 2026) -->
        <DateDivider v-if="dayLabels[index]" :label="dayLabels[index] || ''" />
        <E2eeDivider v-if="e2eeView.dividerIndex.value === index" />
        <E2eeDeviceNotice v-for="n in e2eeView.deviceNotices.value.get(index)" :key="`${n.userId}-${n.at}`" :name="noticeName(n.userId)" :kind="n.kind" />
        <GroupEventNotice v-for="ev in groupEventSlotMap.get(index)" :key="ev.id" :event="ev" />
        <MessageRow
          :message="msg"
          :is-mine="isMine(msg)"
          :is-group-start="isGroupStart(index)"
          :mention-resolver="dmMentionResolver"
          :is-mentioned="isDmMentioned(msg)"
          :can-pin="!isDeparted"
          :can-reply="!isDeparted"
          :read-only="isDeparted"
          :can-manage-messages="!isDeparted && canDeleteOthers(msg)"
          :receipt="messageReceipt(msg)"
          @reply="startReply"
          @forward="(m) => { forwardMsg = m; showForward = true }"
          @edit="startEdit"
          @delete="openDeleteConfirm"
          @report="openReportMessage"
          @add-reaction="(_msgId, emoji) => pickDmEmoji(msg, emoji)"
          @view-reactions="reactionsMsgId = msg.id"
          @pin="onPinMessage"
          @unpin="onUnpinMessage"
          @retry="optimistic.retry"
          @discard="optimistic.discard"
        >
          <!-- Reaksiyon pill'leri -->
          <template #reactions>
            <ReactionPill
              v-for="reaction in msg.reactions"
              :key="reaction.emoji"
              compact
              :reaction="reaction"
              :channel-id="props.channel.id"
              :message-id="msg.id"
              @toggle="toggleDmReaction(msg, reaction.emoji, reaction.reactedByMe)"
            />
          </template>
        </MessageRow>
        <SeenAvatars v-if="seenByMessage.has(msg.id)" :readers="seenByMessage.get(msg.id) ?? []" />
        </template>
        <E2eeDivider v-if="e2eeView.dividerIndex.value === messages.length" />
        <E2eeDeviceNotice v-for="n in e2eeView.deviceNotices.value.get(messages.length)" :key="`${n.userId}-${n.at}`" :name="noticeName(n.userId)" :kind="n.kind" />
        <GroupEventNotice v-for="ev in groupEventSlotMap.get(messages.length)" :key="ev.id" :event="ev" />
      </div>

      <!-- En alta in: yukarı kaydırınca görünür; yukarıdayken gelen mesaj sayısı rozette (REV-9) -->
      <ScrollToBottomButton
        v-if="showScrollDown || newMessageCount > 0"
        :count="newMessageCount"
        @click="jumpToBottom"
      />
      </div>

      <!-- Mesaj input / Engel bandı -->
      <div class="px-4 pb-4 pt-2 shrink-0">
        <!-- Gönderme hatası -->
        <div
          v-if="sendError"
          class="px-1 mb-1 text-[13px]"
          style="color: var(--kv-danger);"
        >
          {{ sendError }}
        </div>
        <!-- Yazıyor göstergesi -->
        <div
          v-if="typingLabel"
          class="h-5 px-1 mb-1 text-[12px] italic"
          style="color: var(--kv-text-muted);"
        >
          {{ typingLabel }}
        </div>

        <!-- C62: ayrıldığım/çıkarıldığım grup, composer yerine tek band + "Sohbeti sil" -->
        <div
          v-if="isDeparted"
          class="flex items-center justify-center gap-3 py-3 rounded-[var(--kv-radius-md)] text-[13px]"
          style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
        >
          <span>{{ departedNotice }}</span>
          <button
            class="text-[13px] font-medium underline cursor-pointer transition-opacity hover:opacity-80"
            style="color: var(--kv-danger);"
            @click="showDeleteDeparted = true"
          >
            {{ t('group.departed.delete') }}
          </button>
        </div>

        <!-- 1-1 DM: canMessage=false bandı -->
        <div
          v-else-if="!canMessage"
          class="flex items-center justify-center gap-3 py-3 rounded-[var(--kv-radius-md)] text-[13px]"
          style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
        >
          <span v-if="selfBlocked">{{ t('dm.selfBlocked') }}</span>
          <span v-else>{{ t('dm.cannotMessage') }}</span>
          <button
            v-if="selfBlocked"
            class="text-[13px] font-medium underline cursor-pointer transition-opacity hover:opacity-80"
            :class="unblocking ? 'opacity-60 pointer-events-none' : ''"
            style="color: var(--kv-accent-500);"
            @click="unblockUser"
          >
            {{ t('dm.unblock') }}
          </button>
        </div>

        <!-- Normal input -->
        <div v-else>
          <!-- Gizli dosya input -->
          <input
            ref="fileInputEl"
            type="file"
            class="hidden"
            :accept="ATTACHMENT_ACCEPT"
            @change="onFileSelected"
          />
          <input
            ref="gifInputEl"
            type="file"
            class="hidden"
            accept="image/gif"
            @change="onFileSelected"
          />

          <!-- Yanıt önizleme bandı: yazar + tek satır metin, ekli mesajda küçük önizleme -->
          <div
            v-if="replyingTo"
            class="flex items-center gap-2 p-1.5 rounded-t-[var(--kv-radius-sm)]"
            style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle); border-bottom: none;"
          >
            <ReplyQuote
              class="flex-1"
              style="background-color: var(--kv-bg-content);"
              :author="replyingTo.author.username"
              :text="formatMentionsPlain(replyingTo.content, dmMentionResolver, t('mention.unknown'))"
              :attachment="replyingTo.attachments?.[0] ?? null"
              :lines="1"
            >
              <template #author>{{ t('reply.to', { author: replyingTo.author.username }) }}</template>
            </ReplyQuote>
            <button
              class="shrink-0 px-1.5 cursor-pointer hover:opacity-80 transition-opacity"
              style="color: var(--kv-text-muted);"
              :title="t('reply.cancel')"
              @click="cancelReply"
            >
              ✕
            </button>
          </div>

          <ComposerBar
            ref="composerEl"
            v-model="content"
            :placeholder="inputPlaceholder"
            :mention="mention"
            :rounded-bottom-only="!!replyingTo"
            @keydown="onKeydown"
            @input="onDmTextareaInput"
            @blur="stopTyping"
            @pick-file="openFilePicker"
            @pick-gif="openGifPicker"
            @emoji="onDmComposeEmojiSelect"
            @ai-attachment="(id) => onAttachmentSent({ attachmentId: id, caption: '' })"
          />
        </div>
      </div>
    </div>

    <!-- Grup yönetim paneli (sağ kenar) -->
    <GroupManagePanel
      v-if="isGroup && showGroupPanel && groupChannel && !isDeparted"
      :group-id="groupChannel.id"
      :owner-id="groupChannel.ownerId"
      :admin-ids="groupChannel.adminIds"
      :members="groupChannel.members"
      @close="closeGroupPanel"
    />
  </div>

  <!-- C62: eski grup sohbetini sil onayı -->
  <ConfirmDialog
    v-if="showDeleteDeparted"
    :message="t('group.departed.deleteConfirm')"
    :confirm-label="t('group.departed.deleteAction')"
    :loading="deletingDeparted"
    @confirm="confirmDeleteDeparted"
    @cancel="showDeleteDeparted = false"
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

  <!-- Dosya compose modal -->
  <AttachmentComposeModal
    v-if="composeFile"
    :file="composeFile"
    :channel-id="channel.id"
    @sent="onAttachmentSent"
    @close="composeFile = null"
  />

  <!-- Şikâyet modalı (mesaj veya kullanıcı) -->
  <ReportModal
    v-if="reportTargetId"
    :target-type="reportTargetType"
    :target-id="reportTargetId"
    :channel-id="channel.id"
    @close="reportTargetId = null"
  />

  <!-- D96: düzenleme katmanı -->
  <MessageEditModal
    v-if="editState && editTarget"
    v-model="editState.content"
    :message="editTarget"
    :loading="editState.loading"
    :error="editState.error"
    :mention-resolver="dmMentionResolver"
    @save="saveEdit"
    @cancel="cancelEdit"
  />

  <ForwardMessageModal
    v-if="showForward && forwardMsg"
    :message="forwardMsg"
    @close="showForward = false"
  />

  <ReactionsModal
    v-if="reactionsMsgId"
    :channel-id="channel.id"
    :message-id="reactionsMsgId"
    @close="reactionsMsgId = null"
  />

  <SafetyCodeModal v-if="safetyOpen" :members="dmMentionMembers" @close="safetyOpen = false" />
</template>
