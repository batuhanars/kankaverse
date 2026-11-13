// Cihaz kimliği doğrulama (sözleşme §3.3). Credential = BasicCredential, kimlik = deviceId (UTF-8).
// ts-mls'in test kimlik doğrulama servisi üretimde YASAK; yerine buradaki servis kullanılır.
import {
  defaultCredentialTypes,
  getGroupMembers,
  type AuthenticationService,
  type ClientState,
  type Credential,
} from 'ts-mls'
import { bytesEqual, fromUtf8 } from './bytes'
import { DeviceKeyMismatchError, InvalidCredentialError, UnknownDeviceError } from './errors'

/** Sunucunun bildirdiği aktif cihaz: kimlik + kayıtlı imza açık anahtarı (Ed25519, 32 bayt). */
export interface ExpectedDevice {
  deviceId: string
  signatureKey: Uint8Array
}

export type DeviceRegistry = ReadonlyMap<string, Uint8Array>

export const toRegistry = (devices: readonly ExpectedDevice[]): DeviceRegistry =>
  new Map(devices.map((d) => [d.deviceId, d.signatureKey]))

/** Credential'dan deviceId çıkarır; BasicCredential değilse ya da UTF-8 bozuksa InvalidCredentialError. */
export function deviceIdOf(credential: Credential): string {
  // x509/özel credential kabul edilmez: kimlik modelimiz yalnız deviceId.
  if (credential.credentialType !== defaultCredentialTypes.basic || !('identity' in credential)) {
    throw new InvalidCredentialError('Yalnız BasicCredential kabul edilir')
  }
  try {
    return fromUtf8(credential.identity)
  } catch {
    throw new InvalidCredentialError('Credential kimliği geçerli UTF-8 değil')
  }
}

/** Yaprak ya da KeyPackage kimliğini sunucu listesine karşı doğrular; deviceId döner, uyuşmazlıkta tipli hata. */
export function checkIdentity(credential: Credential, signatureKey: Uint8Array, registry: DeviceRegistry): string {
  const deviceId = deviceIdOf(credential)
  const registered = registry.get(deviceId)
  if (!registered) throw new UnknownDeviceError(deviceId)
  // Anahtar sunucudaki kayıtla bayt-bayt aynı olmalı: sahte yaprak aynı kimliği başka anahtarla taşıyamaz.
  if (!bytesEqual(registered, signatureKey)) throw new DeviceKeyMismatchError(deviceId)
  return deviceId
}

/** ts-mls'e verilen servis: tipli hatayı doğrudan fırlatır (ts-mls içinde sarılmadan yukarı çıkar). */
export function createAuthService(registry: DeviceRegistry): AuthenticationService {
  return {
    async validateCredential(credential, signaturePublicKey) {
      checkIdentity(credential, signaturePublicKey, registry)
      return true
    },
    // Başarıdan sonra kimlik değişemez: cihaz başka bir deviceId'ye "dönüşemez".
    async validateSuccessorCredential(oldCredential, newCredential) {
      return deviceIdOf(oldCredential) === deviceIdOf(newCredential)
    },
  }
}

/**
 * Durumdaki HER yaprağı doğrular (commit/Welcome sonrası ikinci kemer: ts-mls'in hangi yolda hangi
 * yaprağı denetlediğine güvenmeyiz). Tanınmayan yaprak varsa fırlatır; çağıran durumu uygulamaz.
 */
export function verifyAllLeaves(state: ClientState, registry: DeviceRegistry): string[] {
  return getGroupMembers(state).map((leaf) => checkIdentity(leaf.credential, leaf.signaturePublicKey, registry))
}

/**
 * C66 (yalnız bildirim önizlemesi, bellekte): kayıt listesinde OLMAYAN YENİ yapraklar (commit'ten önce grupta
 * olmayan cihaz kimlikleri) kimlik doğrulamasından muaf. Kayıtlı bir kimlik (yeni ya da eski) anahtarı bayt bayt
 * tutmalı; kayıtsız ama zaten grupta olan kimlik reddedilir. Kalıcı yolda KULLANILMAZ.
 */
export function createPreviewAuthService(registry: DeviceRegistry, existing: ReadonlySet<string>): AuthenticationService {
  return {
    async validateCredential(credential, signaturePublicKey) {
      const deviceId = deviceIdOf(credential)
      if (registry.has(deviceId) || existing.has(deviceId)) checkIdentity(credential, signaturePublicKey, registry)
      return true
    },
    async validateSuccessorCredential(oldCredential, newCredential) {
      return deviceIdOf(oldCredential) === deviceIdOf(newCredential)
    },
  }
}

export function verifyLeavesForPreview(state: ClientState, registry: DeviceRegistry, existing: ReadonlySet<string>): void {
  for (const leaf of getGroupMembers(state)) {
    const deviceId = deviceIdOf(leaf.credential)
    if (registry.has(deviceId) || existing.has(deviceId)) checkIdentity(leaf.credential, leaf.signaturePublicKey, registry)
  }
}
