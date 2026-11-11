// Yedek görüntüsü için presigned adrese ham bayt aktarımı (E5a §4). `expo/fetch` (RN'in eski XHR tabanlı
// fetch'i değil): ArrayBuffer gövdeyi ve `arrayBuffer()` yanıtını yerel olarak destekler. Adres kendi imzasını
// taşır: Authorization başlığı EKLENMEZ, hata mesajına adres yazılmaz.
import { fetch } from 'expo/fetch'
import type { BlobTransport } from '@kankaverse/e2ee-client'

const OCTET = 'application/octet-stream'

/** Görünümün tam kapsadığı ArrayBuffer (alt görünümün tüm tamponunu göndermemek için kopya). */
const exactBuffer = (b: Uint8Array): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

export const blobTransport: BlobTransport = {
  async put(url, bytes) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': OCTET },
      body: exactBuffer(bytes),
    })
    if (!res.ok) throw new Error(`Yedek yüklenemedi (${res.status})`)
  },

  async get(url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Yedek indirilemedi (${res.status})`)
    return new Uint8Array(await res.arrayBuffer())
  },
}
