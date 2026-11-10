import { describe, expect, it } from 'vitest';
import { RandomUnavailableError, createDevice, pureProvider } from '@kankaverse/e2ee-core';
import { installSecureRandom } from '../../src/e2ee/randomPolyfill';

const fill = (a: Uint8Array) => a.fill(7);

describe('installSecureRandom', () => {
  it('getRandomValues yoksa kaynakla kurar', () => {
    const target: { crypto?: Record<string, unknown> } = {};
    expect(installSecureRandom(fill, target)).toBe(true);
    const out = (target.crypto!.getRandomValues as (a: Uint8Array) => Uint8Array)(new Uint8Array(4));
    expect([...out]).toEqual([7, 7, 7, 7]);
  });

  it('livekit gibi yalnız randomUUID koyan mevcut crypto nesnesini korur', () => {
    const randomUUID = () => 'x';
    const target = { crypto: { randomUUID } as Record<string, unknown> };
    expect(installSecureRandom(fill, target)).toBe(true);
    expect(target.crypto.randomUUID).toBe(randomUUID);
    expect(typeof target.crypto.getRandomValues).toBe('function');
  });

  it('zaten varsa dokunmaz', () => {
    const existing = () => new Uint8Array(1);
    const target = { crypto: { getRandomValues: existing } as Record<string, unknown> };
    expect(installSecureRandom(fill, target)).toBe(true);
    expect(target.crypto.getRandomValues).toBe(existing);
  });
});

describe('polyfill yokluğunda E2EE başlamaz', () => {
  it('crypto.getRandomValues yokken cihaz anahtarı üretilemez (açık hata, Math.random yok)', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      await expect(createDevice(pureProvider)).rejects.toBeInstanceOf(RandomUnavailableError);
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
    }
  });
});
