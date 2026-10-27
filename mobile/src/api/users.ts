import http from './http';
import type { DmPolicy, UserDto } from './auth';

// Sprint M1b contract §2 + §3.6 — `GET /users/:id/card` → `UserProfileCardDto`
// (api/src/modules/users/users.service.ts). Backend DTO'su çok daha zengin (bio/banner/mutual/
// roller/ses durumu — C10 sprint'i), ama M1b yalnız engelle/arkadaşlıktan-çıkar KARARI için
// gereken alt kümeyi kullanıyor. Rule of Three deseni (bkz. api/channels.ts yorumu): kullanılmayan
// alanlar tiplenmedi.
/** Sprint M3b §3.2 — ortak ortam satırı (`users.service.ts` `MutualGuildDto`). */
export interface MutualGuildDto {
  id: string;
  name: string;
  iconUrl: string | null;
}

/** Ortak kanka satırı (`MutualFriendDto`). */
export interface MutualFriendDto {
  id: string;
  username: string;
  avatarUrl: string | null;
}

/** C10 — rol rozeti; YALNIZ `guildId` bağlamıyla çağrılınca dolu, aksi hâlde `[]`. */
export interface UserCardRoleDto {
  id: string;
  name: string;
  color: string;
}

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
  /** C13 §2.5: hareketli WebP adresleri; yoksa/null ise statik `avatarUrl`/`bannerUrl` kullanilir. */
  avatarAnimatedUrl?: string | null;
  bannerAnimatedUrl?: string | null;
  /** ISO tarih — TR biçiminde ("25 Ekim 2023") gösterilir. */
  memberSince: string;
  // Sprint M3b §3.2 — profil alt-paneli bu alanları çiziyor. Yine **yeni backend alanı değil**
  // (C5/C10'dan beri dönüyor), yalnız mobilde tiplenmemişti.
  mutualFriends: MutualFriendDto[];
  mutualGuilds: MutualGuildDto[];
  /** `canDm` otoritesi — "Mesaj" düğmesinin kapısı. İstemci kendi kafasına göre hesaplamaz. */
  canMessage: boolean;
  roles: UserCardRoleDto[];
  // 🔴 `voiceStatus` BİLİNÇLİ tiplenmedi: mobilde ses M4'te geliyor, bu sprintte çizilmiyor ve
  // çizilmeyecek bir alanı tiplemek "yakında" vaadi olurdu. Panelin düzeni o satır sonradan
  // aksiyonların ALTINA girince bozulmayacak şekilde kuruldu (bkz. ProfileSheet).
}

export interface UpdateProfileDto {
  bio?: string;
  /**
   * 🔴 Serbest renk DEĞİL — sunucunun allowlist'indeki **preset anahtarı** ('blue', 'cream'…) ya da
   * `null` (marka varsayılanı). Bkz. `utils/bannerColor.ts` ve `api/src/common/banner-presets.ts`.
   */
  bannerColor?: string | null;
  /** DM gizlilik ayarı — web `usersApi.updateProfile({ dmPolicy })` ile birebir (aynı uç, PATCH /users/me). */
  dmPolicy?: DmPolicy;
  /** C12 §2 — okundu bilgisi paylaşımı. KARŞILIKLI: kapatan karşı tarafınkini de göremez. */
  readReceipts?: boolean;
}

/** `api/src/shared/media/image-upload.service.ts` `PresignResult` — birebir iki alan. */
export interface PresignResult {
  uploadUrl: string;
  storageKey: string;
}

/** Sunucunun kabul ettiği görsel türleri (`ALLOWED_IMAGE_TYPE_SET`) — istemci listesi uydurmuyor. */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** C13 §2.2: hareketli gorselin hedefi. */
export type AnimatedTarget = 'AVATAR' | 'BANNER' | 'GUILD_ICON' | 'GUILD_BANNER';

export interface AnimatedPresignResult {
  uploadUrl: string;
  stagingKey: string;
}

/** C13b §2.1: kaynagin genislik/yuksekligine oranla 0..1 kesirler. Oran duzeltmesini sunucu yapar. */
export interface MediaCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnimatedProcessPayload {
  stagingKey: string;
  /** Opsiyonel; yoksa sunucu merkezden kirpar (eski davranis). */
  crop?: MediaCrop;
  /** Yalniz video; GIF'te sunucu yok sayar. */
  startMs?: number;
  /** Yalniz video (500..6000). */
  durationMs?: number;
}

export const usersApi = {
  /**
   * `guildId` opsiyonel — verilirse sunucu **rol rozetlerini** doldurur
   * (`users.controller.ts` `@Query('guildId')`, C10). Verilmezse `roles: []` döner ve panel o
   * bölümü hiç çizmez. Yeni uç değil, mevcut ucun bugüne kadar kullanılmayan parametresi.
   */
  async getCard(userId: string, guildId?: string): Promise<UserCardDto> {
    const res = await http.get<UserCardDto>(`/users/${userId}/card`, {
      params: guildId ? { guildId } : undefined,
    });
    return res.data;
  },

  // Dönüş `toUserDto` (full user) — bio/afiş çağrıları bugüne kadar yoksaymıştı, dmPolicy ekranı
  // (dm-privacy.tsx) güncel değeri store'a yazmak için gerçek tipe ihtiyaç duyuyor.
  async updateProfile(dto: UpdateProfileDto): Promise<UserDto> {
    const res = await http.patch<UserDto>('/users/me', dto);
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

  // C13 hareketli avatar/afis: presign, PUT (depolamaya), isle (sunucu hareketli WebP uretir).
  // Hata kodlari (ANIMATED_DISABLED vb.) profile.animated.errors.* altinda Turkce karsilikli.

  async animatedPresign(target: AnimatedTarget, contentType: string, size: number): Promise<AnimatedPresignResult> {
    const res = await http.post<AnimatedPresignResult>('/users/me/animated/presign', { target, contentType, size });
    return res.data;
  },

  async setAnimatedAvatar(payload: AnimatedProcessPayload): Promise<UserDto> {
    const res = await http.post<UserDto>('/users/me/avatar/animated', payload);
    return res.data;
  },

  async setAnimatedBanner(payload: AnimatedProcessPayload): Promise<UserDto> {
    const res = await http.post<UserDto>('/users/me/banner/animated', payload);
    return res.data;
  },
};
