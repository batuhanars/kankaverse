// E5b Parça C: cihaz öncesi mesaj gizleme kuralı.
import { describe, expect, it } from 'vitest'
import { isBeforeDevice, reachedDeviceBoundary, visibleMessages } from '../src/historyVisibility'

const m = (e2eeStatus?: string, encrypted = true) => ({ encrypted, e2eeStatus })

describe('geçmiş görünürlüğü (E5b Parça C)', () => {
  it('yalnız şifreli + undecryptable gizlenir; çözülemedi/güncelle/doğrulanmadı/ok/şifresiz görünür', () => {
    expect(isBeforeDevice(m('undecryptable'))).toBe(true)
    for (const s of ['ok', 'unverified', 'unsupported', 'failed', undefined]) expect(isBeforeDevice(m(s))).toBe(false)
    expect(isBeforeDevice(m('undecryptable', false))).toBe(false)
  })

  it('görünür liste sırayı korur', () => {
    const list = [m('ok'), m('undecryptable'), m('failed'), m('undecryptable'), m(undefined, false)]
    expect(visibleMessages(list)).toEqual([m('ok'), m('failed'), m(undefined, false)])
  })

  it('sayfalama sınırı: sayfanın tamamı cihaz öncesiyse dur; görünür bir mesaj varsa ya da sayfa boşsa devam', () => {
    expect(reachedDeviceBoundary([m('undecryptable'), m('undecryptable')])).toBe(true)
    expect(reachedDeviceBoundary([m('undecryptable'), m('ok')])).toBe(false) // geri yüklenen geçmiş: devam
    expect(reachedDeviceBoundary([])).toBe(false)
  })
})
