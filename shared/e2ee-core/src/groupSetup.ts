// Grubun doğuşu: kurma (createGroup) ve Welcome ile katılma (joinFromWelcome).
import {
  createGroup as mlsCreateGroup,
  decode,
  joinGroup,
  mlsMessageDecoder,
  wireformats,
  zeroOutUint8Array,
} from 'ts-mls'
import type { Device } from './device'
import { DeviceNotRegisteredError, GroupOperationError, wrapMlsError } from './errors'
import { Group } from './group'
import { addProposal, buildCommit, contextFor, parseKeyPackage } from './commitBuilder'
import { toRegistry, verifyAllLeaves, type ExpectedDevice } from './members'
import type { PendingCommit } from './pending'

export interface CreateGroupParams {
  /** MLS group_id: istemci üretir (32 bayt rastgele), sunucuya kaydedilir. */
  groupId: Uint8Array
  /** Sunucunun bildirdiği aktif cihazlar (kendisi dahil): her yaprak buna göre doğrulanır. */
  members: readonly ExpectedDevice[]
  /** Eklenecek diğer tüm cihazların KeyPackage'ları (sunucudan "claim" ile alınır). */
  keyPackages: Uint8Array[]
}

/**
 * Grubu kurar: 1 üyeli grup (epoch 0) + tüm cihazları ekleyen commit.
 * Dönen `group` epoch 0'dadır; sunucu kabul ederse `group.confirmCommit(pending)` ile epoch 1'e geçer.
 * Sunucu 409 (E2EE_GROUP_EXISTS) derse grup çöpe atılır, kazananın Welcome'ı beklenir.
 */
export async function createGroup(
  device: Device,
  params: CreateGroupParams,
): Promise<{ group: Group; pending: PendingCommit }> {
  if (device.deviceId === null) throw new DeviceNotRegisteredError('Grup kurmak için önce deviceId atanmalı')
  const registry = toRegistry(params.members)
  const parsed = params.keyPackages.map((bytes) => parseKeyPackage(bytes, registry))
  const suite = await device.provider.loadSuite()
  try {
    const own = await device.newEntry()
    const state = await mlsCreateGroup({
      context: contextFor(suite, registry),
      groupId: params.groupId,
      keyPackage: own.keyPackage,
      privateKeyPackage: own.privateKeyPackage,
    })
    verifyAllLeaves(state, registry)
    const added = parsed.map((p) => p.deviceId)
    const pending = await buildCommit(suite, state, registry, parsed.map((p) => addProposal(p.keyPackage)), added)
    return { group: new Group(device.provider, state), pending }
  } catch (e) {
    throw wrapMlsError(e)
  }
}

/**
 * Welcome ile gruba katılır. Welcome'daki ağacın HER yaprağı sunucu listesine karşı doğrulanır;
 * tanınmayan bir cihaz varsa katılım reddedilir (UnknownDeviceError/DeviceKeyMismatchError).
 * Başarıda kullanılan KeyPackage cihazdan silinir: istemci cihaz durumunu yeniden serialize etmeli.
 */
export async function joinFromWelcome(
  device: Device,
  welcomeBytes: Uint8Array,
  members: readonly ExpectedDevice[],
): Promise<Group> {
  const registry = toRegistry(members)
  const suite = await device.provider.loadSuite()
  try {
    const message = decode(mlsMessageDecoder, welcomeBytes)
    if (!message || message.wireformat !== wireformats.mls_welcome) {
      throw new GroupOperationError('Welcome çözülemedi')
    }
    const entry = await device.findEntryForWelcome(message.welcome)
    const state = await joinGroup({
      context: contextFor(suite, registry),
      welcome: message.welcome,
      keyPackage: entry.keyPackage,
      privateKeys: entry.privateKeyPackage,
    })
    verifyAllLeaves(state, registry)
    device.consume(entry)
    if (!entry.lastResort) zeroOutUint8Array(entry.privateKeyPackage.initPrivateKey)
    return new Group(device.provider, state)
  } catch (e) {
    throw wrapMlsError(e)
  }
}
