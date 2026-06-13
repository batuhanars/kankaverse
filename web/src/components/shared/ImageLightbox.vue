<!-- Sprint 6.x: Görsel lightbox — uygulama içi tam ekran önizleme.
     Esc / dışına tıkla / ✕ ile kapanır. Gölge yok (tasarım sistemi). -->
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  url: string
  filename?: string
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})

function download() {
  const a = document.createElement('a')
  a.href = props.url
  a.download = props.filename ?? 'gorsel'
  a.rel = 'noopener noreferrer'
  a.click()
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center"
      style="background-color: var(--kv-bg-overlay);"
      @click.self="emit('close')"
    >
      <!-- Kapat butonu -->
      <button
        class="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full text-[20px] cursor-pointer transition-opacity hover:opacity-70"
        style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);"
        :aria-label="t('common.close')"
        @click="emit('close')"
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
        class="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-[var(--kv-radius-sm)] text-[13px] font-medium cursor-pointer transition-opacity hover:opacity-80"
        style="background-color: var(--kv-bg-elevated); color: var(--kv-accent-500);"
        @click="download"
      >
        {{ t('attachment.download') }}
      </button>
    </div>
  </Teleport>
</template>
