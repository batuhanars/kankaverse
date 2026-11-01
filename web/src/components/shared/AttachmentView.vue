<!-- Sprint 5 §7: Attachment render — görsel inline önizleme + dosya indirme.
     Sprint 5 R1: tipli dosya ikonu (pdf/doc/txt/genel) + PDF "Aç" butonu.
     Sprint 6.x: Görsel tıkla → uygulama-içi lightbox (yeni sekme YOK). -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { attachmentsApi } from '@/api/attachments'
import { downloadAttachment } from '@/utils/downloadAttachment'
import { ScanStatus, type AttachmentDto } from '@/types'
import ImageLightbox from './ImageLightbox.vue'
import VoicePlayer from './VoicePlayer.vue'
import VideoCard from './VideoCard.vue'

const props = defineProps<{
  attachment: AttachmentDto
}>()

const { t } = useI18n()

const imageUrl = ref<string | null>(null)
const imageLoading = ref(false)
const imageError = ref<string | null>(null)
const downloading = ref(false)
const lightboxOpen = ref(false)

const isImage = props.attachment.contentType.startsWith('image/')
// M6b: sesli mesaj (ve yüklenen ses dosyası) → oynatıcı, dosya kartı değil
const isAudio = props.attachment.contentType.startsWith('audio/')
// M6c: video → küçük resim kartı
const isVideo = props.attachment.contentType.startsWith('video/')
const isPdf = props.attachment.contentType === 'application/pdf'
const isDoc =
  props.attachment.contentType === 'application/msword' ||
  props.attachment.contentType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const isTxt = props.attachment.contentType === 'text/plain'

const isBlocked = computed(
  () =>
    props.attachment.scanStatus === ScanStatus.FLAGGED || imageError.value === 'blocked',
)
const isPending = computed(() => props.attachment.scanStatus === ScanStatus.PENDING)
const isActionDisabled = computed(
  () => downloading.value || isPending.value || isBlocked.value,
)

function loadImageUrl() {
  imageLoading.value = true
  return attachmentsApi
    .getUrl(props.attachment.id)
    .then((res) => {
      imageUrl.value = res.data.url
    })
    .catch((err: unknown) => {
      const code = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      imageError.value = code === 'ATTACHMENT_BLOCKED' ? 'blocked' : 'not_ready'
    })
    .finally(() => {
      imageLoading.value = false
    })
}

// Görsel: mount'ta URL çek
if (isImage && props.attachment.scanStatus === ScanStatus.CLEAN) {
  loadImageUrl()
}

/**
 * 🔴 Adres ölmüşse BİR KEZ tazele (sahip bulgusu 2026-08-06: uzun süre açık kalan sekmede
 * görseller kırık ikonla geliyordu, dosya kartları sağlamdı).
 *
 * Sebep: `getUrl` presigned ve **300 sn** ömürlü, ama `<img loading="lazy">` indirmeyi görsel
 * ekrana girene kadar erteliyor. Mesaj geldiğinde adres alınıyor, kullanıcı başka yere bakıyorsa
 * indirme dakikalar/saatler sonra oluyor ve adres çoktan ölmüş oluyor → 403 → kırık görsel.
 * Dosya kartı etkilenmiyordu çünkü o, tıklama anında taze adres alıyor.
 *
 * Aynı sınıf kusur mobilde M3c R3'te bulunup düzeltilmişti (tam ekran görüntüleyici açılırken
 * adresi tazeliyor); web'de kimse bakmamıştı. **Yan kazanç aynısı:** tarama kapısı büyütme/yeniden
 * yükleme anında ikinci kez doğrulanıyor.
 *
 * Tek deneme: `retried` bayrağı olmasa, kalıcı bir hatada (silinmiş nesne) sonsuz döngü olurdu.
 */
const retried = ref(false)
function onImageError() {
  if (retried.value) {
    imageError.value = 'not_ready'
    return
  }
  retried.value = true
  imageUrl.value = null
  loadImageUrl()
}

// Dosya (PDF vb.) → yeni sekme (tarayıcı görüntüleyici)
async function openUrl() {
  if (isActionDisabled.value) return
  downloading.value = true
  try {
    const res = await attachmentsApi.getUrl(props.attachment.id)
    window.open(res.data.url, '_blank', 'noopener,noreferrer')
  } finally {
    downloading.value = false
  }
}

// Görsel → lightbox. Açarken adres TAZELENİR: küçük önizleme dakikalar önce yüklenmiş olabilir ve
// o adres artık ölü olabilir — büyütünce sessizce siyah kalırdı. Mobilde M3c R3'te aynısı yapıldı.
// Dosya kartı "İndir": gerçek indirme (Content-Disposition: attachment)
async function downloadFile() {
  if (isActionDisabled.value) return
  downloading.value = true
  try {
    await downloadAttachment(props.attachment.id)
  } finally {
    downloading.value = false
  }
}

function openLightbox() {
  if (!imageUrl.value) return
  lightboxOpen.value = true
  retried.value = false
  loadImageUrl()
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <!-- GÖRSEL -->
  <div v-if="isImage" class="mt-1.5">
    <!-- PENDING -->
    <div
      v-if="isPending"
      class="flex items-center gap-2 px-3 py-2 rounded-[var(--kv-radius-sm)] text-[13px]"
      style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
    >
      <span>⏳</span>
      <span>{{ t('attachment.processing') }}</span>
    </div>

    <!-- FLAGGED / BLOCKED -->
    <div
      v-else-if="isBlocked"
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

    <!-- Görsel — tıklayınca lightbox -->
    <img
      v-else-if="imageUrl"
      :src="imageUrl"
      :alt="attachment.filename"
      class="rounded-[var(--kv-radius-sm)] cursor-pointer object-contain"
      style="max-width: min(100%, 360px); max-height: 420px;"
      loading="lazy"
      @click="openLightbox"
      @error="onImageError"
    />
  </div>

  <!-- SES: CLEAN → oynatıcı; değilse görselle aynı durum kutusu -->
  <template v-else-if="isAudio">
    <VoicePlayer v-if="attachment.scanStatus === ScanStatus.CLEAN" :attachment="attachment" />
    <div
      v-else
      class="flex items-center gap-2 mt-1.5 px-3 py-2 rounded-[var(--kv-radius-sm)] text-[13px]"
      style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
    >
      <span>{{ isPending ? '⏳' : '🚫' }}</span>
      <span>{{ isPending ? t('attachment.processing') : t('attachment.blocked') }}</span>
    </div>
  </template>

  <!-- VIDEO: CLEAN → kart; değilse görselle aynı durum kutusu -->
  <template v-else-if="isVideo">
    <VideoCard v-if="attachment.scanStatus === ScanStatus.CLEAN" :attachment="attachment" />
    <div
      v-else
      class="flex items-center gap-2 mt-1.5 px-3 py-2 rounded-[var(--kv-radius-sm)] text-[13px]"
      style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
    >
      <span>{{ isPending ? '⏳' : '🚫' }}</span>
      <span>{{ isPending ? t('attachment.processing') : t('attachment.blocked') }}</span>
    </div>
  </template>

  <!-- DOSYA KARTI -->
  <div
    v-else
    class="flex items-center gap-3 mt-1.5 px-3 py-2 rounded-[var(--kv-radius-sm)]"
    style="background-color: var(--kv-bg-elevated);"
  >
    <!-- Tipli dosya ikonu -->
    <div class="w-9 h-9 shrink-0 flex items-center justify-center" aria-hidden="true">
      <!-- PDF -->
      <svg v-if="isPdf" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-9 h-9">
        <rect width="36" height="36" rx="6" fill="var(--kv-danger)" fill-opacity="0.15" />
        <path d="M9 5h13l6 6v20H9V5z" fill="var(--kv-danger)" fill-opacity="0.65" />
        <path d="M22 5l6 6h-6V5z" fill="var(--kv-danger)" />
        <text x="18" y="25" text-anchor="middle" font-size="7" font-weight="700" fill="var(--kv-danger)" font-family="sans-serif">PDF</text>
      </svg>
      <!-- DOC/DOCX -->
      <svg v-else-if="isDoc" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-9 h-9">
        <rect width="36" height="36" rx="6" fill="var(--kv-info)" fill-opacity="0.15" />
        <path d="M9 5h13l6 6v20H9V5z" fill="var(--kv-info)" fill-opacity="0.65" />
        <path d="M22 5l6 6h-6V5z" fill="var(--kv-info)" />
        <text x="18" y="25" text-anchor="middle" font-size="7" font-weight="700" fill="var(--kv-info)" font-family="sans-serif">DOC</text>
      </svg>
      <!-- TXT -->
      <svg v-else-if="isTxt" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-9 h-9">
        <rect width="36" height="36" rx="6" fill="var(--kv-text-muted)" fill-opacity="0.2" />
        <path d="M9 5h13l6 6v20H9V5z" fill="var(--kv-text-secondary)" fill-opacity="0.65" />
        <path d="M22 5l6 6h-6V5z" fill="var(--kv-text-secondary)" />
        <text x="18" y="25" text-anchor="middle" font-size="7" font-weight="700" fill="var(--kv-text-primary)" font-family="sans-serif">TXT</text>
      </svg>
      <!-- Genel -->
      <svg v-else viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-9 h-9">
        <rect width="36" height="36" rx="6" fill="var(--kv-accent-500)" fill-opacity="0.15" />
        <path d="M9 5h13l6 6v20H9V5z" fill="var(--kv-accent-500)" fill-opacity="0.65" />
        <path d="M22 5l6 6h-6V5z" fill="var(--kv-accent-500)" />
        <path d="M13 17h10M13 21h7" stroke="white" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </div>

    <!-- Ad + boyut -->
    <div class="flex flex-col min-w-0 flex-1">
      <span class="text-[13px] font-medium truncate" style="color: var(--kv-text-primary);">
        {{ attachment.filename }}
      </span>
      <span class="text-[11px]" style="color: var(--kv-text-muted);">
        {{ formatBytes(attachment.size) }}
      </span>
    </div>

    <!-- PDF: "Aç" + "İndir" ayrı butonlar; diğerleri sadece İndir -->
    <div class="flex items-center gap-1 shrink-0">
      <!-- PDF Aç (tarayıcı görüntüleyici) -->
      <button
        v-if="isPdf && !isPending && !isBlocked"
        :disabled="isActionDisabled"
        class="text-[12px] px-2 py-1 rounded-[var(--kv-radius-sm)] transition-opacity cursor-pointer"
        style="color: var(--kv-accent-500);"
        :class="isActionDisabled ? 'opacity-40 pointer-events-none' : 'hover:opacity-80'"
        @click="openUrl"
      >
        {{ t('attachment.open') }}
      </button>

      <!-- İndir / durum -->
      <button
        :disabled="isActionDisabled"
        class="text-[12px] px-2 py-1 rounded-[var(--kv-radius-sm)] transition-opacity cursor-pointer"
        style="color: var(--kv-accent-500);"
        :class="isActionDisabled ? 'opacity-40 pointer-events-none' : 'hover:opacity-80'"
        @click="downloadFile"
      >
        <span v-if="isPending">{{ t('attachment.processing') }}</span>
        <span v-else-if="isBlocked">{{ t('attachment.blocked') }}</span>
        <span v-else>{{ t('attachment.download') }}</span>
      </button>
    </div>
  </div>

  <!-- Görsel lightbox -->
  <ImageLightbox
    v-if="lightboxOpen && imageUrl"
    :url="imageUrl"
    :attachment-id="attachment.id"
    :filename="attachment.filename"
    @close="lightboxOpen = false"
  />
</template>
