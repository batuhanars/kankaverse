<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { attachmentsApi } from '@/api/attachments'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'

const props = defineProps<{
  file: File
  channelId: string
}>()

const emit = defineEmits<{
  sent: [{ attachmentId: string; caption: string }]
  close: []
}>()

const { t } = useI18n()

// Upload state — düz ref'ler, dizi-proxy tuzağı yok
const uploadProgress = ref(0)
const uploading = ref(true)
const uploadError = ref<string | null>(null)
const attachmentId = ref<string | null>(null)
const caption = ref('')
const sending = ref(false)

// Görsel önizleme
const isImage = props.file.type.startsWith('image/')
const previewUrl = isImage ? URL.createObjectURL(props.file) : null

onUnmounted(() => {
  if (previewUrl) URL.revokeObjectURL(previewUrl)
})

// Upload'ı mount anında başlat
;(async () => {
  uploadError.value = null
  uploading.value = true

  let presignResult: { attachmentId: string; uploadUrl: string; storageKey: string }
  try {
    const res = await attachmentsApi.presign({
      filename: props.file.name,
      contentType: props.file.type,
      size: props.file.size,
    })
    presignResult = res.data
  } catch (err: unknown) {
    const code = (err as { response?: { data?: { error?: string } } }).response?.data?.error
    uploadError.value = code
      ? t(`attachment.errors.${code}`, t('attachment.errors.default'))
      : t('attachment.errors.default')
    uploading.value = false
    return
  }

  attachmentId.value = presignResult.attachmentId

  try {
    await attachmentsApi.uploadToS3(presignResult.uploadUrl, props.file, (pct) => {
      uploadProgress.value = pct
    })
    uploadProgress.value = 100
    uploading.value = false
  } catch {
    uploading.value = false
    uploadError.value = t('attachment.uploadFailed')
  }
})()

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Dosya türüne göre ikon SVG string
function fileTypeIcon(contentType: string): string {
  if (contentType === 'application/pdf') return 'pdf'
  if (
    contentType === 'application/msword' ||
    contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return 'doc'
  if (contentType === 'text/plain') return 'txt'
  return 'generic'
}

async function send() {
  if (!attachmentId.value || uploading.value || uploadError.value || sending.value) return
  sending.value = true
  try {
    emit('sent', { attachmentId: attachmentId.value, caption: caption.value.trim() })
  } finally {
    sending.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}
</script>

<template>
  <KvModal :title="t('attachment.compose.title')" @close="emit('close')">
    <!-- Önizleme alanı -->
    <div
      class="w-full rounded-[var(--kv-radius-md)] overflow-hidden mb-4 flex items-center justify-center"
      style="min-height: 180px; background-color: var(--kv-bg-rail);"
    >
      <!-- Görsel önizleme -->
      <img
        v-if="isImage && previewUrl"
        :src="previewUrl"
        :alt="file.name"
        class="max-w-full object-contain rounded-[var(--kv-radius-md)]"
        style="max-height: 260px;"
      />

      <!-- Görsel-dışı: ikon + ad + boyut -->
      <div v-else class="flex flex-col items-center gap-3 py-8 px-4">
        <!-- PDF ikon -->
        <svg
          v-if="fileTypeIcon(file.type) === 'pdf'"
          class="w-12 h-12"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect width="48" height="48" rx="8" fill="var(--kv-danger)" fill-opacity="0.15" />
          <path d="M12 6h18l8 8v28H12V6z" fill="var(--kv-danger)" fill-opacity="0.7" />
          <path d="M30 6l8 8h-8V6z" fill="var(--kv-danger)" />
          <text x="24" y="32" text-anchor="middle" font-size="9" font-weight="700" fill="var(--kv-danger)" font-family="sans-serif">PDF</text>
        </svg>

        <!-- DOC/DOCX ikon -->
        <svg
          v-else-if="fileTypeIcon(file.type) === 'doc'"
          class="w-12 h-12"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect width="48" height="48" rx="8" fill="var(--kv-info)" fill-opacity="0.15" />
          <path d="M12 6h18l8 8v28H12V6z" fill="var(--kv-info)" fill-opacity="0.7" />
          <path d="M30 6l8 8h-8V6z" fill="var(--kv-info)" />
          <text x="24" y="32" text-anchor="middle" font-size="9" font-weight="700" fill="var(--kv-info)" font-family="sans-serif">DOC</text>
        </svg>

        <!-- TXT ikon -->
        <svg
          v-else-if="fileTypeIcon(file.type) === 'txt'"
          class="w-12 h-12"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect width="48" height="48" rx="8" fill="var(--kv-text-muted)" fill-opacity="0.2" />
          <path d="M12 6h18l8 8v28H12V6z" fill="var(--kv-text-secondary)" fill-opacity="0.7" />
          <path d="M30 6l8 8h-8V6z" fill="var(--kv-text-secondary)" />
          <text x="24" y="32" text-anchor="middle" font-size="9" font-weight="700" fill="var(--kv-text-primary)" font-family="sans-serif">TXT</text>
        </svg>

        <!-- Genel dosya ikonu -->
        <svg
          v-else
          class="w-12 h-12"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect width="48" height="48" rx="8" fill="var(--kv-accent-500)" fill-opacity="0.15" />
          <path d="M12 6h18l8 8v28H12V6z" fill="var(--kv-accent-500)" fill-opacity="0.7" />
          <path d="M30 6l8 8h-8V6z" fill="var(--kv-accent-500)" />
          <path d="M18 22h12M18 28h8" stroke="white" stroke-width="1.5" stroke-linecap="round" />
        </svg>

        <span class="text-[13px] font-medium truncate max-w-[200px] text-center" style="color: var(--kv-text-primary);">
          {{ file.name }}
        </span>
        <span class="text-[12px]" style="color: var(--kv-text-muted);">
          {{ formatBytes(file.size) }}
        </span>
      </div>
    </div>

    <!-- Yükleme ilerleme çubuğu -->
    <div v-if="uploading" class="mb-3">
      <div
        class="w-full h-1 rounded-full overflow-hidden"
        style="background-color: var(--kv-bg-elevated);"
      >
        <div
          class="h-full rounded-full transition-all duration-200"
          style="background-color: var(--kv-accent-500);"
          :style="{ width: `${uploadProgress}%` }"
        />
      </div>
      <p class="text-[12px] mt-1" style="color: var(--kv-text-muted);">
        {{ t('attachment.compose.uploading', { pct: uploadProgress }) }}
      </p>
    </div>

    <!-- Yükleme hatası -->
    <div
      v-if="uploadError"
      class="mb-3 px-3 py-2 rounded-[var(--kv-radius-sm)] text-[13px]"
      style="background-color: var(--kv-bg-elevated); color: var(--kv-danger);"
    >
      {{ uploadError }}
    </div>

    <!-- Caption textarea -->
    <textarea
      v-model="caption"
      :placeholder="t('attachment.compose.captionPlaceholder')"
      rows="2"
      class="w-full px-3 py-2 rounded-[var(--kv-radius-md)] border text-[14px] resize-none outline-none bg-transparent mb-4"
      style="
        background-color: var(--kv-bg-elevated);
        border-color: var(--kv-border-strong);
        color: var(--kv-text-primary);
        font-family: var(--kv-font-ui);
      "
      @keydown="onKeydown"
    />

    <!-- Aksiyonlar -->
    <div class="flex gap-3 justify-end">
      <KvButton variant="ghost" @click="emit('close')">{{ t('common.cancel') }}</KvButton>
      <KvButton
        variant="primary"
        :loading="sending"
        :disabled="uploading || !!uploadError || !attachmentId"
        @click="send"
      >
        {{ uploading ? t('attachment.compose.wait') : t('attachment.compose.send') }}
      </KvButton>
    </div>
  </KvModal>
</template>
