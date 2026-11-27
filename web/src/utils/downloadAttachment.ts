// C15: sohbet ekini gerçekten indir. Sunucu `download=1` adresine Content-Disposition: attachment
// koyar; gizli <a href> aynı sekmede tıklanır, sayfa terk edilmez. `download` özniteliği kullanılmaz
// (farklı alan adındaki imzalı adreste tarayıcılar yok sayar).
import { attachmentsApi } from '@/api/attachments'
import { ScanStatus, type AttachmentDto } from '@/types'

export async function downloadAttachment(id: string): Promise<void> {
  const res = await attachmentsApi.getDownloadUrl(id, { download: true })
  const a = document.createElement('a')
  a.href = res.data.url
  a.rel = 'noopener noreferrer'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** C82: bekleyen (taranıyor) ya da engelli ek indirilemez; menü/çubuk yalnız indirilebilenleri sayar. */
export function isDownloadable(a: Pick<AttachmentDto, 'scanStatus'>): boolean {
  return a.scanStatus !== ScanStatus.PENDING && a.scanStatus !== ScanStatus.FLAGGED
}

/**
 * Sırayla indirir. Tarayıcı ilk çoklu indirmede site başına bir kez "birden çok dosya indirilsin mi"
 * izni ister; izin verilene kadar ilkinden sonrakiler bekler (sahip turu 2026-11-27, beklenen).
 */
export async function downloadAttachments(ids: string[]): Promise<void> {
  for (const id of ids) await downloadAttachment(id)
}
