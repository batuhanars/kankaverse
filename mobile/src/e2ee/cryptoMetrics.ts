import type { CryptoProvider } from '@kankaverse/e2ee-core';

// E3 Rev.4 §11.3: soğuk bildirim çözmesinin içini ölçer. Çekirdeğin kripto mantığına DOKUNMAZ: sağlayıcının
// döndürdüğü suite'in işlevleri süre ölçen sarmalayıcılarla çevrilir, sonuç ve hata aynen geçer. Yalnız ad,
// toplam süre ve çağrı sayısı loglanır (anahtar/içerik asla). Zamanlayıcı yok (Date.now ile ölçüm).
type Suite = Awaited<ReturnType<CryptoProvider['loadSuite']>>;
type Totals = Map<string, { ms: number; n: number }>;

function record(totals: Totals, name: string, t0: number): void {
  const e = totals.get(name) ?? { ms: 0, n: 0 };
  e.ms += Date.now() - t0;
  e.n += 1;
  totals.set(name, e);
}

function wrapGroup<T extends object>(totals: Totals, group: string, obj: T): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== 'function') continue;
    const name = `${group}.${key}`;
    out[key] = (...args: unknown[]) => {
      const t0 = Date.now();
      try {
        const result = (value as (...a: unknown[]) => unknown)(...args);
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          return (result as Promise<unknown>).finally(() => record(totals, name, t0));
        }
        record(totals, name, t0);
        return result;
      } catch (e) {
        record(totals, name, t0);
        throw e;
      }
    };
  }
  return out as T;
}

export type MeteredProvider = { provider: CryptoProvider; flush: () => void };

/**
 * `flush()` toplamları `[E2EE] push-crypto <ad> <ms>` satırları olarak yazar ve sıfırlar (bildirim başına bir
 * kez, çözme bitince). 1 ms altı toplamlar atlanır (gürültü).
 */
export function meterProvider(base: CryptoProvider): MeteredProvider {
  const totals: Totals = new Map();
  const provider: CryptoProvider = {
    name: base.name,
    loadSuite: async () => {
      const s = await base.loadSuite();
      const wrapped: Suite = {
        ...s,
        kdf: wrapGroup(totals, 'kdf', s.kdf),
        hash: wrapGroup(totals, 'hash', s.hash),
        signature: wrapGroup(totals, 'signature', s.signature),
        hpke: wrapGroup(totals, 'hpke', s.hpke),
      };
      return wrapped;
    },
  };
  const flush = () => {
    for (const [name, { ms, n }] of totals) {
      if (ms >= 1) console.log(`[E2EE] push-crypto ${name} ${ms}ms n=${n}`);
    }
    totals.clear();
  };
  return { provider, flush };
}
