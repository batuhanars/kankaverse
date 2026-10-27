<script lang="ts">
/**
 * Modül-seviyesi singleton: hangi mesajın emoji picker'ı açık?
 * Tüm MessageActionsMenu örnekleri bu ref'i paylaşır → aynı anda yalnız BİR picker açık olur.
 */
import { ref as moduleRef } from 'vue'
const openPickerMessageId = moduleRef<string | null>(null)
</script>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import EmojiPicker from './EmojiPicker.vue'
import { recordEmojiUse } from '@/utils/frequentEmojis'
import EmojiFaceIcon from './EmojiFaceIcon.vue'

defineOptions({ name: 'MessageActionsMenu' })

const props = defineProps<{
  messageId: string
  isMine: boolean
  hasContent: boolean
  isPinned: boolean
  canPin: boolean
  // Faz 3: MANAGE_MESSAGES — başkasının mesajını da silebilir
  canManageMessages?: boolean
}>()

const emit = defineEmits<{
  reply: []
  forward: []
  edit: []
  delete: []
  report: []
  addReaction: [emoji: string]
  pin: []
  unpin: []
}>()

const { t } = useI18n()

// Hızlı reaksiyon şeridi (C24): hesaba bağlı, sunucu etkin listeyi (her zaman 5) oturum kullanıcısında döner.
// Alan bayat bir oturumda yoksa savunmacı olarak bugünkü varsayılan beşliye düşer.
const FALLBACK_QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢']
const authStore = useAuthStore()
const quickEmojis = computed(() => authStore.user?.quickReactions ?? FALLBACK_QUICK_REACTIONS)

// ⋯ daha-fazla açılır
const showMore = ref(false)
// hızlı emoji seti (⋯ içinde)
const showQuickEmoji = ref(false)

// Emoji picker açık mı? — modül singleton'a göre türetilir
const showEmojiPicker = computed(() => openPickerMessageId.value === props.messageId)

const moreEl = ref<HTMLElement | null>(null)
const emojiEl = ref<HTMLElement | null>(null)
// Emoji picker tetikleyici butonu (Teleport konumlandırması için)
const emojiTriggerEl = ref<HTMLElement | null>(null)

// Parent'ın araç çubuğunu görünür tutması için: herhangi bir menü açıkken true
const menuOpen = computed(() => showEmojiPicker.value || showMore.value)
defineExpose({ menuOpen })

function closeAll() {
  showMore.value = false
  showQuickEmoji.value = false
  // Yalnız kendi picker'ımızı kapat (diğer mesajların picker'ına dokunma)
  if (openPickerMessageId.value === props.messageId) {
    openPickerMessageId.value = null
  }
}

function onReply() {
  closeAll()
  emit('reply')
}

function onForward() {
  closeAll()
  emit('forward')
}

function onEdit() {
  closeAll()
  emit('edit')
}

function onDelete() {
  closeAll()
  emit('delete')
}

function onReport() {
  closeAll()
  emit('report')
}

function onPin() {
  closeAll()
  emit('pin')
}

function onUnpin() {
  closeAll()
  emit('unpin')
}

function toggleMore(e: MouseEvent) {
  e.stopPropagation()
  // Kendi picker'ımızı kapat (singleton)
  if (openPickerMessageId.value === props.messageId) {
    openPickerMessageId.value = null
  }
  showQuickEmoji.value = false
  showMore.value = !showMore.value
}

function toggleEmojiPicker(e: MouseEvent) {
  e.stopPropagation()
  showMore.value = false
  // Singleton: açıksa kapat, kapalıysa bu mesajı aktif yap (önceki otomatik kapanır)
  if (openPickerMessageId.value === props.messageId) {
    openPickerMessageId.value = null
  } else {
    openPickerMessageId.value = props.messageId
  }
}

function pickEmoji(emoji: string) {
  closeAll()
  emit('addReaction', emoji)
}

// Şerit dokunuşu seçiciden geçmez; kullanım burada sayılır (seçici kendi seçimini kendisi yazar).
function pickQuick(emoji: string) {
  recordEmojiUse(emoji)
  pickEmoji(emoji)
}

function onDocClick(e: MouseEvent) {
  const moreOpen = moreEl.value && moreEl.value.contains(e.target as Node)
  // Picker body'e Teleport edildiği için emojiEl.contains yetmez; .v3-emoji-picker ile de kontrol et.
  const emojiOpen =
    (emojiEl.value && emojiEl.value.contains(e.target as Node)) ||
    !!(e.target as Element)?.closest?.('.v3-emoji-picker')
  if (!moreOpen && !emojiOpen) {
    closeAll()
  }
}

function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeAll()
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onDocKeydown)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onDocKeydown)
})
</script>

<template>
  <!--
    Yatay hover araç çubuğu (Discord stili).
    Konum: üst bileşen tarafından absolute -top-3 right-4 ile konumlandırılır.
    Kap: kv-bg-elevated + 1px kv-border-subtle kenarlık + kv-radius-md, gölge yok.
  -->
  <div
    class="flex items-center rounded-[var(--kv-radius-md)] border"
    style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
    @click.stop
  >
    <!-- Hızlı reaksiyon emoji'leri -->
    <button
      v-for="emoji in quickEmojis"
      :key="emoji"
      class="w-8 h-8 flex items-center justify-center text-[16px] cursor-pointer rounded-[var(--kv-radius-md)] transition-colors hover:bg-[var(--kv-bg-sidebar)]"
      :title="emoji"
      @click="pickQuick(emoji)"
    >
      {{ emoji }}
    </button>

    <!-- Reaksiyon ekle (tam picker) — gri outline SVG ikon, renkli emojilerle karışmaz -->
    <div ref="emojiEl" class="relative">
      <button
        ref="emojiTriggerEl"
        class="w-8 h-8 flex items-center justify-center cursor-pointer rounded-[var(--kv-radius-md)] transition-colors hover:bg-[var(--kv-bg-sidebar)]"
        :class="showEmojiPicker ? 'bg-[var(--kv-bg-sidebar)]' : ''"
        :style="showEmojiPicker ? 'color: var(--kv-text-secondary)' : 'color: var(--kv-text-muted)'"
        :title="t('reaction.addReaction')"
        @click="toggleEmojiPicker"
      >
        <EmojiFaceIcon />
      </button>
      <!-- Tam emoji picker — Teleport to body ile viewport-farkındalıklı konumlandırma -->
      <EmojiPicker
        v-if="showEmojiPicker"
        :anchor-el="emojiTriggerEl"
        @select="pickEmoji"
      />
    </div>

    <!-- ↩ Yanıtla -->
    <button
      class="w-8 h-8 flex items-center justify-center text-[15px] cursor-pointer rounded-[var(--kv-radius-md)] transition-colors hover:bg-[var(--kv-bg-sidebar)]"
      style="color: var(--kv-text-muted);"
      :title="t('reply.button')"
      @click="onReply"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
    </button>

    <!-- ↪ İlet (forward — başka bir DM'e gönder) -->
    <button
      class="w-8 h-8 flex items-center justify-center text-[15px] cursor-pointer rounded-[var(--kv-radius-md)] transition-colors hover:bg-[var(--kv-bg-sidebar)]"
      style="color: var(--kv-text-muted);"
      :title="t('message.forward')"
      @click="onForward"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
    </button>

    <!-- ⋯ Daha fazla -->
    <div ref="moreEl" class="relative">
      <button
        class="w-8 h-8 flex items-center justify-center text-[16px] font-bold cursor-pointer rounded-[var(--kv-radius-md)] transition-colors hover:bg-[var(--kv-bg-sidebar)]"
        :class="showMore ? 'bg-[var(--kv-bg-sidebar)]' : ''"
        style="color: var(--kv-text-secondary); line-height: 1;"
        :title="t('message.actions')"
        @click="toggleMore"
      >
        ⋯
      </button>

      <!-- Daha fazla açılır menüsü -->
      <div
        v-if="showMore"
        class="absolute top-full right-0 mt-1 z-50 rounded-[var(--kv-radius-md)] py-1 min-w-[160px]"
        style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle);"
      >
        <!-- Düzenle (yalnız kendi + içerik varsa) -->
        <button
          v-if="isMine && hasContent"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer transition-colors text-left"
          style="color: var(--kv-text-primary);"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-accent-subtle)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = ''"
          @click="onEdit"
        >
          <span class="text-[15px] shrink-0">✏️</span>
          <span>{{ t('message.edit') }}</span>
        </button>

        <!-- Sil (kendi mesajı VEYA MANAGE_MESSAGES) -->
        <button
          v-if="isMine || canManageMessages"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer transition-colors text-left"
          style="color: var(--kv-danger);"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'rgba(242,59,75,0.1)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = ''"
          @click="onDelete"
        >
          <span class="text-[15px] shrink-0">🗑</span>
          <span>{{ t('message.delete') }}</span>
        </button>

        <!-- Sabitle / Sabitlemeyi kaldır (yetkiye göre) -->
        <button
          v-if="canPin && !isPinned"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer transition-colors text-left"
          style="color: var(--kv-text-primary);"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-accent-subtle)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = ''"
          @click="onPin"
        >
          <span class="text-[15px] shrink-0">📌</span>
          <span>{{ t('message.pin') }}</span>
        </button>
        <button
          v-if="canPin && isPinned"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer transition-colors text-left"
          style="color: var(--kv-text-primary);"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-accent-subtle)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = ''"
          @click="onUnpin"
        >
          <span class="text-[15px] shrink-0">📌</span>
          <span>{{ t('message.unpin') }}</span>
        </button>

        <!-- Şikâyet (yalnız başkasının mesajı) -->
        <button
          v-if="!isMine"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer transition-colors text-left"
          style="color: var(--kv-danger);"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'rgba(242,59,75,0.1)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = ''"
          @click="onReport"
        >
          <span class="text-[15px] shrink-0">🚩</span>
          <span>{{ t('report.reportMessage') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
