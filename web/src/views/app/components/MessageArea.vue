<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessagesStore } from '@/stores/messages'
import { useChannelsStore } from '@/stores/channels'
import { useGuildsStore } from '@/stores/guilds'
import { useAuthStore } from '@/stores/auth'
import { useMembersStore } from '@/stores/members'
import { useRolesStore } from '@/stores/roles'
import { useSocket } from '@/composables/useSocket'
import { useOptimisticSend } from '@/composables/useOptimisticSend'
import { useTyping, useTypingLabel } from '@/composables/useTyping'
import { useMentionAutocomplete } from '@/composables/useMentionAutocomplete'
import { useJumpToMessage } from '@/composables/useMessageJump'
import { useGuildPermissions } from '@/composables/useGuildPermissions'
import { useAudioQueue } from '@/composables/useExclusivePlayback'
import { messagesApi } from '@/api/messages'
import MessageItem from '@/components/shared/MessageItem.vue'
import ScrollToBottomButton from '@/components/shared/ScrollToBottomButton.vue'
import ReplyQuote from '@/components/shared/ReplyQuote.vue'
import DateDivider from '@/components/shared/DateDivider.vue'
import AttachmentComposeModal from '@/components/shared/AttachmentComposeModal.vue'
import { ATTACHMENT_ACCEPT } from '@/utils/attachmentType'
import { useComposerFileIntake } from '@/composables/useComposerFileIntake'
import ComposerBar from '@/components/shared/ComposerBar.vue'
import { isNewDay, dayDividerLabel } from '@/utils/dateSeparator'
import type { MessageDto } from '@/types'

const { t } = useI18n()
const messagesStore = useMessagesStore()
const channelsStore = useChannelsStore()
const guildsStore = useGuildsStore()
const authStore = useAuthStore()
const membersStore = useMembersStore()
const rolesStore = useRolesStore()
const { joinChannel, leaveChannel } = useSocket()
const optimistic = useOptimisticSend()

// Mesaj yönetimi (pin + başkasının mesajını silme) → MANAGE_MESSAGES (owner/ADMINISTRATOR dahil)
const { can } = useGuildPermissions(() => guildsStore.activeGuildId ?? '')
const canManageMessages = computed(() => can('MANAGE_MESSAGES'))
// C35 §4.6: webhook mesajini MANAGE_WEBHOOKS sahibi de silebilir
const canManageWebhooks = computed(() => can('MANAGE_WEBHOOKS'))
const canPin = canManageMessages
// C57: salt okunur kanal. Yazamayan üye mesaj kutusu yerine bilgi satırı görür, yanıtla düğmesi gizlenir.
// Sunucu otorite (CHANNEL_READ_ONLY); bu yalnız UX.
const canWrite = computed(
  () => !channelsStore.activeChannel()?.readOnly || can('MANAGE_CHANNELS'),
)
const { onInput: onTypingInput, stopTyping } = useTyping(() => channelId.value)
const { label: typingLabel } = useTypingLabel(() => channelId.value, t)

const content = ref('')
const listEl = ref<HTMLElement | null>(null)
const fileInputEl = ref<HTMLInputElement | null>(null)
const gifInputEl = ref<HTMLInputElement | null>(null)
// Giriş satırı bileşeni; textarea'ya ComposerBar'ın expose ettiği ref üzerinden erişilir
const composerEl = ref<{ textarea: HTMLTextAreaElement | null } | null>(null)
const textareaEl = computed(() => composerEl.value?.textarea ?? null)
// Room'a join başarısızsa realtime çalışmaz; kullanıcıyı sessiz bırakmıyoruz
const realtimeError = ref(false)
const sendError = ref('')
const slowModeSeconds = ref<number | null>(null)

// Sprint 5 R1 — modal akışı (inline çentik kaldırıldı)
const composeFile = ref<File | null>(null)
const intake = useComposerFileIntake({ composeFile, disabled: () => !channelId.value })
const onFileSelected = intake.onFileSelected

// Yanıt state
const replyingTo = ref<MessageDto | null>(null)

// Sprint V2: guild üyeleri (mention autocomplete + resolver için) — REV-14: members store (WS anlık)
const guildMembers = computed(() => membersStore.membersFor(guildsStore.activeGuildId ?? ''))

function setReplyingTo(msg: MessageDto) {
  replyingTo.value = msg
  nextTick(() => textareaEl.value?.focus())
}

function cancelReply() {
  replyingTo.value = null
}

const channelId = computed(() => channelsStore.activeChannelId)
const messages = computed(() =>
  channelId.value ? messagesStore.messagesForChannel(channelId.value) : [],
)

// Gruplama: mesaj grup başı mı?
// Kural: ilk mesaj VEYA önceki yazarı farklı VEYA öncekinden > 7 dakika geçmişse → grup başı.
// C11 §3: tarih ayracı grubu BÖLER — ayraçtan sonraki ilk mesaj aynı yazara ait olsa bile tam
// başlıkla (avatar + ad) çizilir, yoksa ayracın altında sahipsiz bir gövde kalırdı.
// M6b §8.4: sesli mesaj sırası (biten ses → sıradaki)
useAudioQueue(() => channelId.value, messages)

function isGroupStart(index: number): boolean {
  if (index === 0) return true
  const cur = messages.value[index]
  const prev = messages.value[index - 1]
  if (isNewDay(cur.createdAt, prev.createdAt)) return true
  if (cur.author.id !== prev.author.id) return true
  // C35: ayni webhook mesaj basina farkli `username` gonderebilir; farkli ad = yeni grup
  if (cur.webhook && cur.author.username !== prev.author.username) return true
  const diffMs = new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime()
  return diffMs > 7 * 60 * 1000
}

// C11 — tarih ayraçları listeden TÜRETİLİR (diziye gömülmez): her hesaplamada komşu
// karşılaştırması yapılır, böylece yukarı kaydırıp eski paket başa eklendiğinde eski en-üst
// ayraç kendiliğinden doğru yere kayar. `null` = o mesajın üstünde ayraç yok.
const dayLabels = computed<(string | null)[]>(() =>
  messages.value.map((msg, index) =>
    isNewDay(msg.createdAt, messages.value[index - 1]?.createdAt)
      ? dayDividerLabel(msg.createdAt, t)
      : null,
  ),
)
const hasMore = computed(() =>
  channelId.value ? (messagesStore.hasMoreByChannel[channelId.value] ?? false) : false,
)
const channelName = computed(() => channelsStore.activeChannel()?.name ?? '')
const channelSlowMode = computed(() => channelsStore.activeChannel()?.slowModeSeconds ?? 0)

function inputPlaceholder() {
  if (channelSlowMode.value > 0) {
    return t('channel.slowModeHint', { seconds: channelSlowMode.value })
  }
  return t('message.inputPlaceholder', { channel: channelName.value })
}

// Emoji compose picker (aç/kapa ComposerBar'da; imlece yerleştirme burada)
function onComposeEmojiSelect(emoji: string) {
  const el = textareaEl.value
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

// Sprint V2: guild değişince üyeleri yükle (mention autocomplete için) — store paylaşımlı
watch(
  () => guildsStore.activeGuildId,
  async (guildId) => {
    if (guildId && !membersStore.membersByGuild[guildId]) {
      try {
        await membersStore.fetchMembers(guildId)
      } catch {
        // sessiz
      }
    }
  },
  { immediate: true },
)

// Sprint V2: mention autocomplete (guild kanalı → guild üyeleri)
// 🔴 Kendini bahsetme önerisi YOK (sahip sorusu 2026-08-03): sunucu kendi bahsetmeni zaten yok
// sayıyor (`messages.gateway.ts` alıcı döngüsü `if (mentionedUserId === authorId) continue`),
// yani o satırı seçmek metne `@sen` yazmaktan başka hiçbir şey yapmıyor — tıklayınca hiçbir şey
// olmayan öneri gösterilmez.
const mentionMembers = computed(() =>
  guildMembers.value
    .filter((m) => m.userId !== authStore.user?.id)
    .map((m) => ({ id: m.userId, username: m.username, avatarUrl: m.avatarUrl }))
)

// @everyone: yalnız everyone rolü mentionable ise id döner (aksi → null → öneri yok)
const everyoneMentionRoleId = computed<string | null>(() => {
  const gid = guildsStore.activeGuildId
  if (!gid) return null
  const everyone = rolesStore.rolesFor(gid).find((r) => r.isEveryone)
  return everyone?.mentionable ? everyone.id : null
})

/**
 * R15 — önerilebilir roller (everyone HARİÇ; o ayrı öneri olarak zaten var).
 * Kapı kuralı burada uygulanır (sözleşme §2.2 + R2 revizyonu ile birebir):
 *   mentionable rol → herkese görünür
 *   mentionable OLMAYAN rol → HİÇ KİMSEYE önerilmez (izin baypası yok)
 * Sunucu aynı kapıyı bağımsız uyguluyor; buradaki süzgeç yalnız "seçemeyeceğin şeyi önerme"
 * içindir, yetki kararı değildir.
 */
const mentionRoles = computed(() => {
  const gid = guildsStore.activeGuildId
  if (!gid) return []
  return rolesStore
    .rolesFor(gid)
    .filter((r) => !r.isEveryone && r.mentionable)
    .map((r) => ({ id: r.id, name: r.name, color: r.color }))
})

const mention = useMentionAutocomplete(
  mentionMembers,
  () => content.value,
  (v) => { content.value = v },
  () => textareaEl.value?.selectionStart ?? 0,
  (pos) => { nextTick(() => { textareaEl.value?.setSelectionRange(pos, pos) }) },
  () => everyoneMentionRoleId.value,
  () => mentionRoles.value,
)

watch(
  channelId,
  async (id, oldId) => {
    // Eski kanaldan ayrıl
    if (oldId) leaveChannel(oldId)
    if (!id) return

    // Önce room'a join et (§7: channel:join olmadan message.created gelmez)
    const ack = await joinChannel(id)
    // Ack yok sayılırsa join sessizce başarısız olur → realtime ölü, kullanıcı bilmez
    realtimeError.value = !ack.ok
    // Sonra REST'ten geçmiş yükle
    await messagesStore.fetchMessages(id)
    stickToBottom = true
    scrollToBottom()
    // Önceki kanaldan kalan "en alta in" düğmesi yeni kanalda asılı kalmasın
    showScrollDown.value = false
  },
  { immediate: true },
)

// Mesaja zıpla (pins/arama) — zıplama sırasında alta kaymayı bastır
const { isJumping } = useJumpToMessage(listEl, () => channelId.value)

// REV-1: yeni mesajda dipteyse otomatik kay; kullanıcı yukarı kaydırıp geçmiş
// okuyorsa yakalamaya çalışma. length izlenir (appendMessage in-place push → referans
// değişmez, eski watch(messages) tetiklenmezdi) + prepend/loadMore'da stick=false ⇒ kaymaz.
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

watch(
  () => messages.value.length,
  async (n, o) => {
    if (isJumping.value || n <= o || loadingOlder) return
    // REV-9 fix: kendi mesajım (HTTP yanıtı VEYA WS eko ile gelsin) → her zaman dibe kay,
    // bildirim SAYMA. WS eko await'ten önce gelip stickToBottom henüz false iken bildirim
    // sayıyordu → son mesajın yazarına bakıp düzelt.
    const last = messages.value[messages.value.length - 1]
    const mine = last?.author.id === authStore.user?.id
    if (stickToBottom || mine) {
      newMessageCount.value = 0
      await nextTick()
      scrollToBottom()
    } else {
      // Yukarıda okuyorum + başkasının mesajı → kaydırma, gelenleri say
      newMessageCount.value += n - o
    }
  },
  { flush: 'post' },
)

function scrollToBottom() {
  if (listEl.value) {
    listEl.value.scrollTop = listEl.value.scrollHeight
  }
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
  if (!channelId.value || !messages.value.length) return
  const el = listEl.value
  const prevScrollHeight = el?.scrollHeight ?? 0
  const prevScrollTop = el?.scrollTop ?? 0
  const oldest = messages.value[0].id
  loadingOlder = true
  try {
    await messagesStore.fetchMessages(channelId.value, oldest)
    await nextTick()
    if (el) {
      el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight)
    }
  } finally {
    loadingOlder = false
  }
}

// Dosya seçimi → modal aç
function openFilePicker() {
  fileInputEl.value?.click()
}

// GIF düğmesi: yalnız image/gif kabul eden ayrı seçici, sonrası aynı ek akışı
function openGifPicker() {
  gifInputEl.value?.click()
}

// Modal'dan gelen sent event'i → mesaj gönder
async function onAttachmentSent({ attachmentId, caption }: { attachmentId: string; caption: string }) {
  if (!channelId.value) return
  composeFile.value = null
  slowModeSeconds.value = null
  const replyId = replyingTo.value?.id
  replyingTo.value = null
  try {
    const { data } = await messagesApi.send(channelId.value, caption, replyId, [attachmentId])
    stickToBottom = true // kendi eki gönderdim → dibe kay
    messagesStore.appendMessage(data)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string; retryAfter?: number } } }
    const errCode = err.response?.data?.error
    if (errCode === 'SLOW_MODE') {
      const retry = err.response?.data?.retryAfter
      slowModeSeconds.value = typeof retry === 'number' ? retry : null
      sendError.value = slowModeSeconds.value !== null
        ? t('message.errors.SLOW_MODE_RETRY', { seconds: slowModeSeconds.value })
        : t('message.errors.SLOW_MODE')
    } else {
      sendError.value = errCode
        ? (t(`message.errors.${errCode}`) || err.response?.data?.message || t('common.error'))
        : t('common.error')
    }
  }
}

function send() {
  const hasText = content.value.trim()
  if (!hasText || !channelId.value) return
  stopTyping()
  sendError.value = ''
  slowModeSeconds.value = null
  // Sprint V2: @username → <@userId> dönüşümü gönderimden önce
  const text = mention.applyMentionTokens(content.value.trim())
  mention.clearPending()
  content.value = ''
  void nextTick(resetComposerHeight) // REV-2: gönderince büyüyen textarea normale dönsün
  const reply = replyingTo.value
  replyingTo.value = null
  stickToBottom = true // kendi mesajım → her zaman dibe kay
  // C29: geçici mesaj anında listeye girer; sonuç/hata mesajın kendi altında gösterilir.
  optimistic.sendText(channelId.value, text, reply, (s) => (slowModeSeconds.value = s))
}

function onKeydown(e: KeyboardEvent) {
  // Sprint V2: mention popover açıkken ↑/↓/Enter/Tab/Esc → autocomplete'e yönlendir
  if (mention.onKeydown(e)) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function onTextareaInput() {
  sendError.value = ''
  slowModeSeconds.value = null
  onTypingInput()
  const el = textareaEl.value
  if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
  // Sprint V2: mention autocomplete tetikle
  mention.onInput()
}

// REV-2: gönderim sonrası textarea'yı tek satıra döndür (büyümüş yükseklik kalmasın)
function resetComposerHeight() {
  if (textareaEl.value) textareaEl.value.style.height = 'auto'
}
</script>

<template>
  <div
    class="relative flex flex-col flex-1 min-w-0 min-h-0"
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
    <div
      v-if="channelId && realtimeError"
      class="shrink-0 px-4 py-2 text-[13px] text-center"
      style="background-color: var(--kv-warning); color: var(--kv-bg-rail);"
    >
      {{ t('message.realtimeError') }}
    </div>
    <div class="relative flex-1 min-h-0 flex flex-col">
    <div ref="listEl" class="flex-1 min-h-0 overflow-y-auto py-4 flex flex-col gap-0.5" @scroll="onListScroll">
      <div v-if="!channelId" class="flex-1 flex items-center justify-center">
        <p style="color: var(--kv-text-muted);">{{ t('channel.selectChannel') }}</p>
      </div>

      <template v-else>
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
          v-if="!messages.length"
          class="text-center text-[14px] py-8"
          style="color: var(--kv-text-muted);"
        >
          {{ t('message.noMessages') }}
        </p>

        <template v-for="(msg, index) in messages" :key="msg.nonce ?? msg.id">
          <!-- C11: gün değişiminde ayraç (Bugün · Dün · 25 Ekim 2026) -->
          <DateDivider v-if="dayLabels[index]" :label="dayLabels[index] || ''" />
          <MessageItem
            :message="msg"
            :is-group-start="isGroupStart(index)"
            :guild-members="guildMembers"
            :can-pin="canPin"
            :can-manage-messages="canManageMessages || (!!msg.webhook && canManageWebhooks)"
            :guild-id="guildsStore.activeGuildId ?? undefined"
            :can-reply="canWrite"
            @reply="setReplyingTo"
            @retry="optimistic.retry"
            @discard="optimistic.discard"
          />
        </template>
      </template>
    </div>

    <!-- En alta in: yukarı kaydırınca görünür; yukarıdayken gelen mesaj sayısı rozette (REV-9) -->
    <ScrollToBottomButton
      v-if="showScrollDown || newMessageCount > 0"
      :count="newMessageCount"
      @click="jumpToBottom"
    />
    </div>

    <!-- C57: salt okunur kanalda yazamayan üye -->
    <div
      v-if="channelId && !canWrite"
      class="shrink-0 mx-4 mb-6 mt-2 px-4 py-3 rounded-[var(--kv-radius-md)] border text-[13px] text-center"
      style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
    >
      {{ t('channel.readOnlyNotice') }}
    </div>
    <div v-else-if="channelId" class="shrink-0 px-4 pb-6 pt-2">
      <!-- Gönderme hatası (örn. MESSAGE_BLOCKED) -->
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

      <!-- Yanıt önizleme bandı: yazar + tek satır metin, ekli mesajda küçük önizleme -->
      <div
        v-if="replyingTo"
        class="flex items-center gap-2 p-1.5 mb-1 rounded-t-[var(--kv-radius-sm)]"
        style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle); border-bottom: none;"
      >
        <ReplyQuote
          class="flex-1"
          style="background-color: var(--kv-bg-content);"
          :author="replyingTo.author.username"
          :text="replyingTo.content"
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
      <ComposerBar
        ref="composerEl"
        v-model="content"
        :placeholder="inputPlaceholder()"
        :mention="mention"
        :rounded-bottom-only="!!replyingTo"
        @keydown="onKeydown"
        @input="onTextareaInput"
        @blur="stopTyping"
        @pick-file="openFilePicker"
        @pick-gif="openGifPicker"
        @emoji="onComposeEmojiSelect"
        @ai-attachment="(id) => onAttachmentSent({ attachmentId: id, caption: '' })"
      />
    </div>
  </div>

  <!-- Dosya compose modal -->
  <AttachmentComposeModal
    v-if="composeFile && channelId"
    :file="composeFile"
    :channel-id="channelId"
    @sent="onAttachmentSent"
    @close="composeFile = null"
  />
</template>
