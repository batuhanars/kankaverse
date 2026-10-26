// C15: sohbet ekini gerçekten indir. Sunucu `download=1` adresine Content-Disposition: attachment
// koyar; gizli <a href> aynı sekmede tıklanır, sayfa terk edilmez. `download` özniteliği kullanılmaz
// (farklı alan adındaki imzalı adreste tarayıcılar yok sayar).
import { attachmentsApi } from '@/api/attachments'

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
