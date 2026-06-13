<!-- Sprint 5 §7: Attachment render — görsel inline önizleme + dosya indirme.
     Rule of Three: guild MessageItem + DM baloncuk = 2 kullanım → bu component'a promote edildi. -->
<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { attachmentsApi } from '@/api/attachments'
import { ScanStatus, type AttachmentDto } from '@/types'

const props = defineProps<{
  attachment: AttachmentDto
}>()

const { t } = useI18n()

const imageUrl = ref<string | null>(null)
const imageLoading = ref(false)
const imageError = ref<string | null>(null)
const downloading = ref(false)

const isImage = props.attachment.contentType.startsWith('image/')

// Görsel: mount'ta URL çek
if (isImage && props.attachment.scanStatus === ScanStatus.CLEAN) {
  imageLoading.value = true
  attachmentsApi
    .getUrl(props.attachment.id)
    .then((res) => {
      imageUrl.value = res.data.url
    })
    .catch((err: unknown) => {
      const code = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      if (code === 'ATTACHMENT_BLOCKED') {
        imageError.value = 'blocked'
      } else {
        imageError.value = 'not_ready'
      }
    })
    .finally(() => {
      imageLoading.value = false
    })
}

async function download() {
  if (downloading.value) return
  downloading.value = true
  try {
    const res = await attachmentsApi.getUrl(props.attachment.id)
    window.open(res.data.url, '_blank', 'noopener,noreferrer')
  } finally {
    downloading.value = false
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function openImage() {
  if (imageUrl.value) {
    window.open(imageUrl.value, '_blank', 'noopener,noreferrer')
  }
}
</script>

<template>
  <!-- GÖRSEL -->
  <div v-if="isImage" class="mt-1.5">
    <!-- PENDING -->
    <div
      v-if="attachment.scanStatus === ScanStatus.PENDING"
      class="flex items-center gap-2 px-3 py-2 rounded-[var(--kv-radius-sm)] text-[13px]"
      style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
    >
      <span>⏳</span>
      <span>{{ t('attachment.processing') }}</span>
    </div>

    <!-- FLAGGED / BLOCKED -->
    <div
      v-else-if="attachment.scanStatus === ScanStatus.FLAGGED || imageError === 'blocked'"
      class="flex items-center gap-2 px-3 py-2 rounded-[var(--kv-radius-sm)] text-[13px]"
      style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
    >
      <span>🚫</span>
      <span>{{ t('attachment.blocked') }}</span>
    </div>

    <!-- Yükleniyor -->
    <div
      v-else-if="imageLoading"
      class="flex items-center gap-2 px-3 py-2 rounded-[var(--kv-radius-sm)] text-[13px]"
      style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
    >
      <span>{{ t('common.loading') }}</span>
    </div>

    <!-- Beklenmeyen hata -->
    <div
      v-else-if="imageError"
      class="flex items-center gap-2 px-3 py-2 rounded-[var(--kv-radius-sm)] text-[13px]"
      style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
    >
      <span>{{ t('attachment.notReady') }}</span>
    </div>

    <!-- Görsel -->
    <img
      v-else-if="imageUrl"
      :src="imageUrl"
      :alt="attachment.filename"
      class="max-w-full rounded-[var(--kv-radius-sm)] cursor-pointer object-contain"
      style="max-width: 360px; max-height: 240px;"
      loading="lazy"
      @click="openImage"
    />
  </div>

  <!-- DOSYA -->
  <div
    v-else
    class="flex items-center gap-3 mt-1.5 px-3 py-2 rounded-[var(--kv-radius-sm)]"
    style="background-color: var(--kv-bg-elevated);"
  >
    <!-- Dosya ikonu -->
    <div
      class="w-8 h-8 flex items-center justify-center rounded text-[18px] shrink-0"
      style="background-color: var(--kv-bg-content);"
    >
      📄
    </div>
    <!-- Ad + boyut -->
    <div class="flex flex-col min-w-0 flex-1">
      <span
        class="text-[13px] font-medium truncate"
        style="color: var(--kv-text-primary);"
      >
        {{ attachment.filename }}
      </span>
      <span class="text-[11px]" style="color: var(--kv-text-muted);">
        {{ formatBytes(attachment.size) }}
      </span>
    </div>
    <!-- İndir butonu -->
    <button
      :disabled="
        downloading ||
        attachment.scanStatus === ScanStatus.PENDING ||
        attachment.scanStatus === ScanStatus.FLAGGED
      "
      class="text-[12px] px-2 py-1 rounded-[var(--kv-radius-sm)] transition-opacity cursor-pointer shrink-0"
      style="color: var(--kv-accent-500);"
      :class="
        downloading ||
        attachment.scanStatus === ScanStatus.PENDING ||
        attachment.scanStatus === ScanStatus.FLAGGED
          ? 'opacity-40 pointer-events-none'
          : 'hover:opacity-80'
      "
      @click="download"
    >
      <span v-if="attachment.scanStatus === ScanStatus.PENDING">{{ t('attachment.processing') }}</span>
      <span v-else-if="attachment.scanStatus === ScanStatus.FLAGGED">{{ t('attachment.blocked') }}</span>
      <span v-else>{{ t('attachment.download') }}</span>
    </button>
  </div>
</template>
