import { describe, it, expect } from 'vitest'
import { bellBadgeCount } from '../bellBadge'

describe('bellBadgeCount', () => {
  it('istek bildirimini düşer, bekleyen isteği ekler', () => {
    expect(bellBadgeCount(3, 1, 2)).toBe(4)
  })
  it('bildirim kaydı yokken (24 sa sınırı) bekleyen istek rozette görünür', () => {
    expect(bellBadgeCount(0, 0, 1)).toBe(1)
  })
  it('fark negatife düşmez', () => {
    expect(bellBadgeCount(0, 2, 0)).toBe(0)
  })
})
