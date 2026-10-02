/**
 * M6b §3/§5 — sesli mesaj kaydı (MediaRecorder) + yükleme.
 *
 * Durumlar: idle → recording → (limit) → uploading → idle. Dokun-başlat modeli.
 *  - 5:00'a ulaşınca kayıt kendiliğinden durur ve GÖNDERİLMEZ (`limit`): kullanıcı gönder/iptal der.
 *  - 1 sn'den kısa kayıt sessizce atılır.
 *  - Yükleme yeni bir yol değil: presign (durationMs ile) → uploadToS3 mevcut `attachmentsApi` hattı.
 */
import { ref, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { attachmentsApi } from '@/api/attachments'
import { useToastStore } from '@/stores/toast'

export const MAX_RECORD_MS = 300_000
const MIN_RECORD_MS = 1_000

export type RecorderState = 'idle' | 'recording' | 'limit' | 'uploading'

/**
 * Tür seçimi (§5.2): Safari `audio/mp4` yazar, Chrome/Firefox yazmaz → webm/opus.
 * `mime` MediaRecorder'a, `canonical` presign'a gider (parametresiz kanonik tür).
 */
export function pickRecorderType(): {
  mime: string
  canonical: 'audio/mp4' | 'audio/webm'
} | null {
  if (typeof MediaRecorder === 'undefined') return null
  if (MediaRecorder.isTypeSupported('audio/mp4'))
    return { mime: 'audio/mp4', canonical: 'audio/mp4' }
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return { mime: 'audio/webm;codecs=opus', canonical: 'audio/webm' }
  }
  return null
}

export function useVoiceRecorder() {
  const { t } = useI18n()
  const toast = useToastStore()

  const state = ref<RecorderState>('idle')
  const elapsedMs = ref(0)

  let recorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  let chunks: Blob[] = []
  let startedAt = 0
  let tick: ReturnType<typeof setInterval> | null = null
  let canonical: 'audio/mp4' | 'audio/webm' = 'audio/webm'
  let finalBlob: Blob | null = null
  let finalDurationMs = 0
  let stopped: Promise<void> | null = null

  function releaseStream() {
    stream?.getTracks().forEach((tr) => tr.stop())
    stream = null
  }

  function clearTick() {
    if (tick) clearInterval(tick)
    tick = null
  }

  function reset() {
    clearTick()
    releaseStream()
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null
      recorder.onstop = null
      try {
        recorder.stop()
      } catch {
        /* zaten durmuş */
      }
    }
    recorder = null
    chunks = []
    finalBlob = null
    finalDurationMs = 0
    stopped = null
    elapsedMs.value = 0
    state.value = 'idle'
  }

  /** Kaydı durdurur, blob'u ve süreyi hazırlar (kayıt şeridi 'limit' beklerken de bu yoldan geçer). */
  function stopRecording(): Promise<void> {
    if (stopped) return stopped
    const rec = recorder
    if (!rec) return Promise.resolve()
    clearTick()
    finalDurationMs = Math.min(MAX_RECORD_MS, Date.now() - startedAt)
    elapsedMs.value = finalDurationMs
    stopped = new Promise<void>((resolve) => {
      const done = () => {
        finalBlob = new Blob(chunks, { type: canonical })
        releaseStream()
        resolve()
      }
      if (rec.state === 'inactive') return done()
      rec.onstop = done
      rec.stop()
    })
    return stopped
  }

  async function start(): Promise<boolean> {
    if (state.value !== 'idle') return false
    const picked = pickRecorderType()
    if (!picked || !navigator.mediaDevices?.getUserMedia) {
      toast.error(t('voiceMessage.unsupported'))
      return false
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const name = (err as DOMException).name
      toast.error(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? t('voiceMessage.permissionDenied')
          : t('voiceMessage.recordFailed'),
      )
      return false
    }
    try {
      canonical = picked.canonical
      chunks = []
      recorder = new MediaRecorder(stream, { mimeType: picked.mime })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      startedAt = Date.now()
      elapsedMs.value = 0
      recorder.start()
      state.value = 'recording'
      tick = setInterval(() => {
        elapsedMs.value = Math.min(MAX_RECORD_MS, Date.now() - startedAt)
        if (elapsedMs.value >= MAX_RECORD_MS) {
          // 5:00: dur, GÖNDERME; kullanıcı karar versin.
          void stopRecording().then(() => {
            if (state.value === 'recording') state.value = 'limit'
          })
        }
      }, 200)
      return true
    } catch {
      reset()
      toast.error(t('voiceMessage.recordFailed'))
      return false
    }
  }

  function cancel() {
    if (state.value === 'uploading') return
    reset()
  }

  /**
   * Kaydı bitirir ve yükler. Başarıda attachmentId; 1 sn altı / hata durumunda null
   * (kısa kayıt sessizce atılır, hata toast ile bildirilir).
   */
  async function finish(): Promise<string | null> {
    if (state.value !== 'recording' && state.value !== 'limit') return null
    await stopRecording()
    const blob = finalBlob
    const durationMs = finalDurationMs
    if (!blob || durationMs < MIN_RECORD_MS || blob.size === 0) {
      reset()
      return null
    }
    state.value = 'uploading'
    try {
      // File.type kanonik kalmalı: uploadToS3 Content-Type'ı buradan alıyor (parametresiz).
      const ext = canonical === 'audio/mp4' ? 'm4a' : 'webm'
      const file = new File([blob], `sesli-mesaj.${ext}`, { type: canonical })
      const { data } = await attachmentsApi.presign({
        filename: file.name,
        contentType: canonical,
        size: file.size,
        durationMs,
      })
      await attachmentsApi.uploadToS3(data.uploadUrl, file)
      reset()
      return data.attachmentId
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      const msg =
        code === 'DURATION_TOO_LONG'
          ? t('voiceMessage.errors.DURATION_TOO_LONG')
          : code
            ? t(`attachment.errors.${code}`, t('voiceMessage.uploadFailed'))
            : t('voiceMessage.uploadFailed')
      toast.error(msg)
      reset()
      return null
    }
  }

  onBeforeUnmount(reset)

  return { state, elapsedMs, start, cancel, finish }
}
