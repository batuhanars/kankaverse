// E5b §4.1: cihazdan cihaza aktarım, iki gerçek motor (aynı kullanıcının iki cihazı) + sahte sunucu.
// Sunucu ve sağlayıcı flowSuite beforeEach'inden gelir.
import { describe, expect, it } from 'vitest'
import { TransferCommitError, fromUtf8, utf8 } from '@kankaverse/e2ee-core'
import { TransferPayloadError, TransferSessionError } from '../src/errors'
import { LocalStore, type StoredMessage } from '../src/localStore'
import { CH, login, provider, server, type Profile } from './flowSuite'

const tr = (p: Profile) => p.engine.transfer!
const rec = (id: string, status: StoredMessage['status'], body: string, channelId = CH): StoredMessage => ({
  id,
  channelId,
  status,
  body,
  digest: `dg-${id}-${body}`,
  fk: `fk-${id}`,
  sentAt: 1000,
})
const putRec = (p: Profile, r: StoredMessage) => p.vault.put('messages', r.id, utf8(JSON.stringify(r)))
const getRec = async (p: Profile, id: string): Promise<StoredMessage | null> => {
  const bytes = await p.vault.get('messages', id)
  return bytes ? (JSON.parse(fromUtf8(bytes)) as StoredMessage) : null
}

/** Eski cihaz O (kayıtları var) ve yeni cihaz N; N isteği açar, O görür ve kabul eder. Kodlar döner. */
async function handshake(records: StoredMessage[]) {
  const O = await login('A')
  for (const r of records) await putRec(O, r)
  const N = await login('A')
  const { id } = await tr(N).start()
  const pending = await tr(O).pending()
  expect(pending?.id).toBe(id)
  expect(await tr(N).pending()).toBeNull() // kendi açtığı istek kendisine gösterilmez
  await tr(O).accept(id)
  const sasN = await tr(N).reveal(id)
  const sasO = await tr(O).code(id)
  return { O, N, id, sasN, sasO }
}

export function transferSuite(label: string) {
  describe(`[${label}] E5b cihazdan cihaza aktarım`, () => {
    it('uçtan uca: iki ekranda aynı kod, geçmiş yeni cihaza gelir, fk/sentAt korunur, sunucuda nesne kalmaz', async () => {
      const { O, N, id, sasN, sasO } = await handshake([
        rec('m1', 'ok', 'merhaba çğı'),
        rec('m2', 'unverified', 'ikinci'),
        rec('m3', 'undecryptable', ''), // gövdesiz: gönderilmez
      ])
      expect(sasN).toMatch(/^\d{6}$/)
      expect(sasN).toBe(sasO)
      expect(await tr(O).send(id)).toEqual({ sent: 2 })
      expect(await tr(N).receive(id, [CH])).toEqual({ received: 2 })
      expect(await getRec(N, 'm1')).toMatchObject({ status: 'ok', body: 'merhaba çğı', fk: 'fk-m1', sentAt: 1000 })
      expect(await getRec(N, 'm2')).toMatchObject({ status: 'unverified' })
      expect(await getRec(N, 'm3')).toBeNull()
      expect(server.transfer.rows.get(id)!.status).toBe('DONE')
      expect([...server.backup.objects.keys()].some((k) => k.includes('e2ee-transfer'))).toBe(false)
      expect(tr(N).hasSession(id) || tr(O).hasSession(id)).toBe(false)
    })

    it('araya giren sunucu yeni cihaza başka anahtar gösterirse iki ekranda kodlar farklı çıkar', async () => {
      const O = await login('A')
      const N = await login('A')
      const { id } = await tr(N).start()
      await tr(O).accept(id)
      // Kötü sunucu: N'ye O'nun anahtarı yerine kendi seçtiği 32 baytı gösterir.
      server.transfer.tamper.oldPubForNew = server.transfer.rows.get(id)!.commit
      const sasN = await tr(N).reveal(id)
      server.transfer.tamper = {}
      const sasO = await tr(O).code(id)
      expect(sasN).not.toBe(sasO) // kullanıcı "Farklı, iptal et" der; yük hiç gitmez
    })

    it('sunucu O\'ya taahhütle uyuşmayan anahtar verirse O reddeder (TransferCommitError), hiçbir şey gönderilmez', async () => {
      const O = await login('A')
      await putRec(O, rec('m1', 'ok', 'gizli'))
      const N = await login('A')
      const { id } = await tr(N).start()
      await tr(O).accept(id)
      await tr(N).reveal(id)
      server.transfer.tamper.newPubForOld = server.transfer.rows.get(id)!.oldPub!
      await expect(tr(O).code(id)).rejects.toBeInstanceOf(TransferCommitError)
      await expect(tr(O).send(id)).rejects.toBeInstanceOf(TransferSessionError) // kod yok → yük yok
      expect(server.transfer.rows.get(id)!.status).toBe('REVEALED')
    })

    it('kod üretilmeden gönderim yok; yanlış rolde adım yok', async () => {
      const O = await login('A')
      const N = await login('A')
      const { id } = await tr(N).start()
      await tr(O).accept(id)
      await expect(tr(O).send(id)).rejects.toBeInstanceOf(TransferSessionError)
      await expect(tr(N).code(id)).rejects.toBeInstanceOf(TransferSessionError)
      await expect(tr(O).reveal(id)).rejects.toBeInstanceOf(TransferSessionError)
    })

    it('silinmiş ya da temizlenmiş mesaj gönderilmez ve O\'nun yerelinden de silinir', async () => {
      const { O, N, id } = await handshake([rec('m1', 'ok', 'kalir'), rec('m2', 'ok', 'silindi')])
      server.goneMessages.add('m2')
      expect(await tr(O).send(id)).toEqual({ sent: 1 })
      expect(await getRec(O, 'm2')).toBeNull()
      await tr(N).receive(id, [CH])
      expect(await getRec(N, 'm1')).not.toBeNull()
      expect(await getRec(N, 'm2')).toBeNull()
    })

    it('N: erişilemeyen kanalın kaydı yazılmaz; yerel ok kayıt ezilmez; çözülemeyen yerel kayıt dolar', async () => {
      const { O, N, id } = await handshake([
        rec('m1', 'ok', 'yeni govde'),
        rec('m2', 'ok', 'baska kanal', 'ch-yok'),
        rec('m3', 'ok', 'cozuldu'),
      ])
      await putRec(N, rec('m1', 'ok', 'yerel govde'))
      await putRec(N, rec('m3', 'undecryptable', ''))
      await tr(O).send(id)
      expect(await tr(N).receive(id, [CH])).toEqual({ received: 1 })
      expect((await getRec(N, 'm1'))!.body).toBe('yerel govde')
      expect(await getRec(N, 'm2')).toBeNull()
      expect(await getRec(N, 'm3')).toMatchObject({ status: 'ok', body: 'cozuldu' })
    })

    it('kurcalanmış yük: TransferPayloadError, hiçbir şey yazılmaz, istek kapanmaz', async () => {
      const { O, N, id } = await handshake([rec('m1', 'ok', 'x')])
      await tr(O).send(id)
      const key = `blob://e2ee-transfer/A/${id}`
      const bytes = server.backup.objects.get(key)!
      bytes[bytes.length - 1] ^= 1
      await expect(tr(N).receive(id, [CH])).rejects.toBeInstanceOf(TransferPayloadError)
      expect(await getRec(N, 'm1')).toBeNull()
      expect(server.transfer.rows.get(id)!.status).toBe('UPLOADED')
    })

    it('"Ben değilim": O bekleyen isteği iptal eder; N\'nin sonraki adımı düşer, oturum silinir', async () => {
      const O = await login('A')
      const N = await login('A')
      const { id } = await tr(N).start()
      await tr(O).cancel(id)
      expect(server.transfer.rows.get(id)!.status).toBe('CANCELLED')
      await expect(tr(N).reveal(id)).rejects.toBeInstanceOf(TransferSessionError)
    })

    it('yeni istek eskisini iptal eder ve N\'deki eski oturumu siler', async () => {
      const N = await login('A')
      const first = await tr(N).start()
      const second = await tr(N).start()
      expect(server.transfer.rows.get(first.id)!.status).toBe('CANCELLED')
      expect(tr(N).hasSession(first.id)).toBe(false)
      expect(tr(N).hasSession(second.id)).toBe(true)
    })

    it('geçmiş bandı: boş depo ya da cihaz öncesi kayıt "missing"; tam geçmiş "none" ve bir daha bakılmaz; işaret kalıcı', async () => {
      const empty = await login('A')
      expect(await empty.engine.historyPrompt()).toBe('missing')
      await empty.engine.markHistoryAsked()
      expect(await empty.engine.historyPrompt()).toBe('asked')

      const partial = await login('A')
      await putRec(partial, rec('m1', 'ok', 'x'))
      await putRec(partial, rec('m2', 'undecryptable', ''))
      expect(await partial.engine.historyPrompt()).toBe('missing')

      const full = await login('A')
      await putRec(full, rec('m1', 'ok', 'x'))
      await putRec(full, rec('m3', 'failed', '')) // katılım sonrası çözülemeyen: eksik geçmiş sayılmaz
      expect(await full.engine.historyPrompt()).toBe('none')
      await putRec(full, rec('m2', 'undecryptable', ''))
      expect(await full.engine.historyPrompt()).toBe('asked') // "none" işaretledi, bir daha taranmaz
    })

    it('geçmiş bandı: güncellenen eski cihazda (yeni kayıt değil) cihaz öncesi kayıt olsa da çıkmaz', async () => {
      const old = await login('A')
      const store = new LocalStore(old.vault, provider)
      await store.patchFlags({ historyFresh: false }) // bu sürümden önce kaydolmuş cihaz
      await putRec(old, rec('m1', 'undecryptable', ''))
      expect(await old.engine.historyPrompt()).toBe('none')
      expect(await old.engine.historyPrompt()).toBe('asked')
    })

    it('bayrak kapalıyken motorda aktarım yok', async () => {
      server.transfer.enabled = false
      const p = await login('A')
      expect(p.engine.transfer).toBeNull()
    })
  })
}
