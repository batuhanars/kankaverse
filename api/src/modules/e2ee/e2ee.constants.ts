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
