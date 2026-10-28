/** Sunucunun Content-Disposition: attachment adresini `<a download>` ile cihaza indirir (fetch yok, CORS gerekmez). */
export function saveFromUrl(url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = ''
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
