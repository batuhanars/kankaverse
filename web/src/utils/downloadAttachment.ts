// C15: sohbet ekini gerçekten indir. Sunucu `download=1` adresine Content-Disposition: attachment
// koyar; gizli <a href> aynı sekmede tıklanır, sayfa terk edilmez. `download` özniteliği kullanılmaz
// (farklı alan adındaki imzalı adreste tarayıcılar yok sayar).
import { attachmentsApi } from '@/api/attachments'
import { ScanStatus, type AttachmentDto } from '@/types'
import { i18n } from '@/i18n'
import { useToastStore } from '@/stores/toast'

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

/** C83: toplu indirme girdisi; masaüstünde dosya adı klasöre kaydederken gerekir. */
export interface DownloadableRef {
  id: string
  filename: string
}

/**
 * Sırayla indirir. Tarayıcı ilk çoklu indirmede site başına bir kez "birden çok dosya indirilsin mi"
 * izni ister; izin verilene kadar ilkinden sonrakiler bekler (sahip turu 2026-11-27, beklenen).
 *
 * C83 §3: masaüstü kabuğunda (köprüde `saveFilesToFolder` varsa) ve 2+ ek varsa tek klasör seçtirilir,
 * hepsi oraya iner. Tek ek, tarayıcı ve eski 1.3.x kabuk bugünkü akışla sürer.
 */
export async function downloadAttachments(atts: DownloadableRef[]): Promise<void> {
  const save = window.kankaverse?.saveFilesToFolder
  if (!save || atts.length < 2) {
    for (const a of atts) await downloadAttachment(a.id)
    return
  }
  const { t } = i18n.global
  const files = await Promise.all(
    atts.map(async (a) => ({
      url: (await attachmentsApi.getDownloadUrl(a.id, { download: true })).data.url,
      filename: a.filename,
    })),
  )
  const result = await save(files, t('select.folderTitle'))
  if (result.canceled) return
  const toast = useToastStore()
  if (result.failed > 0)
    toast.error(t('select.savedPartial', { n: result.saved, total: files.length }))
  else if (result.saved > 0) toast.success(t('select.savedCount', { n: result.saved }))
}
