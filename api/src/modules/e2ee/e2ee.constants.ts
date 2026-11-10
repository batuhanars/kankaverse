/** E1 (DM E2EE) sabitleri. Sözleşme: contracts/SPRINT_E1_DM_E2EE_CONTRACT.md §2. */

/** Şifreli DM için push/önizleme genel metni (E3'te şifreli yükle değişecek). */
export const E2EE_PUSH_GENERIC_TEXT = '🔒 Yeni mesaj';

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

export const E2EE_GROUP_ID_BYTES = 32;
export const E2EE_SIGNATURE_KEY_BYTES = 32;

export const E2EE_PLATFORMS = ['web', 'android'] as const;

/** Soket olayları (§2.7). */
export const E2EE_EVENT_COMMIT = 'e2ee:commit';
export const E2EE_EVENT_WELCOME = 'e2ee:welcome';
export const E2EE_EVENT_DEVICES_CHANGED = 'e2ee:devices-changed';
