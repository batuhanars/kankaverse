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
