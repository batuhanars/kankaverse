import { PikaClient } from './pika.client';

type Part = { delay: number; data: string };

function streamOf(parts: Part[], signal: AbortSignal) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const p of parts) {
        await new Promise<void>((res, rej) => {
          const t = setTimeout(res, p.delay);
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            rej(new Error('aborted'));
          });
        });
        yield Buffer.from(p.data);
      }
    },
  };
}

describe('PikaClient.downloadVideo bosta kalma zaman asimi', () => {
  const client = new PikaClient({ get: () => '' } as any);
  const mockFetch = (parts: Part[]) =>
    jest.spyOn(global, 'fetch').mockImplementation(((_u: string, init: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'video/mp4' }),
        body: streamOf(parts, init.signal!),
      })) as any);
  const three: Part[] = [
    { delay: 30, data: 'a' },
    { delay: 30, data: 'b' },
    { delay: 30, data: 'c' },
  ];
  afterEach(() => jest.restoreAllMocks());

  it('yavas ama akan indirme (toplam > bosta suresi) tamamlanir', async () => {
    mockFetch(three);
    const buf = await client.downloadVideo('https://cdn/x', 1000, 50, 10_000);
    expect(buf.toString()).toBe('abc');
  });

  it('bosta suresi dolarsa keser', async () => {
    mockFetch([{ delay: 200, data: 'a' }]);
    await expect(client.downloadVideo('https://cdn/x', 1000, 50, 10_000)).rejects.toThrow(
      'aborted',
    );
  });

  it('toplam ust sinir asilirsa keser', async () => {
    mockFetch(three);
    await expect(client.downloadVideo('https://cdn/x', 1000, 50, 60)).rejects.toThrow('aborted');
  });
});

describe('PikaClient.downloadVideo C14e kaldigi yerden indirme', () => {
  const client = new PikaClient({ get: () => '' } as any);
  const body = (parts: string[], failAfter = false) => ({
    async *[Symbol.asyncIterator]() {
      for (const p of parts) yield Buffer.from(p);
      if (failAfter) throw new Error('terminated');
    },
  });
  const res = (status: number, headers: Record<string, string>, b: unknown) => ({
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'video/mp4', ...headers }),
    body: b,
  });
  const mock = (...responses: unknown[]) => {
    const spy = jest.spyOn(global, 'fetch');
    for (const r of responses) spy.mockResolvedValueOnce(r as any);
    return spy;
  };
  afterEach(() => jest.restoreAllMocks());

  it('ortada kopma: Range ile devam eder, sonuc birlesik', async () => {
    const spy = mock(
      res(200, { 'content-length': '6' }, body(['abc'], true)),
      res(206, { 'content-range': 'bytes 3-5/6' }, body(['def'])),
    );
    const buf = await client.downloadVideo('https://cdn/x', 1000);
    expect(buf.toString()).toBe('abcdef');
    expect((spy.mock.calls[1][1] as RequestInit).headers).toEqual({ Range: 'bytes=3-' });
    expect((spy.mock.calls[0][1] as RequestInit).headers).toBeUndefined();
  });

  it('devamda 200 gelirse bastan baslar (tampon sifirlanir)', async () => {
    mock(
      res(200, { 'content-length': '6' }, body(['abc'], true)),
      res(200, { 'content-length': '6' }, body(['abcdef'])),
    );
    const buf = await client.downloadVideo('https://cdn/x', 1000);
    expect(buf.toString()).toBe('abcdef');
  });

  it('5 ilerlemesiz yeniden baglanmadan sonra firlatir', async () => {
    const dead = () => res(200, {}, body([], true));
    const spy = mock(dead(), dead(), dead(), dead(), dead(), dead());
    await expect(client.downloadVideo('https://cdn/x', 1000)).rejects.toThrow('terminated');
    expect(spy).toHaveBeenCalledTimes(5);
  });

  it('boyut uyusmazligi firlatir (fazla bayt)', async () => {
    mock(res(200, { 'content-length': '3' }, body(['abcd'])));
    await expect(client.downloadVideo('https://cdn/x', 1000)).rejects.toThrow('uyuşmuyor');
  });

  it('anahtarli kismi tampon denemeler arasi surer, discardPartial atar', async () => {
    mock(res(200, { 'content-length': '6' }, body(['abc'], true)));
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('net'));
    await expect(client.downloadVideo('https://cdn/x', 1000, 50, 10_000, 'g1')).rejects.toThrow();
    jest.restoreAllMocks();
    const spy = mock(res(206, { 'content-range': 'bytes 3-5/6' }, body(['def'])));
    const buf = await client.downloadVideo('https://cdn/x', 1000, 50, 10_000, 'g1');
    expect(buf.toString()).toBe('abcdef');
    expect((spy.mock.calls[0][1] as RequestInit).headers).toEqual({ Range: 'bytes=3-' });
    client.discardPartial('g1');
  });
});
