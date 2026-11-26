// C75 §3.3: istek ekranında şifreli ilk mesajın çözülmesi (kapı + önizleme metni).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick } from 'vue'
import { useRequestPreviews } from '../useRequestPreviews'
import { useE2eeStore } from '@/stores/e2ee'
import { useDmStore } from '@/stores/dm'
import type { MessageDto, MessageRequestDto } from '@/types'

const req = (channelId: string, over: Partial<MessageRequestDto> = {}): MessageRequestDto => ({
  channelId,
  requester: null,
  preview: '',
  encrypted: true,
  createdAt: '2026-11-26T10:00:00.000Z',
  ...over,
})
const msg = (over: Partial<MessageDto>) =>
  ({ id: 'm1', content: '', ...over }) as unknown as MessageDto
const GENERIC = '🔒 Şifreli mesaj'

describe('e2ee store kapısı: bekleyen istek kanalı', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('dmStore.requests içindeki kanal için motor açılır (DM listesinde olmasa da)', async () => {
    useDmStore().requests = [req('r1')]
    const store = useE2eeStore()
    const open = vi.fn().mockResolvedValue({ encrypted: true, createdAt: null })
    store.engine = { open } as never
    await store.openChannel('r1')
    expect(open).toHaveBeenCalledWith('r1')
  })

  it('ne listede ne istekte olan kanalda motor açılmaz', async () => {
    const store = useE2eeStore()
    const open = vi.fn()
    store.engine = { open } as never
    await store.openChannel('yok')
    expect(open).not.toHaveBeenCalled()
  })
})

describe('useRequestPreviews', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('çözülen düz metni gösterir; şifresiz istekte sunucu önizlemesi aynen kalır', async () => {
    const store = useE2eeStore()
    store.engine = {} as never
    vi.spyOn(store, 'prefetchPreview').mockResolvedValue([
      msg({ content: 'selam', e2eeStatus: 'ok' }),
    ])
    const list = [req('r1'), req('r2', { encrypted: undefined, preview: 'düz metin' })]
    const scope = effectScope()
    const { textOf } = scope.run(() =>
      useRequestPreviews(
        () => list,
        () => GENERIC,
      ),
    )!
    await nextTick()
    await vi.waitFor(() => expect(textOf(list[0])).toBe('selam'))
    expect(textOf(list[1])).toBe('düz metin')
    scope.stop()
  })

  it('çözülemezse genel metin kalır (boş balon yok)', async () => {
    const store = useE2eeStore()
    store.engine = {} as never
    const spy = vi
      .spyOn(store, 'prefetchPreview')
      .mockResolvedValue([msg({ encrypted: true, e2eeStatus: 'undecryptable' })])
    const list = [req('r1')]
    const scope = effectScope()
    const { textOf } = scope.run(() =>
      useRequestPreviews(
        () => list,
        () => GENERIC,
      ),
    )!
    await vi.waitFor(() => expect(spy).toHaveBeenCalled())
    expect(textOf(list[0])).toBe(GENERIC)
    scope.stop()
  })

  it('gövde boşsa (yalnız ek) sunucunun tür etiketi gösterilir', async () => {
    const store = useE2eeStore()
    store.engine = {} as never
    vi.spyOn(store, 'prefetchPreview').mockResolvedValue([msg({ content: '', e2eeStatus: 'ok' })])
    const list = [req('r1', { preview: '📷 Görsel' })]
    const scope = effectScope()
    const { textOf } = scope.run(() =>
      useRequestPreviews(
        () => list,
        () => GENERIC,
      ),
    )!
    await vi.waitFor(() => expect(textOf(list[0])).toBe('📷 Görsel'))
    scope.stop()
  })

  it('motor yokken çözme denenmez', async () => {
    const store = useE2eeStore()
    const spy = vi.spyOn(store, 'prefetchPreview')
    const list = [req('r1')]
    const scope = effectScope()
    const { textOf } = scope.run(() =>
      useRequestPreviews(
        () => list,
        () => GENERIC,
      ),
    )!
    await nextTick()
    expect(spy).not.toHaveBeenCalled()
    expect(textOf(list[0])).toBe(GENERIC)
    scope.stop()
  })
})
