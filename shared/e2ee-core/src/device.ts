// Cihaz: imza anahtarı + kullanılmamış KeyPackage özel anahtarları. Saf; depolama istemcinin işi.
// deviceId sunucudan gelir (POST /e2ee/devices), bu yüzden önce anahtar üretilir, kimlik sonra atanır.
import {
  decode,
  defaultCredentialTypes,
  encode,
  generateKeyPackageWithKey,
  keyPackageDecoder,
  keyPackageEncoder,
  makeKeyPackageRef,
  privateKeyPackageDecoder,
  privateKeyPackageEncoder,
  type KeyPackage,
  type PrivateKeyPackage,
  type Welcome,
} from 'ts-mls'
import { bytesEqual, fromUtf8, pack, unpack, utf8 } from './bytes'
import { DeviceNotRegisteredError, NoMatchingKeyPackageError, SerializationError } from './errors'
import { type CryptoProvider } from './provider'
import { SerialQueue } from './queue'

const DEVICE_FORMAT = 1

export interface KeyPackageEntry {
  keyPackage: KeyPackage
  privateKeyPackage: PrivateKeyPackage
  lastResort: boolean
}

export class Device {
  /** Bu cihazın tüm MLS işleri bu kuyruktan geçmeli (sözleşme §1.7). */
  readonly queue = new SerialQueue()

  readonly provider: CryptoProvider
  /** Sunucuya kaydedilecek Ed25519 açık anahtar (32 bayt). */
  readonly signaturePublicKey: Uint8Array
  private readonly signaturePrivateKey: Uint8Array
  private id: string | null
  private entries: KeyPackageEntry[]

  private constructor(
    provider: CryptoProvider,
    signaturePublicKey: Uint8Array,
    signaturePrivateKey: Uint8Array,
    id: string | null,
    entries: KeyPackageEntry[],
  ) {
    this.provider = provider
    this.signaturePublicKey = signaturePublicKey
    this.signaturePrivateKey = signaturePrivateKey
    this.id = id
    this.entries = entries
  }

  static async create(provider: CryptoProvider): Promise<Device> {
    const { signKey, publicKey } = await (await provider.loadSuite()).signature.keygen()
    return new Device(provider, publicKey, signKey, null, [])
  }

  get deviceId(): string | null {
    return this.id
  }

  /** Sunucunun verdiği kimliği bir kez atar; sonra değişmez (credential kimliği olarak imzalanır). */
  assignDeviceId(deviceId: string): void {
    if (this.id !== null && this.id !== deviceId) throw new DeviceNotRegisteredError('deviceId zaten atanmış')
    this.id = deviceId
  }

  /** Tüketilmemiş (last-resort olmayan) KeyPackage sayısı; 10'un altına inince istemci tamamlar. */
  get availableKeyPackages(): number {
    return this.entries.filter((e) => !e.lastResort).length
  }

  /** n yeni KeyPackage üretir ve özel anahtarlarını cihazda tutar. Dönen baytlar sunucuya yüklenir. */
  exportKeyPackages(n: number): Promise<Uint8Array[]> {
    return this.makePackages(n, false)
  }

  /** Last-resort KeyPackage: sunucu tüketmez, hiç paket kalmadığında verir. Eskisinin yerine geçer. */
  async exportLastResortKeyPackage(): Promise<Uint8Array> {
    this.entries = this.entries.filter((e) => !e.lastResort)
    return (await this.makePackages(1, true))[0]
  }

  private async makePackages(n: number, lastResort: boolean): Promise<Uint8Array[]> {
    const out: Uint8Array[] = []
    for (let i = 0; i < n; i++) {
      const entry = await this.newEntry(lastResort)
      this.entries.push(entry)
      out.push(encode(keyPackageEncoder, entry.keyPackage))
    }
    return out
  }

  /** @internal Grubu kuran cihazın kendi yaprağı için tek kullanımlık paket (depoya girmez). */
  async newEntry(lastResort = false): Promise<KeyPackageEntry> {
    if (this.id === null) throw new DeviceNotRegisteredError('KeyPackage için önce deviceId atanmalı')
    const cipherSuite = await this.provider.loadSuite()
    const credential = { credentialType: defaultCredentialTypes.basic, identity: utf8(this.id) }
    const signatureKeyPair = { signKey: this.signaturePrivateKey, publicKey: this.signaturePublicKey }
    const made = await generateKeyPackageWithKey({ credential, signatureKeyPair, cipherSuite })
    return { keyPackage: made.publicPackage, privateKeyPackage: made.privatePackage, lastResort }
  }

  /** @internal Welcome'ın hedeflediği KeyPackage'ı bulur (ref karşılaştırması). */
  async findEntryForWelcome(welcome: Welcome): Promise<KeyPackageEntry> {
    const { hash } = await this.provider.loadSuite()
    for (const entry of this.entries) {
      const ref = await makeKeyPackageRef(entry.keyPackage, hash)
      if (welcome.secrets.some((s) => bytesEqual(s.newMember, ref))) return entry
    }
    throw new NoMatchingKeyPackageError('Bu Welcome için cihazda eşleşen KeyPackage yok')
  }

  /** @internal Katılım başarılı olunca paketi tüketir (last-resort kalır). */
  consume(entry: KeyPackageEntry): void {
    if (!entry.lastResort) this.entries = this.entries.filter((e) => e !== entry)
  }

  /** Gizli anahtarlar içerir: istemci şifreli yerel depoya yazar. */
  serialize(): Uint8Array {
    const entries = this.entries.map((e) =>
      pack([
        new Uint8Array([e.lastResort ? 1 : 0]),
        encode(keyPackageEncoder, e.keyPackage),
        encode(privateKeyPackageEncoder, e.privateKeyPackage),
      ]),
    )
    return pack([
      new Uint8Array([DEVICE_FORMAT]),
      utf8(this.id ?? ''),
      this.signaturePublicKey,
      this.signaturePrivateKey,
      ...entries,
    ])
  }

  static deserialize(data: Uint8Array, provider: CryptoProvider): Device {
    const parts = unpack(data)
    if (!parts || parts.length < 4 || parts[0][0] !== DEVICE_FORMAT) {
      throw new SerializationError('Cihaz verisi bozuk ya da sürümü desteklenmiyor')
    }
    const [, id, pub, priv, ...rest] = parts
    const entries = rest.map(decodeEntry)
    return new Device(provider, pub, priv, id.length ? fromUtf8(id) : null, entries)
  }
}

function decodeEntry(raw: Uint8Array): KeyPackageEntry {
  const p = unpack(raw)
  const keyPackage = p && p.length === 3 ? decode(keyPackageDecoder, p[1]) : undefined
  const privateKeyPackage = p && p.length === 3 ? decode(privateKeyPackageDecoder, p[2]) : undefined
  if (!p || !keyPackage || !privateKeyPackage) throw new SerializationError('KeyPackage kaydı bozuk')
  return { keyPackage, privateKeyPackage, lastResort: p[0][0] === 1 }
}

export const createDevice = (provider: CryptoProvider): Promise<Device> => Device.create(provider)
export const deserializeDevice = (data: Uint8Array, provider: CryptoProvider): Device =>
  Device.deserialize(data, provider)
