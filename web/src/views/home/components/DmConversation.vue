<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessagesStore } from '@/stores/messages'
import { useDmStore } from '@/stores/dm'
import { useAuthStore } from '@/stores/auth'
import { useFriendsStore } from '@/stores/friends'
import { useSocket, voiceSubscribe, voiceUnsubscribe } from '@/composables/useSocket'
import { useTyping, useTypingLabel } from '@/composables/useTyping'
import { useMentionAutocomplete } from '@/composables/useMentionAutocomplete'
import { useJumpToMessage } from '@/composables/useMessageJump'
import { useCall } from '@/composables/useCall'
import { useCallStore } from '@/stores/call'
import { useVoiceStore } from '@/stores/voice'
import DmCallPanel from './DmCallPanel.vue'
import { messagesApi } from '@/api/messages'
import { formatMentionsPlain } from '@/utils/mentions'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import AttachmentComposeModal from '@/components/shared/AttachmentComposeModal.vue'
import ReportModal from '@/components/shared/ReportModal.vue'
import EmojiPicker from '@/components/shared/EmojiPicker.vue'
import MessageRow from '@/components/shared/MessageRow.vue'
import DateDivider from '@/components/shared/DateDivider.vue'
import ForwardMessageModal from '@/components/shared/ForwardMessageModal.vue'
import PinsPopover from '@/components/shared/PinsPopover.vue'
import SearchPopover from '@/components/shared/SearchPopover.vue'
import GroupManagePanel from './GroupManagePanel.vue'
import { useAppShellNav } from '@/composables/useAppShellNav'
import { isNewDay, dayDividerLabel } from '@/utils/dateSeparator'
import type { DmChannelDto, MessageDto } from '@/types'

// Yanıt state
const replyingTo = ref<MessageDto | null>(null)

// İlet (forward) modalı
const showForward = ref(false)
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
const editTextareaEl = ref<HTMLTextAreaElement | null>(null)
const showDeleteConfirm = ref(false)
const deleteTargetId = ref<string | null>(null)
const deleteLoading = ref(false)

// Compose picker
const showComposeEmojiPicker = ref(false)
const dmTextareaEl = ref<HTMLTextAreaElement | null>(null)
// Compose emoji picker tetikleyici butonu (Teleport konumlandırması için)
const dmComposeEmojiTriggerEl = ref<HTMLElement | null>(null)

async function pickDmEmoji(msg: MessageDto, emoji: string) {
  try {
    await messagesApi.addReaction(props.channel.id, msg.id, emoji)
    // Store güncellemesi useSocket reaction.added handler'ından gelir (çift-sayım önleme)
  } catch {
    // sessizce yut
  }
}

async function toggleDmReaction(msg: MessageDto, emoji: string, reactedByMe: boolean) {
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
const emit = defineEmits<{ deleted: []; toggleProfile: [] }>()

const { t } = useI18n()
const messagesStore = useMessagesStore()
const dmStore = useDmStore()
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
function dmMentionResolver(userId: string): string {
  const member = dmMentionMembers.value.find((m) => m.id === userId)
  if (member) return member.username
  // Gönderen kendisi de olabilir
  if (userId === authStore.user?.id) return authStore.user.username
  return t('mention.unknown')
}

// Sprint V2: kendi-bahsedilme vurgusu (DM bağlamı)
function isDmMentioned(msg: MessageDto): boolean {
  return !!(msg.mentions?.includes(authStore.user?.id ?? ''))
}

// Sprint V2: mention autocomplete
const mention = useMentionAutocomplete(
  dmMentionMembers,
  () => content.value,
  (v) => { content.value = v },
  () => dmTextareaEl.value?.selectionStart ?? 0,
  (pos) => { nextTick(() => { dmTextareaEl.value?.setSelectionRange(pos, pos) }) },
)

// Tip yardımcıları
const isGroup = computed(() => props.channel.type === 'GROUP_DM')
const dmChannel = computed(() => props.channel.type === 'DM' ? props.channel : null)
const groupChannel = computed(() => props.channel.type === 'GROUP_DM' ? props.channel : null)

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
const sending = ref(false)
const sendError = ref('')
const listEl = ref<HTMLElement | null>(null)
const fileInputEl = ref<HTMLInputElement | null>(null)
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

function openReportMessage(msgId: string) {
  reportTargetType.value = 'MESSAGE'
  reportTargetId.value = msgId
}

// Sprint 6.2: düzenleme fonksiyonları
function startEdit(msg: MessageDto) {
  editState.value = { messageId: msg.id, content: msg.content, loading: false, error: '' }
  nextTick(() => {
    if (editTextareaEl.value) {
      editTextareaEl.value.focus()
      editTextareaEl.value.style.height = 'auto'
      editTextareaEl.value.style.height = editTextareaEl.value.scrollHeight + 'px'
    }
  })
}

function cancelEdit() {
  editState.value = null
}

async function saveEdit() {
  if (!editState.value || editState.value.loading) return
  const state = editState.value
  const trimmed = state.content.trim()
  if (!trimmed) return
  state.loading = true
  state.error = ''
  try {
    const { data } = await messagesApi.editMessage(props.channel.id, state.messageId, trimmed)
    messagesStore.updateMessage(data)
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

function onEditKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    saveEdit()
  }
  if (e.key === 'Escape') {
    cancelEdit()
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
const hasMore = computed(() => messagesStore.hasMoreByChannel[props.channel.id] ?? false)

watch(
  () => props.channel.id,
  async (id, oldId) => {
    if (oldId) { leaveChannel(oldId); voiceUnsubscribe(oldId) }
    if (!id) return
    const ack = await joinChannel(id)
    realtimeError.value = !ack.ok
    await messagesStore.fetchMessages(id)
    await dmStore.markRead(id)
    // REV-11: bu kanalda devam eden çağrı var mı (snapshot) → "Sese Katıl" göster.
    // Ayrıca canlı presence'a abone ol → biri çıkınca voice.participant_left ile liste
    // güncellenir ("Sese katıl" takılı kalmaz). Guild'de VoiceParticipantList yapar; DM'de burada.
    voiceStore.loadParticipants(id)
    voiceSubscribe(id)
    stickToBottom = true
    scrollToBottom()
  },
  { immediate: true },
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
function onListScroll() {
  const el = listEl.value
  if (!el) return
  stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  if (stickToBottom) newMessageCount.value = 0
}

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
  scrollToBottom()
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

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!input) return
  input.value = ''
  if (!file) return
  composeFile.value = file
}

async function onAttachmentSent({ attachmentId, caption }: { attachmentId: string; caption: string }) {
  composeFile.value = null
  const replyId = replyingTo.value?.id
  replyingTo.value = null
  try {
    const { data } = await messagesApi.send(props.channel.id, caption, replyId, [attachmentId])
    stickToBottom = true // kendi eki gönderdim → dibe kay
    messagesStore.appendMessage(data)
  } catch {
    // hata sessizce yutulur — modal zaten kapandı
  }
}

async function send() {
  const hasText = content.value.trim()
  // Grup kanallarında canMessage kontrolü yok (backend kontrol eder)
  const canSend = isGroup.value || dmChannel.value?.canMessage
  if (!hasText || sending.value || !canSend) return
  stopTyping()
  sendError.value = ''
  sending.value = true
  // Sprint V2: @username → <@userId> dönüşümü gönderimden önce
  const text = mention.applyMentionTokens(content.value.trim())
  mention.clearPending()
  content.value = ''
  nextTick(resetComposerHeight) // REV-2: gönderince büyüyen textarea normale dönsün
  const replyId = replyingTo.value?.id
  replyingTo.value = null
  try {
    const { data } = await messagesApi.send(props.channel.id, text, replyId)
    stickToBottom = true // kendi mesajım → her zaman dibe kay
    messagesStore.appendMessage(data)
  } catch (e: unknown) {
    content.value = text
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    const errCode = err.response?.data?.error
    sendError.value = errCode
      ? (t(`message.errors.${errCode}`) !== `message.errors.${errCode}` ? t(`message.errors.${errCode}`) : (err.response?.data?.message ?? t('common.error')))
      : t('common.error')
  } finally {
    sending.value = false
  }
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
const canMessage = computed(() => isGroup.value || (dmChannel.value?.canMessage ?? false))
const selfBlocked = computed(() => dmChannel.value?.selfBlocked ?? false)

// Compose emoji picker
function toggleComposeEmojiPicker(e: MouseEvent) {
  e.stopPropagation()
  showComposeEmojiPicker.value = !showComposeEmojiPicker.value
}

function onDmComposeEmojiSelect(emoji: string) {
  showComposeEmojiPicker.value = false
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

// Compose emoji picker dışı tıklamada kapat
// Picker body'e Teleport edildiği için DOM'da .v3-emoji-picker sınıfından tanıyoruz.
function onDmPickerDocClick(e: MouseEvent) {
  if (dmComposeEmojiTriggerEl.value?.contains(e.target as Node)) return
  const pickerInDom = (e.target as Element)?.closest?.('.v3-emoji-picker')
  if (!pickerInDom) {
    showComposeEmojiPicker.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onDmPickerDocClick)
})
onUnmounted(() => {
  document.removeEventListener('click', onDmPickerDocClick)
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
      class="flex flex-col flex-1 min-w-0 overflow-hidden mb-4 rounded-[var(--kv-radius-lg)]"
      style="background-color: var(--kv-bg-content);"
    >
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
          <span class="flex-1 text-[15px] font-semibold truncate" style="color: var(--kv-text-primary);">
            {{ dmChannel.otherUser.username }}
          </span>
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
            <p class="text-[15px] font-semibold truncate" style="color: var(--kv-text-primary);">
              {{ groupDisplayName }}
            </p>
            <p class="text-[12px]" style="color: var(--kv-text-muted);">
              {{ t('group.memberCount', { n: groupChannel.members.length }) }}
            </p>
          </div>
          <!-- Grup sesli sohbet: sese katıl (zaten bağlıysa gizli — kontrol barda) -->
          <button
            v-if="!voiceStore.isConnectedTo(channel.id)"
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
          <!-- Sabitlenen mesajlar butonu (GROUP_DM) -->
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
          <!-- Mesajlarda Ara butonu (GROUP_DM) -->
          <div class="relative">
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
          <!-- Üye panelini aç/kapat -->
          <button
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

      <!-- Aktif sesli arama kartı (kabul edilince mesajların üstünde) -->
      <DmCallPanel :channel-id="channel.id" />

      <!-- Mesaj listesi (Discord stili — baloncuk yok, sola yaslı düz liste) -->
      <div class="relative flex-1 min-h-0 flex flex-col">
      <div ref="listEl" class="flex-1 overflow-y-auto py-4 flex flex-col" @scroll="onListScroll">
        <div v-if="hasMore" class="flex justify-center py-2">
          <button
            class="text-[13px] hover:underline cursor-pointer"
            style="color: var(--kv-info);"
            @click="loadMore"
          >
            {{ t('message.loadMore') }}
          </button>
        </div>
        <p
          v-if="!messages.length"
          class="text-center text-[14px] py-8"
          style="color: var(--kv-text-muted);"
        >
          {{ t('dm.empty') }}
        </p>

        <template v-for="(msg, index) in messages" :key="msg.id">
        <!-- C11: gün değişiminde ayraç (Bugün · Dün · 25 Ekim 2026) -->
        <DateDivider v-if="dayLabels[index]" :label="dayLabels[index] || ''" />
        <MessageRow
          :message="msg"
          :is-mine="isMine(msg)"
          :is-group-start="isGroupStart(index)"
          :is-editing="isMine(msg) && editState?.messageId === msg.id"
          :mention-resolver="dmMentionResolver"
          :is-mentioned="isDmMentioned(msg)"
          :can-pin="true"
          @reply="startReply"
          @forward="(m) => { forwardMsg = m; showForward = true }"
          @edit="startEdit"
          @delete="openDeleteConfirm"
          @report="openReportMessage"
          @add-reaction="(_msgId, emoji) => pickDmEmoji(msg, emoji)"
          @pin="onPinMessage"
          @unpin="onUnpinMessage"
        >
          <!-- Inline düzenleme modu (kendi mesajı) -->
          <template #editing>
            <div v-if="isMine(msg) && editState?.messageId === msg.id" class="mt-1">
              <textarea
                ref="editTextareaEl"
                v-model="editState!.content"
                rows="1"
                class="w-full px-3 py-2 rounded-[var(--kv-radius-sm)] text-[14px] resize-none outline-none border"
                style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary); border-color: var(--kv-border-strong); font-family: var(--kv-font-ui); max-height: 200px;"
                :disabled="editState!.loading"
                @keydown="onEditKeydown"
                @input="($event.target as HTMLTextAreaElement).style.height = 'auto'; ($event.target as HTMLTextAreaElement).style.height = ($event.target as HTMLTextAreaElement).scrollHeight + 'px'"
              />
              <p v-if="editState!.error" class="text-[12px] mt-1" style="color: var(--kv-danger);">{{ editState!.error }}</p>
              <div class="flex gap-2 mt-1 text-[12px]" style="color: var(--kv-text-muted);">
                <span>{{ t('message.editHint') }}</span>
                <button class="underline cursor-pointer hover:opacity-80" style="color: var(--kv-danger);" @click="cancelEdit">
                  {{ t('common.cancel') }}
                </button>
              </div>
            </div>
          </template>

          <!-- Reaksiyon pill'leri -->
          <template #reactions>
            <button
              v-for="reaction in msg.reactions"
              :key="reaction.emoji"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] cursor-pointer transition-colors border"
              :style="reaction.reactedByMe
                ? 'background-color: var(--kv-accent-subtle); border-color: var(--kv-accent-500); color: var(--kv-accent-500);'
                : 'background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle); color: var(--kv-text-secondary);'"
              :title="t('reaction.toggleTitle')"
              @click.stop="toggleDmReaction(msg, reaction.emoji, reaction.reactedByMe)"
            >
              <span>{{ reaction.emoji }}</span>
              <span class="font-medium">{{ reaction.count }}</span>
            </button>
          </template>
        </MessageRow>
        </template>
      </div>

      <!-- REV-9: yeni mesaj geldiğinde (yukarıdayken) aşağı-in butonu + gelen mesaj sayısı -->
      <button
        v-if="newMessageCount > 0"
        class="absolute right-4 bottom-3 z-10 flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full cursor-pointer transition-opacity hover:opacity-90 shadow-lg"
        style="background-color: var(--kv-accent-500); color: #ffffff;"
        @click="jumpToBottom"
      >
        <span class="flex items-center justify-center text-[11px] font-bold rounded-full" style="min-width: 18px; height: 18px; background-color: var(--kv-danger);">
          {{ newMessageCount > 99 ? '99+' : newMessageCount }}
        </span>
        <span class="text-[12px] font-semibold">{{ t('message.newMessages') }}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
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

        <!-- 1-1 DM: canMessage=false bandı -->
        <div
          v-if="!canMessage"
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
            accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain"
            @change="onFileSelected"
          />

          <!-- Yanıt önizleme bandı -->
          <div
            v-if="replyingTo"
            class="flex items-center gap-2 px-3 py-1.5 rounded-t-[var(--kv-radius-sm)] text-[12px] truncate"
            style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle); border-bottom: none;"
          >
            <span class="shrink-0" style="color: var(--kv-text-muted);">↩</span>
            <span class="font-semibold shrink-0" style="color: var(--kv-text-secondary);">{{ t('reply.to', { author: replyingTo.author.username }) }}</span>
            <span class="truncate" style="color: var(--kv-text-muted);">— {{ formatMentionsPlain(replyingTo.content, dmMentionResolver, t('mention.unknown')) }}</span>
            <button
              class="shrink-0 ml-auto cursor-pointer hover:opacity-80 transition-opacity"
              style="color: var(--kv-text-muted);"
              :title="t('reply.cancel')"
              @click="cancelReply"
            >
              ✕
            </button>
          </div>

          <div
            class="flex items-center gap-2 px-4 border"
            :class="replyingTo ? 'rounded-b-[var(--kv-radius-md)]' : 'rounded-[var(--kv-radius-md)]'"
            style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong); min-height: 44px;"
          >
            <button
              type="button"
              class="shrink-0 w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors"
              style="color: var(--kv-text-secondary);"
              :aria-label="t('attachment.addFile')"
              :title="t('attachment.addFile')"
              @mouseenter="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-primary)'"
              @mouseleave="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-secondary)'"
              @click="openFilePicker"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <!-- Sprint V2: mention autocomplete — relative sarmalayıcı popover için -->
            <div class="relative flex-1 min-w-0">
              <div
                v-if="mention.showPopover.value"
                class="absolute bottom-full left-0 mb-1 z-50 min-w-[200px] max-w-[320px] overflow-hidden rounded-[var(--kv-radius-md)] border"
                style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
                @mousedown.prevent
              >
                <div
                  v-for="(member, idx) in mention.suggestions.value"
                  :key="member.id"
                  class="flex items-center gap-2 px-3 py-2 cursor-pointer text-[14px]"
                  :style="idx === mention.activeIndex.value
                    ? 'background-color: var(--kv-accent-subtle); color: var(--kv-text-primary);'
                    : 'color: var(--kv-text-secondary);'"
                  @click="mention.selectSuggestion(member)"
                >
                  <div
                    class="w-6 h-6 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-semibold text-white"
                    style="background-color: var(--kv-accent-500);"
                  >
                    <img v-if="member.avatarUrl" :src="member.avatarUrl" :alt="member.username" class="w-full h-full object-cover" />
                    <span v-else>{{ member.username[0].toUpperCase() }}</span>
                  </div>
                  <span class="font-medium">@{{ member.username }}</span>
                </div>
              </div>
              <textarea
                ref="dmTextareaEl"
                v-model="content"
                rows="1"
                :placeholder="inputPlaceholder"
                class="w-full bg-transparent text-[15px] resize-none outline-none"
                style="max-height: 50vh; font-family: var(--kv-font-ui); color: var(--kv-text-primary); line-height: 1.5; padding-top: 10px; padding-bottom: 10px;"
                @keydown="onKeydown"
                @input="onDmTextareaInput"
                @blur="stopTyping"
              />
            </div>
            <!-- Emoji (😊) butonu -->
            <div class="relative shrink-0 self-center">
              <button
                ref="dmComposeEmojiTriggerEl"
                type="button"
                class="py-1 px-1 cursor-pointer hover:opacity-80 transition-opacity"
                style="color: var(--kv-text-muted); font-size: 18px; line-height: 1;"
                :aria-label="t('message.emojiButton')"
                @click.stop="toggleComposeEmojiPicker"
              >
                😊
              </button>
              <!-- Teleport to body ile viewport-farkındalıklı konumlandırma -->
              <EmojiPicker
                v-if="showComposeEmojiPicker"
                :anchor-el="dmComposeEmojiTriggerEl"
                @select="onDmComposeEmojiSelect"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Grup yönetim paneli (sağ kenar) -->
    <GroupManagePanel
      v-if="isGroup && showGroupPanel && groupChannel"
      :group-id="groupChannel.id"
      :group-name="groupChannel.name"
      :owner-id="groupChannel.ownerId"
      :members="groupChannel.members"
      @close="closeGroupPanel"
      @deleted="emit('deleted')"
    />
  </div>

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
    @close="reportTargetId = null"
  />

  <ForwardMessageModal
    v-if="showForward && forwardMsg"
    :message="forwardMsg"
    @close="showForward = false"
  />
</template>
