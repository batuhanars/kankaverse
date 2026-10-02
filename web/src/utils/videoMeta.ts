/**
 * M6c §4.1 — seçilen videodan tarayıcıda süre, boyut ve 320px JPEG küçük resim çıkarır.
 * Sıkıştırma YOK (web). Küçük resim `data:` öneksiz base64 (API sözleşmesi, ≤ 40000 karakter).
 */
export const VIDEO_MAX_MS = 60_000
export const VIDEO_MAX_BYTES = 25 * 1024 * 1024
const THUMB_MAX_SIDE = 320
const THUMB_MAX_CHARS = 40_000
const SEEK_SECONDS = 0.5

export interface VideoMeta {
  durationMs: number
  width: number
  height: number
  thumbnail: string | null
}

export function isVideoType(contentType: string): boolean {
  return contentType.startsWith('video/')
}

function waitFor(el: HTMLVideoElement, ok: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOk = () => {
      cleanup()
      resolve()
    }
    const onErr = () => {
      cleanup()
      reject(new Error('video'))
    }
    const cleanup = () => {
      el.removeEventListener(ok, onOk)
      el.removeEventListener('error', onErr)
    }
    el.addEventListener(ok, onOk)
    el.addEventListener('error', onErr)
  })
}

function drawThumbnail(el: HTMLVideoElement): string | null {
  const scale = Math.min(1, THUMB_MAX_SIDE / Math.max(el.videoWidth, el.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(el.videoWidth * scale))
  canvas.height = Math.max(1, Math.round(el.videoHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(el, 0, 0, canvas.width, canvas.height)
  // Kaliteyi, sınıra sığana dek düşür.
  for (const q of [0.8, 0.6, 0.4]) {
    const b64 = canvas.toDataURL('image/jpeg', q).split(',')[1] ?? ''
    if (b64 && b64.length <= THUMB_MAX_CHARS) return b64
  }
  return null
}

/** Okunamazsa (tarayıcı codec'i yok) reddeder. Küçük resim çıkmazsa `thumbnail: null`. */
export async function readVideoMeta(file: File): Promise<VideoMeta> {
  const url = URL.createObjectURL(file)
  const el = document.createElement('video')
  el.preload = 'auto'
  el.muted = true
  el.playsInline = true
  try {
    const meta = waitFor(el, 'loadedmetadata')
    el.src = url
    await meta
    const durationMs = Math.round(el.duration * 1000)
    if (!Number.isFinite(durationMs) || durationMs <= 0 || !el.videoWidth) {
      throw new Error('video')
    }
    let thumbnail: string | null = null
    try {
      const seeked = waitFor(el, 'seeked')
      el.currentTime = Math.min(SEEK_SECONDS, el.duration / 2)
      await seeked
      thumbnail = drawThumbnail(el)
    } catch {
      thumbnail = null
    }
    return { durationMs, width: el.videoWidth, height: el.videoHeight, thumbnail }
  } finally {
    el.removeAttribute('src')
    el.load()
    URL.revokeObjectURL(url)
  }
}
