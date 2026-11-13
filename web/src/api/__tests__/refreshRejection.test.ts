import { describe, it, expect, vi } from 'vitest'
import {
  classifyRefreshFailure,
  isDefinitiveRefreshRejection,
  refreshWithAmbiguityRetry,
} from '../refreshRejection'

const http = (status: number, error?: string) => ({ response: { status, data: { error } } })

describe('refresh hatası sınıflandırması (D108 §2.1)', () => {
  it.each([
    [http(401, 'REFRESH_REUSE_DETECTED'), 'definitive'],
    [http(401, 'REFRESH_CHANNEL_MISMATCH'), 'definitive'],
    [http(403, 'FORBIDDEN'), 'definitive'],
    [http(401, 'INVALID_REFRESH'), 'ambiguous'],
    [http(401), 'ambiguous'],
    [http(500, 'INTERNAL'), 'transient'],
    [http(502), 'transient'],
    [{ code: 'ERR_NETWORK' }, 'transient'],
    [new Error('timeout'), 'transient'],
    [null, 'transient'],
  ])('%j -> %s', (err, expected) => {
    expect(classifyRefreshFailure(err)).toBe(expected)
    expect(isDefinitiveRefreshRejection(err)).toBe(expected === 'definitive')
  })
})

describe('refreshWithAmbiguityRetry', () => {
  it('bilinmeyen 401 sonrası bir kez yeniden dener; başarırsa oturum yaşar', async () => {
    const attempt = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(http(401, 'INVALID_REFRESH'))
      .mockResolvedValueOnce('tok')
    await expect(refreshWithAmbiguityRetry(attempt, 1)).resolves.toBe('tok')
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('yeniden denemede yine 401 -> kesin red', async () => {
    const attempt = vi.fn().mockRejectedValue(http(401, 'INVALID_REFRESH'))
    const err: unknown = await refreshWithAmbiguityRetry(attempt, 1).catch((e: unknown) => e)
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(isDefinitiveRefreshRejection(err)).toBe(true)
  })

  it('kesin kodda yeniden denemez', async () => {
    const attempt = vi.fn().mockRejectedValue(http(401, 'REFRESH_REUSE_DETECTED'))
    await refreshWithAmbiguityRetry(attempt, 1).catch(() => {})
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('ağ/5xx kesin değil, yeniden denenmez (D97)', async () => {
    const attempt = vi.fn().mockRejectedValue(http(503))
    const err: unknown = await refreshWithAmbiguityRetry(attempt, 1).catch((e: unknown) => e)
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(isDefinitiveRefreshRejection(err)).toBe(false)
  })
})
