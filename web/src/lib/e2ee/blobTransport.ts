// Yedek görüntüsü için presigned adrese ham bayt aktarımı (E5a §4). Adres kendi imzasını taşır:
// API'nin Authorization başlığı BU isteklere eklenmez (axios kullanılmaz, çıplak fetch). Hata mesajına
// adres yazılmaz (imza içerir).
import type { BlobTransport } from '@kankaverse/e2ee-client'

const OCTET = 'application/octet-stream'

export const webBlobTransport: BlobTransport = {
  async put(url, bytes) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': OCTET },
      body: bytes as BodyInit,
    })
    if (!res.ok) throw new Error(`Yedek yüklenemedi (${res.status})`)
  },

  async get(url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Yedek indirilemedi (${res.status})`)
    return new Uint8Array(await res.arrayBuffer())
  },
}
