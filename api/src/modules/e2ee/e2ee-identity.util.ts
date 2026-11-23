import { verifyEd25519 } from './e2ee-rebind.util';

/**
 * e2ee-core `pack` ile BAYT BAYT aynı: her parça önce 4 baytlık büyük uçlu uzunluk, sonra kendisi.
 * Uzunluk öneki ayraç belirsizliğini kaldırır ("ab"+"c" ile "a"+"bc" farklı bayt olur).
 */
function pack(parts: Uint8Array[]): Buffer {
  return Buffer.concat(
    parts.flatMap((p) => {
      const head = Buffer.alloc(4);
      head.writeUInt32BE(p.length);
      return [head, Buffer.from(p)];
    }),
  );
}

const utf8 = (s: string) => Buffer.from(s, 'utf8');

/**
 * E7 §2.2 imza mesajı; istemci (`shared/e2ee-core/src/identity.ts` `deviceSigMessage`) AYNISINI üretir:
 *   pack("kv-e7-dev-v1", userId, String(version), deviceId, signatureKey)
 */
export function deviceSigMessage(
  userId: string,
  version: number,
  deviceId: string,
  signatureKey: Uint8Array,
): Buffer {
  return pack([
    utf8('kv-e7-dev-v1'),
    utf8(userId),
    utf8(String(version)),
    utf8(deviceId),
    signatureKey,
  ]);
}

/**
 * Sunucunun savunma doğrulaması (§3.2): güvenlik DEĞİL hijyen. Asıl doğrulama istemcide, sabitlenmiş kimlikle.
 * Burada yalnız bozuk istemcinin çöp imza yazması engellenir. Bozuk girdi false döner.
 */
export function verifyDeviceSig(
  identityPublicKey: Uint8Array,
  userId: string,
  version: number,
  deviceId: string,
  signatureKey: Uint8Array,
  sig: Uint8Array,
): boolean {
  return verifyEd25519(
    identityPublicKey,
    deviceSigMessage(userId, version, deviceId, signatureKey),
    sig,
  );
}

/** Yanıtlardaki kimlik görünümü (§3.2). `null` = kimlik yok ya da bayrak kapalı (istemci bugünkü davranışa döner). */
export function identityView(
  row: { publicKey: Uint8Array; version: number } | null | undefined,
): { publicKey: string; version: number } | null {
  return row
    ? { publicKey: Buffer.from(row.publicKey).toString('base64'), version: row.version }
    : null;
}

/** Cihaz satırına eklenen imza alanları. `show` = bayrak açık; kapalıyken imza alanları hep null döner. */
export function identitySigView(
  d: { identitySig: Uint8Array | null; identityVersion: number | null },
  show: boolean,
): { identitySig: string | null; identityVersion: number | null } {
  if (!show || !d.identitySig) return { identitySig: null, identityVersion: null };
  return {
    identitySig: Buffer.from(d.identitySig).toString('base64'),
    identityVersion: d.identityVersion,
  };
}
