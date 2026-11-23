// E7 Parça B (§5, Rev.3 §5.4): yerel arama. Yalnız `ok` kayıtlar, yalnız o kanal, Türkçe büyük/küçük harf,
// bahsetmenin düz metni, sunucuda olmayan (silinmiş) kayıt düşer, sonuç sunucu sonucuyla tekilleşip birleşir.
// Gerçek çekirdek + sahte sunucu; sunucu ve beforeEach flowSuite'ten gelir.
import { describe, expect, it } from 'vitest'
import { mergeResults, normalizeQuery } from '../src/localSearch'
import { LocalStore } from '../src/localStore'
import { as, CH, login, provider, send, server, show, type Profile } from './flowSuite'

/** Testin doğrudan kayıt yazması için (motorun kullandığı aynı depo). */
const storeOf = (p: Profile) => new LocalStore(p.vault, provider)

const at = (min: number) => new Date(Date.UTC(2026, 10, 23, 10, min)).toISOString()

/** A gönderir, B görür (B'de `ok` kayıt), sunucu üst veriyi bilir. */
async function deliver(A: Profile, B: Profile, id: string, text: string, min: number) {
  const msg = await send(A, id, text, at(min))
  await show(B, [msg])
  server.messageMeta.set(id, { channelId: CH, createdAt: at(min), authorId: 'A' })
  return msg
}

async function pair() {
  const A1 = await login('A')
  const B1 = await login('B')
  const first = await send(A1, 'm0', 'selam', at(0))
  await as(B1, (e) => e.onWelcome())
  await show(B1, [first])
  server.messageMeta.set('m0', { channelId: CH, createdAt: at(0), authorId: 'A' })
  return { A1, B1 }
}

const search = (p: Profile, q: string, plain?: (b: string) => string) => as(p, (e) => e.searchLocal(CH, q, plain))

export function localSearchSuite(label: string) {
  describe(`[${label}] E7 yerel arama`, () => {
    it('Türkçe büyük/küçük harf: "istanbul" İSTANBUL\'u, "ılık" ILIK\'ı bulur; yeniden eskiye sıralı', async () => {
      const { A1, B1 } = await pair()
      await deliver(A1, B1, 'm1', 'İSTANBUL çok güzel', 1)
      await deliver(A1, B1, 'm2', 'Hava ILIK, istanbul yine', 2)
      const hits = await search(B1, 'istanbul')
      expect(hits.map((h) => h.id)).toEqual(['m2', 'm1'])
      expect(hits[0]).toMatchObject({ createdAt: at(2), author: { id: 'A' } })
      expect((await search(B1, 'ılık')).map((h) => h.id)).toEqual(['m2'])
    })

    it('gönderenin kendi mesajı da bulunur (kendi kaydı yerelde)', async () => {
      const { A1, B1 } = await pair()
      await deliver(A1, B1, 'm1', 'kendi mesajım', 1)
      expect((await search(A1, 'kendi')).map((h) => h.id)).toEqual(['m1'])
    })

    it('2 karakterden kısa sorgu ağa da depoya da gitmez', async () => {
      const { B1 } = await pair()
      const calls = server.existsCalls.length
      expect(await search(B1, ' s ')).toEqual([])
      expect(server.existsCalls.length).toBe(calls)
    })

    it('sunucuda olmayan (silinmiş/temizlenmiş) eşleşme sonuçta yok', async () => {
      const { A1, B1 } = await pair()
      await deliver(A1, B1, 'm1', 'gizli plan', 1)
      await deliver(A1, B1, 'm2', 'gizli değil', 2)
      server.goneMessages.add('m1')
      expect((await search(B1, 'gizli')).map((h) => h.id)).toEqual(['m2'])
    })

    it('yalnız ok kayıt: çözülemeyen mesaj aranmaz', async () => {
      const { A1, B1 } = await pair()
      await deliver(A1, B1, 'm1', 'görünen kelime', 1)
      // B'de çözülemeyen kayıt: aynı kanal, durum failed (gövde boş, aranmamalı).
      await storeOf(B1).saveMessage({ id: 'bozuk', channelId: CH, status: 'failed', body: 'görünen kelime', digest: 'd' })
      server.messageMeta.set('bozuk', { channelId: CH, createdAt: at(5), authorId: 'A' })
      expect((await search(B1, 'kelime')).map((h) => h.id)).toEqual(['m1'])
    })

    it('başka kanalın kaydı sonuçta yok', async () => {
      const { A1, B1 } = await pair()
      await deliver(A1, B1, 'm1', 'ortak kelime', 1)
      await storeOf(B1).saveMessage({ id: 'x1', channelId: 'baska', status: 'ok', body: 'ortak kelime', digest: 'd' })
      expect((await search(B1, 'ortak')).map((h) => h.id)).toEqual(['m1'])
    })

    it('bahsetme düz metne çevrilip aranır', async () => {
      const { A1, B1 } = await pair()
      await deliver(A1, B1, 'm1', 'selam <@u-ayse> nasılsın', 1)
      const plain = (b: string) => b.replace(/<@([\w-]+)>/g, (_s, id: string) => (id === 'u-ayse' ? '@ayşe' : '@?'))
      expect((await search(B1, 'ayşe', plain)).map((h) => h.id)).toEqual(['m1'])
      expect(await search(B1, 'u-ayse', plain)).toEqual([])
    })

    it('önbellek: ikinci aramada depo baştan okunmaz; yeni kayıt gelince önbellek bayatlar', async () => {
      const { A1, B1 } = await pair()
      await deliver(A1, B1, 'm1', 'önbellek bir', 1)
      expect((await search(B1, 'önbellek')).map((h) => h.id)).toEqual(['m1'])
      await deliver(A1, B1, 'm2', 'önbellek iki', 2)
      expect((await search(B1, 'önbellek')).map((h) => h.id)).toEqual(['m2', 'm1'])
    })

    it('Türkçe küçültme toLocaleLowerCase("tr") ile aynı sonucu verir', () => {
      for (const w of ['İSTANBUL', 'ILIK', 'Iğdır', 'ÇĞÖŞÜ', 'İıIi', 'Straße', 'ÀÉ 🔒 Мир']) {
        expect(normalizeQuery(w)).toBe(w.toLocaleLowerCase('tr'))
      }
    })

    it('birleşim: sunucu sonucu ∪ yerel, kimlikle tekilleşir, zamana göre, en çok 50', () => {
      const server = [
        { id: 's1', createdAt: at(1) },
        { id: 'dup', createdAt: at(3) },
      ]
      const local = [
        { id: 'l1', body: 'a', createdAt: at(2), author: { id: 'A', username: 'A', avatarUrl: null } },
        { id: 'dup', body: 'a', createdAt: at(3), author: { id: 'A', username: 'A', avatarUrl: null } },
      ]
      const merged = mergeResults(server, local, (h) => ({ id: h.id, createdAt: h.createdAt }))
      expect(merged.map((m) => m.id)).toEqual(['dup', 'l1', 's1'])
      const many = Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, createdAt: at(i) }))
      expect(mergeResults(many, [], (h) => h)).toHaveLength(50)
      expect(normalizeQuery('İIı')).toBe('iıı')
    })
  })
}
