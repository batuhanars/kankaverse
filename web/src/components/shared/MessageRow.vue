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
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AttachmentView from './AttachmentView.vue'
import MessageActionsMenu from './MessageActionsMenu.vue'
import type { MessageDto } from '@/types'

const props = defineProps<{
  message: MessageDto
  isMine: boolean
  isGroupStart: boolean
  // Düzenleme modunda mı? (parent yönetir, bu sadece UI'ı gizler)
  isEditing?: boolean
}>()

const emit = defineEmits<{
  reply: [message: MessageDto]
  edit: [message: MessageDto]
  delete: [messageId: string]
  report: [messageId: string]
  addReaction: [messageId: string, emoji: string]
}>()

const { t } = useI18n()

// Takip mesajına hover'da saat gösterimi
const showFollowTime = ref(false)

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
}

// Satır arka plan hover (inline style ile — Tailwind arbitrary değeri token taşımaz)
function onRowEnter(e: MouseEvent) {
  ;(e.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'
  showFollowTime.value = true
}

function onRowLeave(e: MouseEvent) {
  ;(e.currentTarget as HTMLElement).style.backgroundColor = ''
  showFollowTime.value = false
}
</script>

<template>
  <!--
    Satır: flex gap-3 px-4
    - Sol: avatar sütunu (40px)
    - Sağ: içerik sütunu (flex-1 min-w-0)
    isGroupStart=true  → mt-4 (grup arası boşluk)
    isGroupStart=false → py-0.5 (sıkı takip)
  -->
  <div
    class="relative flex gap-3 px-4 rounded group"
    :class="isGroupStart ? 'mt-4 py-0.5' : 'py-0.5'"
    @mouseenter="onRowEnter"
    @mouseleave="onRowLeave"
  >
    <!-- Hover araç çubuğu: -top-3 right-4, yalnız düzenleme modunda gizli -->
    <div
      v-if="!isEditing"
      class="absolute -top-3 right-4 opacity-0 group-hover:opacity-100 transition-opacity z-10"
    >
      <MessageActionsMenu
        :message-id="message.id"
        :is-mine="isMine"
        :has-content="!!message.content"
        @reply="emit('reply', message)"
        @edit="emit('edit', message)"
        @delete="emit('delete', message.id)"
        @report="emit('report', message.id)"
        @add-reaction="(emoji) => emit('addReaction', message.id, emoji)"
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
            v-if="message.author.avatarUrl"
            :src="message.author.avatarUrl"
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
      <!-- Grup başı başlık: kullanıcı adı + saat + (düzenlendi) -->
      <div v-if="isGroupStart" class="flex items-baseline gap-2 mb-0.5">
        <span
          class="text-[16px] font-semibold leading-snug"
          style="color: var(--kv-text-primary);"
        >
          {{ message.author.username }}
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
          <span class="truncate">{{ message.replyTo.content }}</span>
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
            <p
              class="px-3 pb-3 pt-1.5 text-[16px] break-words whitespace-pre-wrap"
              style="color: var(--kv-text-primary);"
            >
              {{ message.content }}
            </p>
          </div>
        </template>
        <template v-else>
          <!-- Yalnız metin -->
          <p
            v-if="message.content"
            class="text-[16px] break-words whitespace-pre-wrap"
            style="color: var(--kv-text-primary);"
          >
            {{ message.content }}
            <!-- Takip mesajında (başlık yok) "(düzenlendi)" metni gövde sonrasında -->
            <span
              v-if="message.editedAt && !isGroupStart"
              class="text-[11px] ml-1"
              style="color: var(--kv-text-muted);"
            >
              {{ t('message.edited') }}
            </span>
          </p>
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
      </template>
    </div>
  </div>
</template>
