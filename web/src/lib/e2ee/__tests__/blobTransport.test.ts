// Presigned adrese ham bayt aktarımı (E5a §4): başlık, gövde, Authorization YOK, hata mesajında adres YOK.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { webBlobTransport } from '../blobTransport'

const URL_WITH_SIGNATURE = 'https://bucket.example/e2ee-backup/u/d/abc?X-Amz-Signature=GIZLI'

afterEach(() => vi.unstubAllGlobals())

describe('webBlobTransport', () => {
  it('put: PUT, octet-stream, ham bayt; Authorization başlığı yok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const bytes = new Uint8Array([1, 2, 3])
    await webBlobTransport.put(URL_WITH_SIGNATURE, bytes)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(URL_WITH_SIGNATURE)
    expect(init.method).toBe('PUT')
    expect(init.headers).toEqual({ 'Content-Type': 'application/octet-stream' })
    expect(init.body).toBe(bytes)
  })

  it('get: baytları döner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([9, 8, 7]))))
    expect(await webBlobTransport.get(URL_WITH_SIGNATURE)).toEqual(new Uint8Array([9, 8, 7]))
  })

  it('hata durumunda fırlatır ve imzalı adresi mesaja yazmaz', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(null, { status: 403 })))
    const err = await webBlobTransport.put(URL_WITH_SIGNATURE, new Uint8Array(1)).catch((e: Error) => e)
    expect((err as Error).message).toContain('403')
    expect((err as Error).message).not.toContain('GIZLI')
    await expect(webBlobTransport.get(URL_WITH_SIGNATURE)).rejects.toThrow('403')
  })
})
