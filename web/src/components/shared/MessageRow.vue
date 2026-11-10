<script setup lang="ts">
/**
 * MessageRow — Discord stili mesaj satırı (3 bağlam: DM 1-1, GROUP_DM, guild kanalı).
 * Gruplama mantığı dışarıdan prop olarak gelir; bu component yalnızca render eder.
 *
 * Gruplama: isGroupStart=true → avatar + başlık göster, mt-4 ekle.
 *           isGroupStart=false → avatar YOK (40px boşluk korunur), yalnız gövde, py-0.5.
 *
 * Hover araç çubuğu: absolute -top-3 right-4, opacity-0 group-hover:opacity-100.
 * Satır hover vurgusu: kv-bg-elevated (hafif).
 * Gölge yok, baloncuk yok.
 *
 * Sprint V2: mentionResolver prop — userId → username çözümleyici (guild/DM bağlamı sağlar).
 *            isMentioned prop — kendi-bahsedilme sol-aksan vurgusu.
 */
import { ref, computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AttachmentView from './AttachmentView.vue'
import ReceiptTick from './ReceiptTick.vue'
import MessageActionsMenu from './MessageActionsMenu.vue'
import MessageContextMenu from './MessageContextMenu.vue'
import MessageEmbeds from './MessageEmbeds.vue'
import ReplyQuote from './ReplyQuote.vue'
import { formatMentionsPlain } from '@/utils/mentions'
import { renderMessageHtml } from '@/utils/markdown'
import { hoverAvatarSrc } from '@/utils/animatedMedia'
import { useActiveMenu } from '@/composables/useActiveMenu'
import { useMessageJump } from '@/composables/useMessageJump'
import type { MessageDto } from '@/types'

// MessageActionsMenu instance ref — menuOpen'ı okumak için
const actionsMenuRef = ref<InstanceType<typeof MessageActionsMenu> | null>(null)

const props = defineProps<{
  message: MessageDto
  isMine: boolean
  isGroupStart: boolean
  // Düzenleme modunda mı? (parent yönetir, bu sadece UI'ı gizler)
  isEditing?: boolean
  // Sprint V2: userId → username çözücü (parent sağlar; guild/DM bağlamına göre)
  mentionResolver?: (userId: string) => string
  /** R15 — roleId → { ad, renk }. Verilmezse rol token'ı "@rol" yedeğiyle çizilir (DM'de böyle). */
  roleResolver?: (roleId: string) => { name: string; color?: string | null } | undefined
  // Sprint V2: kendi-bahsedilme vurgusu
  isMentioned?: boolean
  // Sprint V2 Pins: kullanıcı bu kanalda mesaj sabitleyebilir mi? (parent hesaplar)
  canPin?: boolean
  // C12 §4.2 — okundu göstergesi: 'sent' tek tik, 'seen' çift tik, null/undefined = HİÇ çizme.
  // Kararı parent verir (DM ekranı); ortam kanalı ve grup DM bu prop'u hiç geçmez.
  receipt?: 'sent' | 'seen' | null
  // Faz 3: MANAGE_MESSAGES — başkasının mesajını silebilir mi?
  canManageMessages?: boolean
  // C57: false → Yanıtla gizlenir (salt okunur kanal). Verilmezse true.
  canReply?: boolean
}>()

const emit = defineEmits<{
  reply: [message: MessageDto]
  forward: [message: MessageDto]
  edit: [message: MessageDto]
  delete: [messageId: string]
  report: [messageId: string]
  addReaction: [messageId: string, emoji: string]
  viewReactions: [messageId: string]
  pin: [messageId: string]
  unpin: [messageId: string]
  // C29: başarısız geçici mesajın tek eylemleri
  retry: [message: MessageDto]
  discard: [message: MessageDto]
}>()

const { t } = useI18n()

// R8/R13: paylaşılan aktif-overlay durumu. Bu satırın overlay-anahtarı.
const overlayKey = computed(() => `msg:${props.message.id}`)
const { setActive, clearActive, isSuppressed } = useActiveMenu()

// Bu mesajın ⋯ menüsü / emoji picker'ı açık mı? (MessageActionsMenu.menuOpen expose eder)
const isMenuOpen = computed(() => !!actionsMenuRef.value?.menuOpen)

// Menü açıldı/kapandı → paylaşılan aktif-overlay durumunu güncelle.
watch(isMenuOpen, (open) => {
  if (open) setActive(overlayKey.value)
  else clearActive(overlayKey.value)
})

// Hover araç çubuğu bastırılsın mı? Başka bir mesajın menüsü açıkken bu satırın
// toolbar'ı (hover ile bile) görünmemeli. Kendi menüm açıksa görünür kalır.
const toolbarSuppressed = computed(() => isSuppressed(overlayKey.value))

// Satır sökülürken (örn. mesaj silindi) açık overlay sahipliğini bırak.
onUnmounted(() => clearActive(overlayKey.value))

// C35: gelen webhook mesajı: BOT rozeti + varsayılan bot simgesi; yazar bir kullanıcı değil (kart açılmaz)
const isWebhook = computed(() => !!props.message.webhook)

// C29 — geçici (iyimser) mesaj: menü/tepki/düzenle/sil/sabitle/yanıtla/ilet KAPALI, yalnız Tekrar dene / Sil.
const isLocal = computed(() => !!props.message.localStatus)
// C34: tik yalnız gönderilmiş (yerel/bekleyen olmayan) mesajda; sunucu bilgi vermediyse (`receipt` null) hiç çizilmez.
const showReceipt = computed(() => !!props.receipt && !isLocal.value)

// Sağ tık menüsü: görünürlük kuralları ⋯ menüsüyle aynı.
const canCopy = computed(() => !!props.message.content)
const canEdit = computed(() => props.isMine && !!props.message.content)
const canDelete = computed(() => props.isMine || !!props.canManageMessages)
const ctxMenu = ref<{ x: number; y: number; selection: string } | null>(null)

/** Satır içinde seçili metin; menüye tıklayınca seçim kaybolabildiği için açılışta okunur. */
function selectionIn(row: HTMLElement): string {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) return ''
  return row.contains(sel.anchorNode) && row.contains(sel.focusNode) ? sel.toString() : ''
}

function onRowContext(e: MouseEvent) {
  // Düzenleme kutusunda ve eylemi olmayan satırda tarayıcının/masaüstünün kendi menüsü kalır.
  if (props.isEditing || isLocal.value || (!canCopy.value && !canDelete.value)) return
  e.preventDefault()
  // Belgedeki kapatıcılara ulaşmasın: aynı satırda yeniden sağ tık menüyü kapatmak yerine taşır.
  e.stopPropagation()
  actionsMenuRef.value?.closeAll()
  ctxMenu.value = {
    x: e.clientX,
    y: e.clientY,
    selection: selectionIn(e.currentTarget as HTMLElement),
  }
}

/** Seçim varsa seçili kısım, yoksa bahsetmeleri okunur hale getirilmiş mesaj metni kopyalanır. */
async function copyText(selection = '') {
  const text =
    selection ||
    formatMentionsPlain(
      props.message.content,
      (id) => props.mentionResolver?.(id),
      t('mention.unknown'),
      (roleId) => props.roleResolver?.(roleId)?.name,
    )
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Pano izni yoksa yapılacak bir şey yok; menü zaten kapandı.
  }
}

// Takip mesajına hover'da saat gösterimi
const showFollowTime = ref(false)

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
}

// Satır arka plan hover (inline style ile — Tailwind arbitrary değeri token taşımaz)
// Sprint C16 — hareketli avatar yalnız satır hover'dayken yüklenir (reduced-motion → hep statik).
const rowHovered = ref(false)
const authorAvatarSrc = computed<string | null>(() => {
  return hoverAvatarSrc(props.message.author, rowHovered.value)
})

function onRowEnter(e: MouseEvent) {
  rowHovered.value = true
  // Başka bir mesajın menüsü açıkken bu satır hover-vurgusu göstermesin.
  if (toolbarSuppressed.value) return
  ;(e.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'
  showFollowTime.value = true
}

function onRowLeave(e: MouseEvent) {
  rowHovered.value = false
  ;(e.currentTarget as HTMLElement).style.backgroundColor = ''
  showFollowTime.value = false
}

// Yanıt alıntısı: bahsetmeler okunur ada çevrilmiş düz metin + tıklayınca alıntılanan mesaja git.
const replyText = computed(() =>
  props.message.replyTo?.e2eeUnknown
    ? t('e2ee.encryptedQuote') // E1: alıntılanan şifreli mesajın düz metni bu cihazda yok
    : props.message.replyTo
    ? formatMentionsPlain(
        props.message.replyTo.content,
        (id) => props.mentionResolver?.(id),
        t('mention.unknown'),
        (roleId) => props.roleResolver?.(roleId)?.name,
      )
    : '',
)
const { requestJump } = useMessageJump()
function jumpToReplied() {
  if (props.message.replyToId) requestJump(props.message.channelId, props.message.replyToId)
}

// Sprint V2 (Markdown): mesaj içeriğini güvenli HTML'e dönüştür.
// renderMessageHtml: markdown-it render + DOMPurify sanitize + mention span.
// v-html yalnız bu sanitize edilmiş string'i alır — ham içerik asla doğrudan girmez.
// E1 §6.4: katılımdan önceki mesaj "eklenmeden önce", katılımdan sonra çözülemeyen "çözülemedi".
const e2eeNote = computed<string>(() => {
  const s = props.message.e2eeStatus
  if (s === 'unsupported') return t('e2ee.unsupported')
  return s === 'failed' ? t('e2ee.undecryptable') : t('e2ee.beforeDevice')
})

const renderedContent = computed<string>(() => {
  const content = props.message.content
  if (!content) return ''
  return renderMessageHtml(
    content,
    (id) => props.mentionResolver?.(id),
    t('mention.unknown'),
    (roleId) => props.roleResolver?.(roleId),
  )
})
</script>

<template>
  <!--
    Satır: flex gap-3 px-4
    - Sol: avatar sütunu (40px)
    - Sağ: içerik sütunu (flex-1 min-w-0)
    isGroupStart=true  → mt-4 (grup arası boşluk)
    isGroupStart=false → py-0.5 (sıkı takip)
    Sprint V2: isMentioned → sol-aksan border + accent-subtle zemin
  -->
  <div
    :data-message-id="message.id"
    class="relative flex gap-3 px-4 rounded group"
    :class="[isGroupStart ? 'mt-4 py-0.5' : 'py-0.5', isMentioned ? 'border-l-2' : '']"
    :style="isMentioned ? 'border-color: var(--kv-accent-500); background-color: var(--kv-accent-subtle);' : ''"
    @mouseenter="onRowEnter"
    @mouseleave="onRowLeave"
    @contextmenu="onRowContext"
  >
    <MessageContextMenu
      v-if="ctxMenu"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :message-id="message.id"
      :can-copy="canCopy"
      :can-edit="canEdit"
      :can-delete="canDelete"
      @close="ctxMenu = null"
      @copy="copyText(ctxMenu?.selection)"
      @edit="emit('edit', message)"
      @delete="emit('delete', message.id)"
    />

    <!-- Hover araç çubuğu: -top-3 right-4, yalnız düzenleme modunda gizli.
         - Bu mesajın menüsü açıksa (emoji picker / ⋯) → grup-hover'dan bağımsız görünür kalır (z-40).
         - BAŞKA mesajın menüsü açıksa (toolbarSuppressed) → hover ile bile gizli kalır.
         - Aksi halde → normal hover davranışı. -->
    <div
      v-if="!isEditing && !isLocal"
      class="absolute -top-3 right-4 transition-opacity"
      :class="isMenuOpen
        ? 'opacity-100 z-40'
        : toolbarSuppressed
          ? 'opacity-0 pointer-events-none z-10'
          : 'opacity-0 group-hover:opacity-100 z-10'"
    >
      <MessageActionsMenu
        ref="actionsMenuRef"
        :message-id="message.id"
        :is-mine="isMine"
        :has-content="!!message.content"
        :is-pinned="!!message.pinnedAt"
        :can-pin="canPin ?? false"
        :can-manage-messages="canManageMessages ?? false"
        :can-reply="canReply !== false"
        :has-reactions="!!message.reactions?.length"
        @reply="emit('reply', message)"
        @forward="emit('forward', message)"
        @edit="emit('edit', message)"
        @copy="copyText()"
        @delete="emit('delete', message.id)"
        @report="emit('report', message.id)"
        @add-reaction="(emoji) => emit('addReaction', message.id, emoji)"
        @view-reactions="emit('viewReactions', message.id)"
        @pin="emit('pin', message.id)"
        @unpin="emit('unpin', message.id)"
      />
    </div>

    <!-- Sol: avatar sütunu (40px sabit) -->
    <div class="w-10 shrink-0 flex flex-col items-center">
      <template v-if="isGroupStart">
        <!-- Grup başı: 40px daire avatar -->
        <div
          class="w-10 h-10 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[15px] font-semibold text-white"
          style="background-color: var(--kv-accent-500);"
        >
          <svg
            v-if="isWebhook"
            viewBox="0 0 24 24"
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="8" width="16" height="12" rx="3" />
            <path d="M12 8V4" />
            <circle cx="12" cy="3.5" r="1" />
            <circle cx="9" cy="14" r="1" fill="currentColor" />
            <circle cx="15" cy="14" r="1" fill="currentColor" />
          </svg>
          <img
            v-else-if="authorAvatarSrc"
            :src="authorAvatarSrc"
            :alt="message.author.username"
            class="w-full h-full object-cover"
          />
          <span v-else>{{ message.author.username[0].toUpperCase() }}</span>
        </div>
      </template>
      <template v-else>
        <!-- Takip mesajı: avatar yok — hover'da küçük saat göster (opsiyonel dokunuş) -->
        <span
          v-if="showFollowTime"
          class="text-[11px] pt-0.5 select-none"
          style="color: var(--kv-text-muted); line-height: 1.6;"
        >
          {{ formatTime(message.createdAt) }}
        </span>
      </template>
    </div>

    <!-- Sağ: içerik sütunu -->
    <div
      class="flex-1 min-w-0"
      :style="message.localStatus === 'sending' ? 'opacity: 0.55;' : ''"
    >
      <!-- Grup başı başlık: kullanıcı adı + saat + (düzenlendi) + pin rozeti -->
      <div v-if="isGroupStart" class="flex items-baseline gap-2 mb-0.5">
        <span
          class="text-[16px] font-semibold leading-snug"
          style="color: var(--kv-text-primary);"
        >
          {{ message.author.username }}<span v-if="message.author.roleEmoji" class="ml-1 font-normal">{{ message.author.roleEmoji }}</span>
        </span>
        <span
          v-if="isWebhook"
          class="self-center px-1.5 rounded-[var(--kv-radius-sm)] text-[10px] font-bold uppercase leading-4 select-none"
          style="background-color: var(--kv-accent-500); color: #fff;"
        >{{ t('message.botBadge') }}</span>
        <span class="text-[12px]" style="color: var(--kv-text-muted);">
          {{ formatTime(message.createdAt) }}
        </span>
        <span
          v-if="message.editedAt"
          class="text-[11px]"
          style="color: var(--kv-text-muted);"
        >
          {{ t('message.edited') }}
        </span>
        <!-- Pin rozeti: pinnedAt doluysa göster -->
        <span
          v-if="message.pinnedAt"
          class="text-[11px] select-none"
          style="color: var(--kv-text-muted);"
          :title="t('message.pinnedMessages')"
        >
          📌
        </span>
      </div>

      <!-- Yanıt alıntısı (replyToId doluysa, gövdenin üstünde). Tıklanınca alıntılanan mesaja
           gidilir (yüklü değilse geriye sayfalanır, bkz. useJumpToMessage); silinmişse tıklanmaz. -->
      <ReplyQuote
        v-if="message.replyToId"
        class="mb-1 max-w-[520px]"
        :author="message.replyTo ? message.replyTo.authorUsername : null"
        :text="replyText"
        :attachment="message.replyTo?.attachment"
        :clickable="!!message.replyTo && !isLocal"
        @open="jumpToReplied"
      />

      <!-- Düzenleme modu: parent slot ile render eder — buraya slot açıyoruz -->
      <slot name="editing" />

      <!-- Normal mesaj gövdesi (düzenleme yoksa) -->
      <template v-if="!isEditing">
        <!-- Ek + açıklama birleşik -->
        <template v-if="message.attachments?.length && message.content">
          <div
            class="mt-0.5 rounded-[var(--kv-radius-sm)] overflow-hidden"
            style="max-width: 360px; background-color: var(--kv-bg-sidebar);"
          >
            <AttachmentView
              v-for="att in message.attachments"
              :key="att.id"
              :attachment="att"
              class="!mt-0"
            />
            <!--
              Sprint V2 Markdown: v-html yalnız DOMPurify sanitize edilmiş HTML alır.
              Ham içerik asla doğrudan v-html'e girmez (renderMessageHtml bunu garantiler).
            -->
            <div class="px-3 pb-3 pt-1.5 text-[16px] break-words">
              <div
                class="kv-md"
                :class="{ 'kv-md-tail': showReceipt }"
                style="color: var(--kv-text-primary);"
                v-html="renderedContent"
              /><ReceiptTick v-if="showReceipt && receipt" :receipt="receipt" />
            </div>
          </div>
        </template>
        <template v-else>
          <!-- Yalnız metin: markdown render (güvenli v-html). C34: tik, (düzenlendi)/pin ile birlikte
               metnin SON satırının sonuna satır içi akar (kv-md-tail son paragrafı satır içine alır). -->
          <div v-if="message.content" class="text-[16px] break-words">
            <div
              class="kv-md"
              :class="{ 'kv-md-tail': showReceipt }"
              style="color: var(--kv-text-primary);"
              v-html="renderedContent"
            /><template v-if="!isGroupStart"><span
              v-if="message.editedAt"
              class="text-[11px] ml-1"
              style="color: var(--kv-text-muted);"
            >{{ t('message.edited') }}</span><span
              v-if="message.pinnedAt"
              class="text-[11px] ml-1 select-none"
              style="color: var(--kv-text-muted);"
              :title="t('message.pinnedMessages')"
            >📌</span></template><ReceiptTick v-if="showReceipt && receipt" :receipt="receipt" />
          </div>
          <!-- E1: çözülemeyen / bilinmeyen sürümlü şifreli mesaj (metin yok, durum cümlesi) -->
          <p
            v-if="!message.content && message.e2eeStatus && message.e2eeStatus !== 'ok'"
            class="text-[14px] italic"
            style="color: var(--kv-text-muted);"
          >
            {{ e2eeNote }}
          </p>
          <!-- Yalnız ek (açıklamasız) -->
          <AttachmentView
            v-for="att in message.attachments"
            :key="att.id"
            :attachment="att"
          />
          <!-- Metinsiz mesajda tik, ekin altındaki son satırın sonunda -->
          <div v-if="showReceipt && receipt && !message.content" class="mt-0.5 text-[16px] leading-none">
            <ReceiptTick :receipt="receipt" />
          </div>
        </template>

        <!-- C35: webhook embed kartları (yalnız izinli alanlar, görsel yok) -->
        <MessageEmbeds
          v-if="message.embeds?.length"
          :embeds="message.embeds"
          :mention-resolver="mentionResolver"
          :role-resolver="roleResolver"
        />

        <!-- Reaksiyon pill'leri -->
        <div v-if="message.reactions?.length && !isLocal" class="flex flex-wrap gap-1 mt-1">
          <slot name="reactions" />
        </div>

      </template>

      <!-- C29: gönderilemedi satırı (tehlike rengi) + Tekrar dene · Sil -->
      <div
        v-if="message.localStatus === 'failed'"
        class="flex flex-wrap items-center gap-x-2 mt-0.5 text-[12px]"
        style="color: var(--kv-danger);"
        role="alert"
      >
        <span>{{ t('message.local.failed') }}<template v-if="message.localError"> · {{ message.localError }}</template></span>
        <span aria-hidden="true">·</span>
        <button type="button" class="underline cursor-pointer hover:opacity-80" @click="emit('retry', message)">
          {{ t('message.local.retry') }}
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" class="underline cursor-pointer hover:opacity-80" @click="emit('discard', message)">
          {{ t('message.local.discard') }}
        </button>
      </div>
    </div>
  </div>
</template>
