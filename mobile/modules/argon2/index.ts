import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

// Native Argon2id köprüsü (Android). E5a §2.4: saf JS mobilde ~20 sn sürdüğü için yedek anahtarı türetimi
// buradan geçer. Modül yoksa (iOS/web, eski kurulum, yeniden derlenmemiş) SESSİZ yedeğe DÜŞÜLMEZ: saf JS ile
// 20 sn donmak yerine açık hata verilir ve yedek başlamaz.

interface NativeArgon2Module {
  argon2id(password: Uint8Array, salt: Uint8Array, m: number, t: number, p: number, dkLen: number): Promise<Uint8Array>;
}

const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeArgon2Module>('Argon2') : null;

/** `Argon2idFn` (e2ee-core) ile aynı imza; `deriveBackupKek`e enjekte edilir. */
export async function nativeArgon2id(
  password: Uint8Array,
  salt: Uint8Array,
  opts: { m: number; t: number; p: number; dkLen: number },
): Promise<Uint8Array> {
  if (!native) throw new Error('Native Argon2 modülü yok: uygulama yeniden derlenmeli');
  const out = await native.argon2id(password, salt, opts.m, opts.t, opts.p, opts.dkLen);
  // Köprünün döndürdüğü tipten bağımsız: Uint8Array'e normalle.
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayLike<number>);
}
