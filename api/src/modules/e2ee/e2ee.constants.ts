/** E1 (DM E2EE) sabitleri. Sözleşme: contracts/SPRINT_E1_DM_E2EE_CONTRACT.md §2. */

/** Şifreli DM için push/önizleme genel metni (şifre çözülemezse istemcinin yedek metni). */
export const E2EE_PUSH_GENERIC_TEXT = '🔒 Yeni mesaj';

/** E3 §2.1 — push'a konabilecek en uzun base64 şifreli yük (karakter); FCM 4 KB sınırı için. */
export const E2EE_PUSH_MAX_CIPHERTEXT = 2800;

export const E2EE_MAX_ACTIVE_DEVICES = 10;
export const E2EE_KEY_PACKAGES_PER_CALL = 50;
export const E2EE_KEY_PACKAGES_PENDING_MAX = 100;
export const E2EE_CLAIM_MAX_DEVICES = 20;
export const E2EE_COMMITS_PAGE = 100;
export const E2EE_WELCOMES_PER_REQUEST = 20;

/** base64 metin uzunluğu sınırları (karakter). */
export const E2EE_CIPHERTEXT_MAX_B64 = 32 * 1024;
export const E2EE_KEY_PACKAGE_MAX_B64 = 16 * 1024;
export const E2EE_HANDSHAKE_MAX_B64 = 128 * 1024;

/** E4 §2.1: franking taahhüdü (HMAC-SHA256 çıktısı) ve parmak izi anahtarı bayt uzunlukları. */
export const FRANKING_TAG_BYTES = 32;
export const FRANKING_KEY_BYTES = 32;
/** 32 bayt = 44 karakter base64 (43 + tek '='); DTO'da uzunluk kuralını tek regex ile uygular. */
export const FRANKING_TAG_B64_RE = /^[A-Za-z0-9+/]{43}=$/;
/** E4 §3.3: şikâyetle iletilen kanıt üst sınırı (hedef + önceki 5). */
export const REPORT_EVIDENCE_MAX = 6;
/** E4 §3.4: kanıt, şikâyet kapandıktan bu kadar gün sonra silinir. TEK yer. */
export const REPORT_EVIDENCE_RETENTION_DAYS = 90;

export const E2EE_GROUP_ID_BYTES = 32;
export const E2EE_SIGNATURE_KEY_BYTES = 32;

export const E2EE_PLATFORMS = ['web', 'android'] as const;

/** Soket olayları (§2.7). */
export const E2EE_EVENT_COMMIT = 'e2ee:commit';
export const E2EE_EVENT_WELCOME = 'e2ee:welcome';
export const E2EE_EVENT_DEVICES_CHANGED = 'e2ee:devices-changed';

/** E5a — yedek (SPRINT_E5A §2.1/§3). Parametre tabanı: OWASP asgari Argon2id; üst sınır istemciyi kilitleyecek değeri engeller. */
export const E2EE_BACKUP_SALT_BYTES = 16;
/** nonce(12) + BMK(32) + GCM tag(16). */
export const E2EE_BACKUP_WRAPPED_KEY_BYTES = 60;
export const E2EE_BACKUP_M_MIN = 19456;
/** Üst sınır (256 MiB): istemci e2ee-core `BACKUP_KDF_MAX` ile aynı; kötü niyetli/bozuk kayıt uygulamayı çökertmesin. */
export const E2EE_BACKUP_M_MAX = 262_144;
export const E2EE_BACKUP_T_MIN = 2;
export const E2EE_BACKUP_T_MAX = 16;
export const E2EE_BACKUP_MAX_SNAPSHOTS = 5;
export const E2EE_BACKUP_MAX_BYTES = 25 * 1024 * 1024;
/** Presigned PUT/GET ömrü (sn). */
export const E2EE_BACKUP_PRESIGN_SECONDS = 300;
/** 16 bayt = 22 karakter + '=='; 60 bayt = 80 karakter (dolgusuz). */
export const E2EE_BACKUP_SALT_B64_RE = /^[A-Za-z0-9+/]{22}==$/;
export const E2EE_BACKUP_WRAPPED_B64_RE = /^[A-Za-z0-9+/]{80}$/;
/** E5a Rev.2 §4.7: varlık kontrolünde tek çağrıda en çok kimlik. */
export const E2EE_EXISTS_MAX_IDS = 500;
export const E2EE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const E2EE_BACKUP_SHA256_RE = /^[0-9a-f]{64}$/;
