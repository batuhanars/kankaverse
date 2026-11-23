// Çekirdeğin tipli hataları. Uygulama kodu ts-mls hatalarını görmez, yalnız bunları yakalar.

export class E2eeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/** crypto.getRandomValues yok: Math.random'a ASLA düşülmez, E2EE başlamaz. */
export class RandomUnavailableError extends E2eeError {}

/** Grupta (ya da KeyPackage'ta) sunucu listesinde olmayan bir cihaz var. */
export class UnknownDeviceError extends E2eeError {
  readonly deviceId: string
  constructor(deviceId: string) {
    super(`Tanınmayan cihaz: ${deviceId}`)
    this.deviceId = deviceId
  }
}

/** Cihaz listede var ama imza anahtarı kayıtlı anahtarla bayt-bayt aynı değil. */
export class DeviceKeyMismatchError extends E2eeError {
  readonly deviceId: string
  constructor(deviceId: string) {
    super(`Cihaz imza anahtarı kayıtlıyla uyuşmuyor: ${deviceId}`)
    this.deviceId = deviceId
  }
}

/** Yaprağın kimlik bilgisi BasicCredential değil ya da biçimi bozuk. */
export class InvalidCredentialError extends E2eeError {}

/** Uygulama mesajını gönderen yaprak, sunucunun bildirdiği senderDeviceId ile aynı değil. */
export class SenderMismatchError extends E2eeError {
  readonly expected: string
  readonly actual: string
  constructor(expected: string, actual: string) {
    super(`Gönderen cihaz uyuşmuyor: beklenen ${expected}, gelen ${actual}`)
    this.expected = expected
    this.actual = actual
  }
}

/** Commit beklenirken başka bir MLS mesajı geldi, ya da epoch ilerlemedi. */
export class UnexpectedMessageError extends E2eeError {}

/** Bekleyen commit artık geçerli değil (grup epoch'u bu arada ilerledi). */
export class StaleCommitError extends E2eeError {}

/** Bu Welcome için cihazda eşleşen KeyPackage özel anahtarı yok. */
export class NoMatchingKeyPackageError extends E2eeError {}

/** Cihaza henüz sunucudan deviceId atanmadı (credential kimliği gerekli). */
export class DeviceNotRegisteredError extends E2eeError {}

/** İşlem grubun mevcut durumuna uymuyor (ör. üye olmayan cihazı çıkarma). */
export class GroupStateError extends E2eeError {}

/** serialize edilmiş veri bozuk ya da sürümü desteklenmiyor. */
export class SerializationError extends E2eeError {}

/** Grup işlemi (kurma, ekleme, çıkarma, commit işleme) MLS düzeyinde başarısız oldu. */
export class GroupOperationError extends E2eeError {}

/** Şifreli yük çözülemedi (MLS düzeyinde hata: yanlış epoch, tekrar, bozuk bayt). */
export class DecryptError extends E2eeError {}

/**
 * ts-mls hatalarını çekirdeğin tipine çevirir; çekirdeğin kendi tipli hataları (UnknownDeviceError vb.)
 * olduğu gibi geçer. Neden: uygulama kodu ts-mls adını/tiplerini görmemeli (sözleşme §1.3).
 */
export function wrapMlsError(e: unknown, Kind: new (m: string) => E2eeError = GroupOperationError): E2eeError {
  if (e instanceof E2eeError) return e
  const err = new Kind(e instanceof Error ? e.message : String(e))
  err.cause = e
  return err
}

/** Yedek parametresi geçersiz: tuz uzunluğu yanlış ya da Argon2id parametresi tabanın altında (E5a §2.1). */
export class BackupParamsError extends E2eeError {}

/** Yedek anahtarı açılamadı: yanlış şifre ya da kurcalanmış sarma. İkisi ayırt edilmez, mesaj içerik sızdırmaz. */
export class BackupPasswordError extends E2eeError {}

/** Yedek görüntüsü açılamadı: yanlış anahtar/bağlam ya da kurcalanmış bayt. */
export class BackupSnapshotError extends E2eeError {}

/** E5b: yeni cihazın açtığı anahtar taahhüdüyle uyuşmuyor (araya giren anahtar ya da bozuk kayıt). Aktarım iptal. */
export class TransferCommitError extends E2eeError {}

/** E5b: geçersiz açık anahtar ya da sıfır ortak sır (düşük dereceli nokta). Aktarım iptal. */
export class TransferKeyError extends E2eeError {}

/** E5b: aktarım yükü açılamadı (yanlış anahtar/bağlam ya da kurcalanmış bayt). */
export class TransferOpenError extends E2eeError {}

/** E7: kimlik anahtarı ya da sürümü biçimce geçersiz (uzunluk, sürüm < 1). */
export class IdentityKeyError extends E2eeError {}

/** E7: yedekteki kimlik açılamadı (yanlış BMK/bağlam ya da kurcalanmış bayt). */
export class IdentityOpenError extends E2eeError {}
