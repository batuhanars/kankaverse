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
import MessageActionsMenu from './MessageActionsMenu.vue'
import { formatMentionsPlain } from '@/utils/mentions'
import { renderMessageHtml } from '@/utils/markdown'
import { hoverAvatarSrc } from '@/utils/animatedMedia'
import { useActiveMenu } from '@/composables/useActiveMenu'
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
}>()

const emit = defineEmits<{
  reply: [message: MessageDto]
  forward: [message: MessageDto]
  edit: [message: MessageDto]
  delete: [messageId: string]
  report: [messageId: string]
  addReaction: [messageId: string, emoji: string]
  pin: [messageId: string]
  unpin: [messageId: string]
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

// Sprint V2 (Markdown): mesaj içeriğini güvenli HTML'e dönüştür.
// renderMessageHtml: markdown-it render + DOMPurify sanitize + mention span.
// v-html yalnız bu sanitize edilmiş string'i alır — ham içerik asla doğrudan girmez.
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
  >
    <!-- Hover araç çubuğu: -top-3 right-4, yalnız düzenleme modunda gizli.
         - Bu mesajın menüsü açıksa (emoji picker / ⋯) → grup-hover'dan bağımsız görünür kalır (z-40).
         - BAŞKA mesajın menüsü açıksa (toolbarSuppressed) → hover ile bile gizli kalır.
         - Aksi halde → normal hover davranışı. -->
    <div
      v-if="!isEditing"
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
        @reply="emit('reply', message)"
        @forward="emit('forward', message)"
        @edit="emit('edit', message)"
        @delete="emit('delete', message.id)"
        @report="emit('report', message.id)"
        @add-reaction="(emoji) => emit('addReaction', message.id, emoji)"
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
          <img
            v-if="authorAvatarSrc"
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
    <div class="flex-1 min-w-0">
      <!-- Grup başı başlık: kullanıcı adı + saat + (düzenlendi) + pin rozeti -->
      <div v-if="isGroupStart" class="flex items-baseline gap-2 mb-0.5">
        <span
          class="text-[16px] font-semibold leading-snug"
          style="color: var(--kv-text-primary);"
        >
          {{ message.author.username }}<span v-if="message.author.roleEmoji" class="ml-1 font-normal">{{ message.author.roleEmoji }}</span>
        </span>
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

      <!-- Yanıt alıntısı (replyToId doluysa, gövdenin üstünde) -->
      <div
        v-if="message.replyToId"
        class="flex items-center gap-1.5 mb-1 pl-2 text-[12px] max-w-[480px] truncate cursor-default rounded-[var(--kv-radius-sm)]"
        style="border-left: 2px solid var(--kv-text-muted); color: var(--kv-text-muted);"
      >
        <span class="shrink-0">↩</span>
        <template v-if="message.replyTo">
          <span class="font-semibold shrink-0" style="color: var(--kv-text-secondary);">
            {{ message.replyTo.authorUsername }}
          </span>
          <span class="truncate">{{ formatMentionsPlain(message.replyTo.content, (id) => mentionResolver?.(id), t('mention.unknown'), (roleId) => roleResolver?.(roleId)?.name) }}</span>
        </template>
        <template v-else>
          <span class="italic">{{ t('reply.deleted') }}</span>
        </template>
      </div>

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
            <div
              class="kv-md px-3 pb-3 pt-1.5 text-[16px] break-words"
              style="color: var(--kv-text-primary);"
              v-html="renderedContent"
            />
          </div>
        </template>
        <template v-else>
          <!-- Yalnız metin: markdown render (güvenli v-html) -->
          <div
            v-if="message.content"
            class="kv-md text-[16px] break-words"
            style="color: var(--kv-text-primary);"
            v-html="renderedContent"
          />
          <!-- Takip mesajında (başlık yok) "(düzenlendi)" metni + pin rozeti gövde dışında -->
          <template v-if="!isGroupStart && message.content">
            <span
              v-if="message.editedAt"
              class="text-[11px] ml-1"
              style="color: var(--kv-text-muted);"
            >
              {{ t('message.edited') }}
            </span>
            <span
              v-if="message.pinnedAt"
              class="text-[11px] ml-1 select-none"
              style="color: var(--kv-text-muted);"
              :title="t('message.pinnedMessages')"
            >
              📌
            </span>
          </template>
          <!-- Yalnız ek (açıklamasız) -->
          <AttachmentView
            v-for="att in message.attachments"
            :key="att.id"
            :attachment="att"
          />
        </template>

        <!-- Reaksiyon pill'leri -->
        <div v-if="message.reactions?.length" class="flex flex-wrap gap-1 mt-1">
          <slot name="reactions" />
        </div>

        <!-- C12 §4.2 — okundu göstergesi. YALNIZ kendi mesajımda ve YALNIZ sunucu bilgiyi
             vermişse (`receipt` null ise hiç çizilmez: gizlilik kapalı, bekleyen istek, engel,
             grup DM, ortam kanalı). "Takılı kalmış tek tik" görüntüsü bilerek yok — gösterge ya
             anlamlıdır ya da hiç yoktur. İkon tek başına bilgi taşımasın diye `title` + `aria-label`
             i18n'den geliyor. -->
        <div v-if="receipt" class="flex justify-end mt-0.5 select-none">
          <span
            class="inline-flex items-center"
            :style="`color: ${receipt === 'seen' ? 'var(--kv-accent-500)' : 'var(--kv-text-muted)'};`"
            :title="t(`message.receipt.${receipt}`)"
            :aria-label="t(`message.receipt.${receipt}`)"
            role="img"
          >
            <svg width="16" height="12" viewBox="0 0 20 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M1 6.5 4.5 10 11 2" />
              <path v-if="receipt === 'seen'" d="M8 6.5 11.5 10 18 2" />
            </svg>
          </span>
        </div>
      </template>
    </div>
  </div>
</template>
