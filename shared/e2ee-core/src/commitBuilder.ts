// Commit üretimi (kurma, ekleme, çıkarma için ortak yol). Üretilen yeni durum "bekleyen" kalır;
// sunucu kabul edince Group.confirmCommit uygular. Her üretimden sonra TÜM yapraklar yeniden doğrulanır.
import {
  createCommit,
  decode,
  defaultProposalTypes,
  encode,
  keyPackageDecoder,
  mlsMessageEncoder,
  type CiphersuiteImpl,
  type ClientState,
  type KeyPackage,
  type Proposal,
} from 'ts-mls'
import { GroupOperationError, wrapMlsError } from './errors'
import { checkIdentity, createAuthService, verifyAllLeaves, type DeviceRegistry } from './members'
import { registerPending, type PendingCommit, type WelcomeOut } from './pending'

export const epochOf = (state: ClientState): number => Number(state.groupContext.epoch)

export const contextFor = (cipherSuite: CiphersuiteImpl, registry: DeviceRegistry) => ({
  cipherSuite,
  authService: createAuthService(registry),
})

export interface ParsedKeyPackage {
  keyPackage: KeyPackage
  deviceId: string
}

/** KeyPackage'ı çözer ve kimliğini sunucu listesine karşı doğrular (eklemeden ÖNCE). */
export function parseKeyPackage(bytes: Uint8Array, registry: DeviceRegistry): ParsedKeyPackage {
  const keyPackage = decode(keyPackageDecoder, bytes)
  if (!keyPackage) throw new GroupOperationError('KeyPackage çözülemedi')
  const { credential, signaturePublicKey } = keyPackage.leafNode
  return { keyPackage, deviceId: checkIdentity(credential, signaturePublicKey, registry) }
}

export const addProposal = (keyPackage: KeyPackage): Proposal => ({
  proposalType: defaultProposalTypes.add,
  add: { keyPackage },
})

export const removeProposal = (leafIndex: number): Proposal => ({
  proposalType: defaultProposalTypes.remove,
  remove: { removed: leafIndex },
})

export async function buildCommit(
  suite: CiphersuiteImpl,
  state: ClientState,
  registry: DeviceRegistry,
  proposals: Proposal[],
  addedDeviceIds: string[],
): Promise<PendingCommit> {
  try {
    const result = await createCommit({
      context: contextFor(suite, registry),
      state,
      extraProposals: proposals,
      // Ağaç Welcome'ın şifreli GroupInfo'sunda gider (RFC 9420 §12.4.3.3): ts-mls rc.16 ağaç codec'i dışa açmıyor.
      ratchetTreeExtension: true,
    })
    // İkinci kemer: yeni ağaçtaki her yaprak sunucu listesindeki kimlik+anahtarla eşleşmeli.
    verifyAllLeaves(result.newState, registry)
    const welcome = result.welcome ? encode(mlsMessageEncoder, result.welcome) : undefined
    const welcomes: WelcomeOut[] = welcome ? addedDeviceIds.map((deviceId) => ({ deviceId, welcome })) : []
    const pending: PendingCommit = {
      baseEpoch: epochOf(state),
      commit: encode(mlsMessageEncoder, result.commit),
      welcomes,
    }
    return registerPending(pending, { newState: result.newState, consumed: result.consumed })
  } catch (e) {
    throw wrapMlsError(e)
  }
}
