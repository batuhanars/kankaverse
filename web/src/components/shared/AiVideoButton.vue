<script setup lang="ts">
/**
 * AiVideoButton (Sprint C14 §3.2-1): mesaj kutusunun "Yapay zeka ile üret" girişi (kanal + DM ortak).
 * Yalnız `aiVideoAllowed === true` iken render olur (kilitli iskele yok). Üretilen dosya `file` ile çıkar,
 * çağıran mevcut ek hattına (takeFiles) verir.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import AiVideoDialog from '@/components/shared/AiVideoDialog.vue'

const emit = defineEmits<{ file: [file: File] }>()
const { t } = useI18n()
const authStore = useAuthStore()
const allowed = computed(() => authStore.user?.aiVideoAllowed === true)
const open = ref(false)

function onUse(file: File) {
  open.value = false
  emit('file', file)
}
</script>

<template>
  <button
    v-if="allowed"
    type="button"
    class="emoji-btn shrink-0 self-center py-1 px-1 cursor-pointer flex items-center"
    :aria-label="t('aiVideo.button')"
    :title="t('aiVideo.button')"
    @click="open = true"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
      <path d="M19 15v4M17 17h4" />
    </svg>
  </button>
  <AiVideoDialog v-if="open" :use-label="t('aiVideo.useInChat')" @close="open = false" @use="onUse" />
</template>
