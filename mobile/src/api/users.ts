import http from './http';

// Sprint M1b contract §2 + §3.6 — `GET /users/:id/card` → `UserProfileCardDto`
// (api/src/modules/users/users.service.ts). Backend DTO'su çok daha zengin (bio/banner/mutual/
// roller/ses durumu — C10 sprint'i), ama M1b yalnız engelle/arkadaşlıktan-çıkar KARARI için
// gereken alt kümeyi kullanıyor. Rule of Three deseni (bkz. api/channels.ts yorumu): kullanılmayan
// alanlar tiplenmedi.
export interface UserCardDto {
  id: string;
  username: string;
  avatarUrl: string | null;
  friendStatus: 'none' | 'friends' | 'pending_in' | 'pending_out' | 'self';
  selfBlocked: boolean;
  // M1d-C §3.1 — profil görünümü için. Sunucu bunları M1b'den beri dönüyordu, mobil tiplememişti;
  // **yeni backend alanı değil**. Kendi id'mle çağırınca `friendStatus: 'self'` gelir ve bu alanlar
  // kendi profilimi doldurur — ayrı bir "benim profilim" ucu YOK, uydurulmadı.
  bio: string | null;
  bannerUrl: string | null;
  bannerColor: string | null;
  /** ISO tarih — TR biçiminde ("25 Ekim 2023") gösterilir. */
  memberSince: string;
}

export interface UpdateProfileDto {
  bio?: string;
}

/** `api/src/shared/media/image-upload.service.ts` `PresignResult` — birebir iki alan. */
export interface PresignResult {
  uploadUrl: string;
  storageKey: string;
}

/** Sunucunun kabul ettiği görsel türleri (`ALLOWED_IMAGE_TYPE_SET`) — istemci listesi uydurmuyor. */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const usersApi = {
  async getCard(userId: string): Promise<UserCardDto> {
    const res = await http.get<UserCardDto>(`/users/${userId}/card`);
    return res.data;
  },

  async updateProfile(dto: UpdateProfileDto): Promise<unknown> {
    const res = await http.patch('/users/me', dto);
    return res.data;
  },

  // ─── C8 görsel yükleme akışı (M1d-C §3.3 — sahip istisnası: profil görselleri mobilde de yüklenir)
  // Üç adım, sunucununki ile birebir: presign → PUT (doğrudan depolamaya) → PATCH storageKey.
  // 🔴 presign **e-postası doğrulanmış** hesap ister (`VerifiedEmailGuard`); istemci kapıyı taklit
  // etmez, 403'ün mesajını gösterir.

  async presignAvatar(contentType: string): Promise<PresignResult> {
    const res = await http.post<PresignResult>('/users/me/avatar/presign', { contentType });
    return res.data;
  },

  /** `storageKey: null` → avatarı kaldır. */
  async setAvatar(storageKey: string | null): Promise<unknown> {
    const res = await http.patch('/users/me/avatar', { storageKey });
    return res.data;
  },

  async presignBanner(contentType: string): Promise<PresignResult> {
    const res = await http.post<PresignResult>('/users/me/banner/presign', { contentType });
    return res.data;
  },

  async setBanner(storageKey: string | null): Promise<unknown> {
    const res = await http.patch('/users/me/banner', { storageKey });
    return res.data;
  },
};
