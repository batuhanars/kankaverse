import { describe, it, expect, vi } from 'vitest'
import { createSessionEndHandler } from '../sessionEndHandler'

describe('oturum sonu (D108 §2.3)', () => {
  it('önce store temizlenir, SONRA login sayfasına gidilir', async () => {
    const order: string[] = []
    const h = createSessionEndHandler({
      clearAuth: () => order.push('clear'),
      goToLogin: ({ expired }) => Promise.resolve(order.push(`login:${expired}`)),
    })
    await h.end(true)
    expect(order).toEqual(['clear', 'login:true'])
  })

  it('eşzamanlı birden çok bildirim tek oturum sonu sayılır', async () => {
    const clearAuth = vi.fn()
    const goToLogin = vi.fn(() => new Promise((r) => setTimeout(r, 5)))
    const h = createSessionEndHandler({ clearAuth, goToLogin })
    await Promise.all([h.end(true), h.end(true), h.end(true)])
    expect(clearAuth).toHaveBeenCalledTimes(1)
    expect(goToLogin).toHaveBeenCalledTimes(1)
    await h.end(true) // tamamlandıktan sonra yeni oturum sonu yine işlenir
    expect(clearAuth).toHaveBeenCalledTimes(2)
  })
})
