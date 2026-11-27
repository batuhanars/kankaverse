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
import UserCardPopover from './UserCardPopover.vue'
import { useGuildsStore } from '@/stores/guilds'
import { useDmStore } from '@/stores/dm'
import { formatMentionsPlain } from '@/utils/mentions'
import { renderMessageHtml } from '@/utils/markdown'
import { hoverAvatarSrc } from '@/utils/animatedMedia'
import { useActiveMenu } from '@/composables/useActiveMenu'
import { useMessageJump } from '@/composables/useMessageJump'
import { injectMessageSelection } from '@/composables/useMessageSelection'
import { useToastStore } from '@/stores/toast'
import { downloadAttachments, isDownloadable } from '@/utils/downloadAttachment'
import SelectCheckbox from './SelectCheckbox.vue'
import type { MessageDto } from '@/types'
import PinIcon from '@/components/shared/PinIcon.vue'

// MessageActionsMenu instance ref — menuOpen'ı okumak için
const actionsMenuRef = ref<InstanceType<typeof MessageActionsMenu> | null>(null)

const props = withDefaults(defineProps<{
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
  // C57: false → Yanıtla gizlenir (salt okunur kanal). Verilmezse true: Vue `boolean` prop'u verilmeyince
  // `false`a çevirir, bu yüzden varsayılan açıkça yazılır (DM bu prop'u geçmiyor, Yanıtla gizleniyordu).
  canReply?: boolean
  // C62: salt okunur satır (ayrıldığım grup): araç çubuğu ve sağ tık yalnız Kopyala + Şikâyet (T&S). Varsayılan false.
  readOnly?: boolean
}>(), { canReply: true, readOnly: false })

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

// C82: tek menü (sağ tık ve ⋯). isMenuOpen'dan ÖNCE tanımlı olmalı: izleyici kurulurken okunur (TDZ).
const ctxMenu = ref<{ x: number; y: number; selection: string; attachmentId: string | null } | null>(null)

// Bu mesajın menüsü (sağ tık / ⋯) / emoji picker'ı açık mı? (MessageActionsMenu.menuOpen expose eder)
const isMenuOpen = computed(() => !!actionsMenuRef.value?.menuOpen || !!ctxMenu.value)

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

// Sahip revizesi 2026-11-12: avatara ya da ada tıklayınca kullanıcı kartı (Bahset, mesaj gönder, kanka ekle,
// ⋯ profili gör / ID kopyala / şikâyet). Üye panelindeki kartın aynısı; ortam kanalında rol bağlamıyla.
const guildsStore = useGuildsStore()
const dmStore = useDmStore()
const card = ref<{ x: number; y: number } | null>(null)
// DM'de ortam bağlamı verilmez (başka ortamın rolleri karta sızmasın).
const cardGuildId = computed(() =>
  dmStore.channels.some((c) => c.id === props.message.channelId)
    ? undefined
    : (guildsStore.activeGuildId ?? undefined),
)
function openCard(e: MouseEvent) {
  if (isWebhook.value || props.message.localStatus) return
  card.value = { x: e.clientX, y: e.clientY }
}

// C29 — geçici (iyimser) mesaj: menü/tepki/düzenle/sil/sabitle/yanıtla/ilet KAPALI, yalnız Tekrar dene / Sil.
const isLocal = computed(() => !!props.message.localStatus)
// C34: tik yalnız gönderilmiş (yerel/bekleyen olmayan) mesajda; sunucu bilgi vermediyse (`receipt` null) hiç çizilmez.
const showReceipt = computed(() => !!props.receipt && !isLocal.value)

// C82: tek menü. Sağ tık da ⋯ de aynı MessageContextMenu'yu açar; bayraklar burada hesaplanır.
const canCopy = computed(() => !!props.message.content)
const canEdit = computed(() => !props.readOnly && props.isMine && !!props.message.content)
const canDelete = computed(() => !props.readOnly && (props.isMine || !!props.canManageMessages))
// Şikâyet: yalnız başkasının mesajı (C62 §2.3.c: eski grupta da açık, T&S)
const canReport = computed(() => !props.isMine)

// C82: seçim modu (liste sahibi sağlar; sağlamayan görünümde seçim yok)
const selection = injectMessageSelection()
const selecting = computed(() => !!selection?.active.value)
const isSelected = computed(() => !!selection?.isSelected(props.message.id))
const toast = useToastStore()
watch(selecting, (on) => {
  if (!on) return
  ctxMenu.value = null
  actionsMenuRef.value?.closeAll()
})

/** Farklı kaydet: sağ tık bir ekin üstündeyse o ek, değilse tek ek → o, çok ek → hepsi. */
const saveMode = computed<'one' | 'all' | null>(() => {
  const atts = (props.message.attachments ?? []).filter(isDownloadable)
  if (!atts.length) return null
  return ctxMenu.value?.attachmentId || atts.length === 1 ? 'one' : 'all'
})

async function saveAttachments(attachmentId: string | null) {
  const atts = (props.message.attachments ?? []).filter(isDownloadable)
  const picked = attachmentId ? atts.filter((a) => a.id === attachmentId) : atts
  try {
    await downloadAttachments(picked.map((a) => ({ id: a.id, filename: a.filename })))
  } catch {
    toast.error(t('toast.saveError'))
  }
}

/** Satır içinde seçili metin; menüye tıklayınca seçim kaybolabildiği için açılışta okunur. */
function selectionIn(row: HTMLElement): string {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) return ''
  return row.contains(sel.anchorNode) && row.contains(sel.focusNode) ? sel.toString() : ''
}

function openMenu(x: number, y: number, selectedText: string, attachmentId: string | null) {
  actionsMenuRef.value?.closeAll()
  ctxMenu.value = { x, y, selection: selectedText, attachmentId }
}

function onRowContext(e: MouseEvent) {
  // Düzenleme kutusunda, gönderilmemiş mesajda ve seçim modunda tarayıcının/masaüstünün kendi menüsü kalır.
  if (props.isEditing || isLocal.value || selecting.value) return
  e.preventDefault()
  // Belgedeki kapatıcılara ulaşmasın: aynı satırda yeniden sağ tık menüyü kapatmak yerine taşır.
  e.stopPropagation()
  const attachmentId = (e.target as Element).closest('[data-attachment-id]')?.getAttribute('data-attachment-id') ?? null
  openMenu(e.clientX, e.clientY, selectionIn(e.currentTarget as HTMLElement), attachmentId)
}

/** ⋯ düğmesi: menü açıksa kapatır, değilse düğmenin altında açar. */
function onMore(x: number, y: number) {
  if (ctxMenu.value) ctxMenu.value = null
  else openMenu(x, y, '', null)
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
  // Başka bir mesajın menüsü açıkken ya da seçim modundayken (vurguyu seçim belirler) hover-vurgusu yok.
  if (toolbarSuppressed.value || selecting.value) return
  ;(e.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'
  showFollowTime.value = true
}

function onRowLeave(e: MouseEvent) {
  rowHovered.value = false
  if (selecting.value) return
  ;(e.currentTarget as HTMLElement).style.backgroundColor = ''
  showFollowTime.value = false
}

// Yanıt alıntısı: bahsetmeler okunur ada çevrilmiş düz metin + tıklayınca alıntılanan mesaja git.
const replyText = computed(() =>
  props.message.replyTo?.editedAfterLeave
    ? t('message.editedAfterLeave') // C62: eski üye penceresi, alıntılanan mesaj ayrıldıktan sonra düzenlendi
    : props.message.replyTo?.e2eeUnknown
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
  if (s === 'unverified') return t('e2ee.unverified') // E4: parmak izi tutmadı, gövde gösterilmez
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

// Satır vurgusu: seçiliyse elevated; bahsedilmede sol-aksan çizgisi + accent zemin (seçim zemini ezer)
const rowStyle = computed(() => {
  const border = props.isMentioned ? 'border-color: var(--kv-accent-500);' : ''
  if (isSelected.value) return `${border} background-color: var(--kv-bg-elevated);`
  return props.isMentioned ? `${border} background-color: var(--kv-accent-subtle);` : ''
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
    :class="[isGroupStart ? 'mt-4 py-0.5' : 'py-0.5', isMentioned ? 'border-l-2' : '', selecting ? 'select-none' : '']"
    :style="rowStyle"
    @mouseenter="onRowEnter"
    @mouseleave="onRowLeave"
    @contextmenu="onRowContext"
  >
    <!-- C82: seçim modunda satırın tamamı tek tıklama hedefi (görsel büyütme, bağlantı, tepki vb. çalışmaz) -->
    <div v-if="selecting" class="absolute inset-0 z-20 cursor-pointer" @click.stop="selection?.toggle(message)" />
    <SelectCheckbox v-if="selecting" :checked="isSelected" :disabled="isLocal" />

    <MessageContextMenu
      v-if="ctxMenu"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :message-id="message.id"
      :can-reply="canReply !== false && !readOnly"
      :can-copy="canCopy"
      :can-forward="!readOnly"
      :can-pin="!!canPin && !readOnly"
      :is-pinned="!!message.pinnedAt"
      :can-edit="canEdit"
      :can-view-reactions="!!message.reactions?.length && !readOnly"
      :can-select="!!selection"
      :save-mode="saveMode"
      :can-delete="canDelete"
      :can-report="canReport"
      @close="ctxMenu = null"
      @reply="emit('reply', message)"
      @copy="copyText(ctxMenu?.selection)"
      @forward="emit('forward', message)"
      @pin="emit('pin', message.id)"
      @unpin="emit('unpin', message.id)"
      @edit="emit('edit', message)"
      @view-reactions="emit('viewReactions', message.id)"
      @select="selection?.start(message)"
      @save="saveAttachments(ctxMenu?.attachmentId ?? null)"
      @delete="emit('delete', message.id)"
      @report="emit('report', message.id)"
    />

    <!-- Hover araç çubuğu: -top-3 right-4, yalnız düzenleme modunda gizli.
         - Bu mesajın menüsü açıksa (emoji picker / ⋯) → grup-hover'dan bağımsız görünür kalır (z-40).
         - BAŞKA mesajın menüsü açıksa (toolbarSuppressed) → hover ile bile gizli kalır.
         - Aksi halde → normal hover davranışı. -->
    <div
      v-if="!isEditing && !isLocal && !selecting"
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
        :can-reply="canReply !== false"
        :read-only="readOnly"
        :more-open="!!ctxMenu"
        @reply="emit('reply', message)"
        @forward="emit('forward', message)"
        @add-reaction="(emoji) => emit('addReaction', message.id, emoji)"
        @more="onMore"
      />
    </div>

    <!-- Sol: avatar sütunu (40px sabit) -->
    <div class="w-10 shrink-0 flex flex-col items-center">
      <template v-if="isGroupStart">
        <!-- Grup başı: 40px daire avatar -->
        <div
          class="w-10 h-10 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[15px] font-semibold text-white"
          :class="isWebhook ? '' : 'cursor-pointer'"
          style="background-color: var(--kv-accent-500);"
          @click="openCard"
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
          :class="isWebhook ? '' : 'cursor-pointer hover:underline'"
          style="color: var(--kv-text-primary);"
          @click="openCard"
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
          <PinIcon :size="12" class="inline align-[-1px]" />
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
            <div v-for="att in message.attachments" :key="att.id" class="contents" :data-attachment-id="att.id">
              <AttachmentView :attachment="att" class="!mt-0" />
            </div>
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
            ><PinIcon :size="12" class="inline align-[-1px]" /></span></template><ReceiptTick v-if="showReceipt && receipt" :receipt="receipt" />
          </div>
          <!-- C62: ayrıldıktan sonra düzenlenen mesaj (eski üye penceresi) — e2ee etiketinden ÖNCE -->
          <p
            v-if="message.editedAfterLeave"
            class="text-[14px] italic"
            style="color: var(--kv-text-muted);"
          >
            {{ t('message.editedAfterLeave') }}
          </p>
          <!-- E1: çözülemeyen / bilinmeyen sürümlü şifreli mesaj (metin yok, durum cümlesi) -->
          <p
            v-else-if="!message.content && message.e2eeStatus && message.e2eeStatus !== 'ok'"
            class="text-[14px] italic"
            style="color: var(--kv-text-muted);"
          >
            {{ e2eeNote }}
          </p>
          <!-- Yalnız ek (açıklamasız) -->
          <div v-for="att in message.attachments" :key="att.id" class="contents" :data-attachment-id="att.id">
            <AttachmentView :attachment="att" />
          </div>
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
    <UserCardPopover
      v-if="card"
      :user-id="message.author.id"
      :x="card.x"
      :y="card.y"
      :guild-id="cardGuildId"
      @close="card = null"
    />
  </div>
</template>
