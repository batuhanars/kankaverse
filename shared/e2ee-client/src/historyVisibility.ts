// E5b Parça C (PLAN R4 "Geçmiş görünürlüğü", sahip 2026-11-12): bu cihazın kanala katılımından önceki ve yerelde
// çözümü olmayan şifreli mesaj sohbette HİÇ çizilmez. Kural tek yerde; web ve mobil aynı işlevleri kullanır.
// Görünür kalanlar: `ok`, `unverified`, `unsupported` ("güncelle"), `failed` ("çözülemedi", katılım SONRASI).
// Motor katılım öncesini `undecryptable`, sonrasını `failed` yazar (hydrate.ts failureStatus).

/** Ekrandaki mesajın şifreleme durumu alanı (web/mobil `MessageDto.e2eeStatus`). */
export interface VisibilityMessage {
  encrypted?: boolean
  e2eeStatus?: string
}

/** Cihaz öncesi, yerelde çözümü olmayan şifreli mesaj: çizilmez, önizlemeye ve bildirime girmez. */
export const isBeforeDevice = (m: VisibilityMessage): boolean =>
  m.encrypted === true && m.e2eeStatus === 'undecryptable'

/** Ekranda gösterilecekler (sıra korunur). */
export const visibleMessages = <T extends VisibilityMessage>(msgs: T[]): T[] => msgs.filter((m) => !isBeforeDevice(m))

/**
 * Sayfalama sınırı: eski sayfanın HER mesajı cihaz öncesi ise daha eskisi istenmez (geri yüklenen/aktarılan
 * geçmiş `ok` olduğu için o sayfa görünür mesaj taşır, sınır ona göre ilerler). Boş sayfa sınır sayılmaz.
 */
export const reachedDeviceBoundary = (page: VisibilityMessage[]): boolean =>
  page.length > 0 && page.every(isBeforeDevice)
