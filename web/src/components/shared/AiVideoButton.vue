<script setup lang="ts">
/**
 * AiVideoButton (Sprint C14 §3.2-1): mesaj kutusunun "Yapay zeka ile üret" girişi (kanal + DM ortak).
 * `aiVideoAllowed` ya da `aiVideoPreview` (C33 pasif tanıtım) iken render olur; minörde ikisi de false. C14b: "Kaydet ve gönder" bekleyen ek
 * üretir; `attachment` ile kimliği çıkar, çağıran MEVCUT mesaj gönderme yoluna (onAttachmentSent) verir.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import AiVideoDialog from '@/components/shared/AiVideoDialog.vue'

const emit = defineEmits<{ attachment: [attachmentId: string] }>()
const { t } = useI18n()
const authStore = useAuthStore()
// C33: izinli ya da pasif tanıtım (reşit + bayrak açık). Kilitliyken pencere açılır ama hiç istek atılmaz.
const allowed = computed(
  () => authStore.user?.aiVideoAllowed === true || authStore.user?.aiVideoPreview === true,
)
const open = ref(false)

function onSend(attachmentId: string) {
  open.value = false
  emit('attachment', attachmentId)
}
</script>

<template>
  <button
    v-if="allowed"
    type="button"
    class="emoji-btn ai-btn shrink-0 self-center py-1 px-1 cursor-pointer flex items-center"
    :aria-label="t('aiVideo.button')"
    :title="t('aiVideo.button')"
    @click="open = true"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
      <path d="M19 15v4M17 17h4" />
    </svg>
  </button>
  <AiVideoDialog v-if="open" mode="chat" @close="open = false" @send="onSend" />
</template>
