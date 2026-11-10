// MLS grubu (1 kanal = 1 grup). Tüm yerel durum burada; ağ/depolama yok.
// Hata durumunda durum DEĞİŞMEZ: yeni durum yalnız işlem tümüyle başarılı olunca atanır.
import {
  clientStateDecoder,
  clientStateEncoder,
  createApplicationMessage,
  decode,
  encode,
  getGroupMembers,
  getLeafNodeAt,
  getOwnLeafNode,
  mlsMessageDecoder,
  mlsMessageEncoder,
  nodeTypes,
  processMessage,
  wireformats,
  zeroOutUint8Array,
  type ClientState,
} from 'ts-mls'
import { pack, unpack } from './bytes'
import {
  buildCommit,
  addProposal,
  contextFor,
  epochOf,
  parseKeyPackage,
  removeProposal,
} from './commitBuilder'
import {
  DecryptError,
  GroupStateError,
  SenderMismatchError,
  SerializationError,
  UnexpectedMessageError,
  wrapMlsError,
} from './errors'
import { deviceIdOf, toRegistry, verifyAllLeaves, type ExpectedDevice } from './members'
import { takePending, type PendingCommit } from './pending'
import { decodePayload, encodePayload, type DecodedPayload, type TextPayload } from './payload'
import type { CryptoProvider } from './provider'

const GROUP_FORMAT = 1

export interface EncryptResult {
  ciphertext: Uint8Array
  /** Mesajın şifrelendiği epoch (mesaj gövdesindeki `epoch` alanı). */
  epoch: number
}

export interface DecryptResult {
  payload: DecodedPayload
  senderDeviceId: string
}

export interface ProcessCommitResult {
  epoch: number
  /** Bu cihaz gruptan çıkarıldı: artık mesaj gönderemez/çözemez. */
  removed: boolean
}

export class Group {
  /** @internal Kurma/katılma yolları kullanır; uygulama kodu `createGroup`/`joinFromWelcome` çağırır. */
  readonly provider: CryptoProvider
  private state: ClientState

  constructor(provider: CryptoProvider, state: ClientState) {
    this.provider = provider
    this.state = state
  }

  get epoch(): number {
    return epochOf(this.state)
  }

  get groupId(): Uint8Array {
    return this.state.groupContext.groupId
  }

  get isActive(): boolean {
    return this.state.groupActiveState.kind === 'active'
  }

  get ownDeviceId(): string {
    return deviceIdOf(getOwnLeafNode(this.state).credential)
  }

  /** Gruptaki yaprakların deviceId'leri (kendisi dahil). */
  memberDeviceIds(): string[] {
    return getGroupMembers(this.state).map((leaf) => deviceIdOf(leaf.credential))
  }

  /** Eksik cihazları ekleyen commit üretir; sunucu kabul edince `confirmCommit` çağrılır. */
  async addDevices(keyPackages: Uint8Array[], expected: readonly ExpectedDevice[]): Promise<PendingCommit> {
    this.assertActive()
    const registry = toRegistry(expected)
    const members = new Set(this.memberDeviceIds())
    const parsed = keyPackages.map((bytes) => parseKeyPackage(bytes, registry))
    for (const { deviceId } of parsed) {
      if (members.has(deviceId)) throw new GroupStateError(`Cihaz zaten grupta: ${deviceId}`)
    }
    const suite = await this.provider.loadSuite()
    return buildCommit(suite, this.state, registry, parsed.map((p) => addProposal(p.keyPackage)), parsed.map((p) => p.deviceId))
  }

  /** İptal edilen cihazları çıkaran commit üretir. Kendini çıkaramaz. */
  async removeDevices(deviceIds: string[], expected: readonly ExpectedDevice[]): Promise<PendingCommit> {
    this.assertActive()
    const own = this.ownDeviceId
    const indexes = deviceIds.map((id) => {
      if (id === own) throw new GroupStateError('Cihaz kendini gruptan çıkaramaz')
      const index = this.leafIndexOf(id)
      if (index === undefined) throw new GroupStateError(`Cihaz grupta değil: ${id}`)
      return index
    })
    const suite = await this.provider.loadSuite()
    return buildCommit(suite, this.state, toRegistry(expected), indexes.map(removeProposal), [])
  }

  /** Sunucu commit'i kabul etti: bekleyen durumu uygular, eski anahtar malzemesini siler. */
  confirmCommit(pending: PendingCommit): void {
    const { newState, consumed } = takePending(pending)
    if (epochOf(newState) !== this.epoch + 1) throw new GroupStateError('Bekleyen commit bu epoch için değil')
    this.state = newState
    consumed.forEach(zeroOutUint8Array)
  }

  /** Başkasının commit'ini uygular. Sonuç yeni ağaçtaki her yaprak sunucu listesine karşı doğrulanır. */
  async processCommit(commit: Uint8Array, expected: readonly ExpectedDevice[]): Promise<ProcessCommitResult> {
    const registry = toRegistry(expected)
    const suite = await this.provider.loadSuite()
    try {
      const message = decode(mlsMessageDecoder, commit)
      if (!message || (message.wireformat !== wireformats.mls_private_message && message.wireformat !== wireformats.mls_public_message)) {
        throw new UnexpectedMessageError('Commit çözülemedi ya da çerçeveli mesaj değil')
      }
      const result = await processMessage({ context: contextFor(suite, registry), state: this.state, message })
      // Çıkarılan üyenin durumu epoch ilerletmeden "removedFromGroup" olur; diğerleri tam bir epoch ilerler.
      const removed = result.kind === 'newState' && result.newState.groupActiveState.kind === 'removedFromGroup'
      if (result.kind !== 'newState' || (!removed && epochOf(result.newState) !== this.epoch + 1)) {
        throw new UnexpectedMessageError('Mesaj bir commit değil (epoch ilerlemedi)')
      }
      // Çıkarıldıysak ağaçtan kimlik beklemeyiz; aksi halde her yaprak doğrulanır.
      if (!removed) verifyAllLeaves(result.newState, registry)
      this.state = result.newState
      result.consumed.forEach(zeroOutUint8Array)
      return { epoch: this.epoch, removed }
    } catch (e) {
      throw wrapMlsError(e)
    }
  }

  async encrypt(payload: TextPayload): Promise<EncryptResult> {
    this.assertActive()
    const suite = await this.provider.loadSuite()
    try {
      const result = await createApplicationMessage({
        context: contextFor(suite, new Map()),
        state: this.state,
        message: encodePayload(payload),
      })
      const epoch = this.epoch
      this.state = result.newState
      result.consumed.forEach(zeroOutUint8Array)
      return { ciphertext: encode(mlsMessageEncoder, result.message), epoch }
    } catch (e) {
      throw wrapMlsError(e)
    }
  }

  /**
   * Gelen şifreli mesajı çözer. `expectedSenderDeviceId` (sunucunun bildirdiği) ZORUNLU: yaprağın
   * kimliği onunla aynı değilse çözülen metin atılır, durum ilerlemez (sözleşme §3.3 üçüncü kural).
   */
  async decrypt(ciphertext: Uint8Array, expectedSenderDeviceId: string): Promise<DecryptResult> {
    const suite = await this.provider.loadSuite()
    try {
      const message = decode(mlsMessageDecoder, ciphertext)
      if (!message || message.wireformat !== wireformats.mls_private_message) throw new DecryptError('Şifreli uygulama mesajı değil')
      // authService boş kayıt: uygulama mesajında yeni kimlik doğrulanmaz, gönderen aşağıda denetlenir.
      // Callback commit/proposal'ı hiç uygulatmaz: bu yol yalnız uygulama mesajı içindir.
      const result = await processMessage({
        context: contextFor(suite, new Map()),
        state: this.state,
        message,
        callback: () => 'reject',
      })
      // Bir commit/proposal bu yoldan sızıp durumu ilerletemez: yalnız uygulama mesajı kabul.
      if (result.kind !== 'applicationMessage') throw new DecryptError('Uygulama mesajı değil')
      const senderDeviceId = deviceIdOf(getLeafNodeAt(result.newState, result.senderLeafIndex).credential)
      if (senderDeviceId !== expectedSenderDeviceId) throw new SenderMismatchError(expectedSenderDeviceId, senderDeviceId)
      this.state = result.newState
      result.consumed.forEach(zeroOutUint8Array)
      return { payload: decodePayload(result.message), senderDeviceId }
    } catch (e) {
      throw wrapMlsError(e, DecryptError)
    }
  }

  /** Gizli anahtar içerir: istemci şifreli yerel depoya yazar. */
  serialize(): Uint8Array {
    return pack([new Uint8Array([GROUP_FORMAT]), encode(clientStateEncoder, this.state)])
  }

  static deserialize(data: Uint8Array, provider: CryptoProvider): Group {
    const parts = unpack(data)
    const state = parts?.length === 2 && parts[0][0] === GROUP_FORMAT ? decode(clientStateDecoder, parts[1]) : undefined
    if (!state) throw new SerializationError('Grup verisi bozuk ya da sürümü desteklenmiyor')
    return new Group(provider, state)
  }

  private assertActive(): void {
    if (!this.isActive) throw new GroupStateError('Bu cihaz artık grubun üyesi değil')
  }

  private leafIndexOf(deviceId: string): number | undefined {
    const tree = this.state.ratchetTree
    for (let i = 0; i < tree.length; i += 2) {
      const node = tree[i]
      if (node?.nodeType === nodeTypes.leaf && deviceIdOf(node.leaf.credential) === deviceId) return i / 2
    }
    return undefined
  }
}

export const deserializeGroup = (data: Uint8Array, provider: CryptoProvider): Group => Group.deserialize(data, provider)
