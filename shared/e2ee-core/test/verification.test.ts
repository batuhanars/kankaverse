// §3.3 reddi: sahte yaprak, anahtar uyuşmazlığı, yanlış gönderen. "Kötü niyetli istemci" = yalanlı `members`
// listesiyle çekirdeği çağıran taraf; dürüst taraf gerçek listeyle doğrular.
import { describe, expect, it } from 'vitest'
import {
  DeviceKeyMismatchError,
  SenderMismatchError,
  UnexpectedMessageError,
  UnknownDeviceError,
  createGroup,
  joinFromWelcome,
  textPayload,
  webProvider,
} from '../src'
import { groupOf, listOf, makePeer, send, setupGroup } from './helpers'

const GID = new Uint8Array(32).fill(9)
const provider = webProvider

describe('§3.3 kimlik doğrulama', () => {
  it('createGroup: sunucu listesinde olmayan cihazın KeyPackage\'ı eklenmez (UnknownDeviceError)', async () => {
    const [A1, B, Evil] = await Promise.all(['A1', 'B', 'Evil'].map((id) => makePeer(provider, id)))
    const keyPackages = [...(await B.device.exportKeyPackages(1)), ...(await Evil.device.exportKeyPackages(1))]
    await expect(
      createGroup(A1.device, { groupId: GID, members: listOf([A1, B]), keyPackages }),
    ).rejects.toBeInstanceOf(UnknownDeviceError)
  })

  it('sahte yaprak: kötü niyetli kurucu Evil\'i ekler, dürüst B Welcome\'da reddeder', async () => {
    const [A1, B, Evil] = await Promise.all(['A1', 'B', 'Evil'].map((id) => makePeer(provider, id)))
    const keyPackages = [...(await B.device.exportKeyPackages(1)), ...(await Evil.device.exportKeyPackages(1))]
    const lying = listOf([A1, B, Evil])
    const { pending } = await createGroup(A1.device, { groupId: GID, members: lying, keyPackages })
    const welcome = pending.welcomes.find((w) => w.deviceId === 'B')!.welcome
    await expect(joinFromWelcome(B.device, welcome, listOf([A1, B]))).rejects.toBeInstanceOf(UnknownDeviceError)
  })

  it('anahtar uyuşmazlığı: aynı deviceId başka imza anahtarıyla gelirse reddedilir', async () => {
    const [A1, B, A2real] = await Promise.all(['A1', 'B', 'A2'].map((id) => makePeer(provider, id)))
    const impostor = await makePeer(provider, 'A2') // kimliği A2 ama kendi imza anahtarı
    const keyPackages = [...(await B.device.exportKeyPackages(1)), ...(await impostor.device.exportKeyPackages(1))]
    const lying = listOf([A1, B, impostor])
    const { pending } = await createGroup(A1.device, { groupId: GID, members: lying, keyPackages })
    const welcome = pending.welcomes.find((w) => w.deviceId === 'B')!.welcome
    // Gerçek sunucu listesinde A2'nin kayıtlı anahtarı gerçek A2'nindir.
    await expect(joinFromWelcome(B.device, welcome, listOf([A1, B, A2real]))).rejects.toBeInstanceOf(
      DeviceKeyMismatchError,
    )
  })

  it('createGroup: listedeki anahtar KeyPackage anahtarıyla uyuşmuyorsa DeviceKeyMismatchError', async () => {
    const [A1, B, other] = await Promise.all(['A1', 'B', 'X'].map((id) => makePeer(provider, id)))
    const keyPackages = await B.device.exportKeyPackages(1)
    const wrongKey = { deviceId: 'B', signatureKey: other.device.signaturePublicKey }
    await expect(
      createGroup(A1.device, { groupId: GID, members: [...listOf([A1]), wrongKey], keyPackages }),
    ).rejects.toBeInstanceOf(DeviceKeyMismatchError)
  })

  it('processCommit: tanınmayan cihaz ekleyen commit reddedilir, durum ve mesajlaşma sağlam kalır', async () => {
    const [A1, B, Evil] = await Promise.all(['A1', 'B', 'Evil'].map((id) => makePeer(provider, id)))
    await setupGroup(A1, [B])
    const lying = listOf([A1, B, Evil])
    const pending = await groupOf(A1).addDevices(await Evil.device.exportKeyPackages(1), lying)
    await expect(groupOf(B).processCommit(pending.commit, listOf([A1, B]))).rejects.toBeInstanceOf(UnknownDeviceError)
    expect(groupOf(B).epoch).toBe(1)
    expect(await send(A1, [B], 'hala çalışıyor')).toEqual(['hala çalışıyor'])
  })

  it('yanlış senderDeviceId: SenderMismatchError, durum ilerlemez (doğrusuyla sonra çözülür)', async () => {
    const [A1, A2, B] = await Promise.all(['A1', 'A2', 'B'].map((id) => makePeer(provider, id)))
    await setupGroup(A1, [A2, B])
    const m = await groupOf(A1).encrypt(textPayload('selam', 1))
    await expect(groupOf(B).decrypt(m.ciphertext, 'A2')).rejects.toBeInstanceOf(SenderMismatchError)
    const ok = await groupOf(B).decrypt(m.ciphertext, 'A1')
    expect(ok.senderDeviceId).toBe('A1')
    expect(ok.payload).toEqual({ kind: 'text', payload: { v: 1, t: 'text', body: 'selam', sentAt: 1 } })
  })

  it('processCommit uygulama mesajını commit diye kabul etmez', async () => {
    const [A1, B] = await Promise.all(['A1', 'B'].map((id) => makePeer(provider, id)))
    await setupGroup(A1, [B])
    const m = await groupOf(A1).encrypt(textPayload('x', 1))
    await expect(groupOf(B).processCommit(m.ciphertext, listOf([A1, B]))).rejects.toBeInstanceOf(UnexpectedMessageError)
    await expect(groupOf(B).processCommit(new Uint8Array([0, 1]), listOf([A1, B]))).rejects.toBeInstanceOf(
      UnexpectedMessageError,
    )
  })
})
