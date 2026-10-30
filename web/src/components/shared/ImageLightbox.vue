<!-- Sprint 6.x: Görsel lightbox — uygulama içi tam ekran önizleme.
     Esc / dışına tıkla / ✕ ile kapanır. Gölge yok (tasarım sistemi). -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { downloadAttachment } from '@/utils/downloadAttachment'

const props = defineProps<{
  url: string
  attachmentId?: string // yoksa indirme düğmesi çıkmaz (C39: başkasının avatarı)
  filename?: string
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

// Pencere yakalama aşamasında dinler: başka bir modalın içinden açıldığında Esc yalnız görüntüleyiciyi kapatır
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  e.stopPropagation()
  emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
})

const downloading = ref(false)
async function download() {
  if (downloading.value || !props.attachmentId) return
  downloading.value = true
  try {
    await downloadAttachment(props.attachmentId)
  } catch {
    // sessiz: adres alınamazsa görsel zaten ekranda, kullanıcı tekrar deneyebilir
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center"
      style="background-color: var(--kv-bg-overlay);"
      @click.self.stop="emit('close')"
    >
      <!-- Kapat butonu -->
      <button
        class="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full text-[20px] cursor-pointer transition-opacity hover:opacity-70"
        style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);"
        :aria-label="t('common.close')"
        @click.stop="emit('close')"
      >
        ✕
      </button>

      <!-- Görsel -->
      <img
        :src="url"
        :alt="filename ?? ''"
        class="rounded-[var(--kv-radius-sm)] object-contain"
        style="max-width: 90vw; max-height: 90vh;"
      />

      <!-- İndir butonu -->
      <button
        v-if="attachmentId"
        :disabled="downloading"
        class="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-[var(--kv-radius-sm)] text-[13px] font-medium cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-50"
        style="background-color: var(--kv-bg-elevated); color: var(--kv-accent-500);"
        @click="download"
      >
        {{ t('attachment.download') }}
      </button>
    </div>
  </Teleport>
</template>
