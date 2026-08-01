import http from './http';
// Presign sonucu kullanıcı görselleriyle AYNI şekil (`{ uploadUrl, storageKey }`) — ikinci bir tip
// tanımlanmadı, sunucuda da tek `PresignResult` var.
import type { PresignResult } from './users';

// Sprint M0 contract §8, ekran 3 — yalnız "ikon + ad" gösteriliyor; DTO'nun tamamı (web
// GuildDto — web/src/types/index.ts) M0'da tüketilmiyor, bu yüzden yalnız kullanılan alt küme
// tiplendi (Rule of Three: kullanılmayan alanı tiplemek erken soyutlama).
//
// Sprint M1d — `ownerId` eklendi: "Davet Et" girişinin görünürlüğü için gerekiyor (sunucu bu alanı
// M0'dan beri dönüyordu, yalnız tiplenmemişti — yeni backend alanı DEĞİL).
export interface GuildSummaryDto {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
  // M1d-B §10.3 — afiş mobilde GÖSTERİLİR (yüklenmez). Sunucu `toGuildDto`'da zaten dönüyordu.
  bannerUrl: string | null;
  // M1e-B — Genel ayarlar ekranı için. Hepsi `toGuildDto`'da ZATEN dönüyordu, tiplenmemişti.
  adultsOnly: boolean;
  description: string | null;
  /** Keşfet listesinde görünsün mü (C6). */
  discoverable: boolean;
  tags: string[];
}

// Sprint M1d §0 — sunucu `GET /invites/:code` için YALNIZ bu üç alanı dönüyor
// (api/src/modules/invites/dto/invite.dto.ts `InvitePreviewDto`). İkon, üye sayısı, açıklama YOK;
// önizleme ekranı bunlara göre tasarlandı, olmayan alan beklenmiyor.
export interface InvitePreviewDto {
  guildName: string;
  adultsOnly: boolean;
  valid: boolean;
}

export interface InviteDto {
  code: string;
  guildId: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
}

export type GuildRole = 'OWNER' | 'ADMIN' | 'MEMBER';

/**
 * Rol özeti — üye satırındaki rozet için. Sunucu `GuildMemberDto` içinde **hazır** dönüyor
 * (`RoleSummaryDto`), yani rozet çizmek için ayrıca `GET /guilds/:id/roles` çağrılmaz.
 */
export interface RoleSummaryDto {
  id: string;
  name: string;
  /** Hex (`#RRGGBB`) — rozetin rengi. */
  color: string;
  position: number;
  hoist: boolean;
}

/** M1e §0 — sunucudan birebir. `nickname` alanı YOK (özellik uygulanmamış, mobil de göstermez). */
export interface GuildMemberDto {
  userId: string;
  username: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  role: GuildRole;
  roles: RoleSummaryDto[];
}

export interface GuildBanDto {
  userId: string;
  username: string;
  avatarUrl: string | null;
  reason: string | null;
  bannedAt: string;
}

export const guildsApi = {
  async list(): Promise<GuildSummaryDto[]> {
    const res = await http.get<GuildSummaryDto[]>('/guilds');
    return res.data;
  },

  async create(name: string): Promise<GuildSummaryDto> {
    const res = await http.post<GuildSummaryDto>('/guilds', { name });
    return res.data;
  },

  async previewInvite(code: string): Promise<InvitePreviewDto> {
    const res = await http.get<InvitePreviewDto>(`/invites/${code}`);
    return res.data;
  },

  async joinByInvite(code: string): Promise<GuildSummaryDto> {
    const res = await http.post<GuildSummaryDto>(`/invites/${code}/join`);
    return res.data;
  },

  /**
   * Aktif davetler. Sunucu süresi dolmuş ve kullanım hakkı bitmiş davetleri ZATEN eliyor
   * (`invites.service.listInvites`) — istemci aynı süzgeci tekrar yazmaz, iki yerde ayrışır.
   *
   * ⚠️ Bu uç `MANAGE_GUILD` ister, `createInvite` ise `CREATE_INVITE`. Yani davet üretebilen ama
   * listeleyemeyen bir kullanıcı mümkün → çağıran 403'ü ölümcül saymaz (bkz. guild-invite.tsx).
   */
  async listInvites(guildId: string): Promise<InviteDto[]> {
    const res = await http.get<InviteDto[]>(`/guilds/${guildId}/invites`);
    return res.data;
  },

  async createInvite(guildId: string): Promise<InviteDto> {
    // Sözleşme §2.4 — `maxUses`/`expiresInHours` BİLİNÇLİ sorulmuyor (varsayılan sınırsız/süresiz).
    // İki opsiyonel alan için form açmak, davetin önündeki sürtünmeyi ürünün kendisinden büyütür;
    // sınırlı davet gerekiyorsa web'de var. Gövde boş gider, sunucu varsayılanları uygular.
    const res = await http.post<InviteDto>(`/guilds/${guildId}/invites`, {});
    return res.data;
  },

  /**
   * Kendi rolümü çözmek için (web `stores/channels.ts` ile aynı yol: üye listesini çek, kendini bul).
   * Sunucuda "benim rolüm" diye ayrı bir uç YOK; web de bunu böyle yapıyor, mobil uç uydurmuyor.
   * Yetki kararı yine sunucunun — bu yalnız düğmeyi gösterip göstermeme (UX) kararı.
   */
  async getMembers(guildId: string): Promise<GuildMemberDto[]> {
    const res = await http.get<GuildMemberDto[]>(`/guilds/${guildId}/members`);
    return res.data;
  },

  // ─── M1e-A — ortam yönetimi ────────────────────────────────────────────────
  // 🔴 Yetki hiyerarşisi SUNUCUDA (OWNER > ADMIN > MEMBER + izin bayrakları). İstemci yalnız kendi
  // yetkisine göre satır gizler; kararı hesaplamaz, gevşetmez. Ret gelirse sunucunun mesajı gösterilir.

  /** Yalnız OWNER; `ADMIN | MEMBER` (OWNER rolü bu uçla atanamaz — devir ayrı uçta). */
  async setMemberRole(guildId: string, userId: string, role: 'ADMIN' | 'MEMBER'): Promise<GuildMemberDto> {
    const res = await http.patch<GuildMemberDto>(`/guilds/${guildId}/members/${userId}/role`, { role });
    return res.data;
  },

  /** At (kick) — atılan kullanıcı davetle geri gelebilir. */
  async kickMember(guildId: string, userId: string): Promise<null> {
    const res = await http.delete<null>(`/guilds/${guildId}/members/${userId}`);
    return res.data;
  },

  /** Kalıcı yasak: kick + davetle bile giremez. `reason` opsiyonel. */
  async banMember(guildId: string, userId: string, reason?: string): Promise<null> {
    const res = await http.post<null>(`/guilds/${guildId}/members/${userId}/ban`, reason ? { reason } : {});
    return res.data;
  },

  async listBans(guildId: string): Promise<GuildBanDto[]> {
    const res = await http.get<GuildBanDto[]>(`/guilds/${guildId}/bans`);
    return res.data;
  },

  async unbanMember(guildId: string, userId: string): Promise<null> {
    const res = await http.delete<null>(`/guilds/${guildId}/bans/${userId}`);
    return res.data;
  },

  /** 🔴 Geri alınamaz: hedef OWNER olur, eski sahip ADMIN'e düşer. Çift onay ister (sözleşme §2.4). */
  async transferOwnership(guildId: string, userId: string): Promise<null> {
    const res = await http.post<null>(`/guilds/${guildId}/members/${userId}/transfer`);
    return res.data;
  },

  /** OWNER ayrılamaz — sunucu reddeder, mesajı gösterilir (sessiz gizleme yok). */
  async leave(guildId: string): Promise<null> {
    const res = await http.post<null>(`/guilds/${guildId}/leave`);
    return res.data;
  },

  /**
   * Ortam ayarları — **yalnız OWNER** (`guilds.controller`: "yalnız OWNER").
   *
   * Sözleşme §3.1'de yalnız `name` + `adultsOnly` yazıyordu; `UpdateGuildDto` kaynaktan okununca
   * `description` · `discoverable` · `tags` · `bannerColor` da çıktı. **Parite kuralı gereği
   * (web'de olan mobile gelir) hepsi alındı** — `bannerColor` hariç: afiş rengi preset seçicisi
   * ayrı bir açık karar (bkz. TASK.md hex tartışması).
   */
  async update(
    guildId: string,
    body: { name?: string; description?: string; adultsOnly?: boolean; discoverable?: boolean; tags?: string[] },
  ): Promise<GuildSummaryDto> {
    const res = await http.patch<GuildSummaryDto>(`/guilds/${guildId}`, body);
    return res.data;
  },

  /** 🔴 Ortamı sil — soft-delete, **yalnız OWNER**. Geri alınamaz; çağıran onay ister. */
  async remove(guildId: string): Promise<null> {
    const res = await http.delete<null>(`/guilds/${guildId}`);
    return res.data;
  },

  /**
   * Ortam simgesi yükleme (sahip kararı 2026-08-01) — akış profil görselleriyle aynı:
   * presign → PUT → PATCH `storageKey`.
   *
   * 🔴 **Yalnız OWNER** (`guilds.controller`: "yalnız OWNER"); presign ayrıca e-posta doğrulaması
   * ister. ADMIN'e kalem gösterilmez.
   * 🔴 **Ortam AFİŞİ mobilde düzenlenmez** — Discord mobilde de yok (sahip doğruladı), kural o
   * yüzden yalnız simge için gevşetildi.
   */
  async presignIcon(guildId: string, contentType: string): Promise<PresignResult> {
    const res = await http.post<PresignResult>(`/guilds/${guildId}/icon/presign`, { contentType });
    return res.data;
  },

  /** `storageKey: null` → simgeyi kaldır. */
  async setIcon(guildId: string, storageKey: string | null): Promise<GuildSummaryDto> {
    const res = await http.patch<GuildSummaryDto>(`/guilds/${guildId}/icon`, { storageKey });
    return res.data;
  },
};

/**
 * Kullanıcı davet **linkini** yapıştırdıysa kodu ayıkla (sözleşme §2.2).
 * Paylaşılan şey link olduğu için kullanıcıdan link ayrıştırması beklemek gereksiz sürtünme.
 * Link değilse girdi olduğu gibi (kırpılmış) döner.
 *
 * 🔴 **Büyük harfe çevirme kozmetik DEĞİL** (web'de aynı kusur 97d7c44 ile düzeltildi): kodlar büyük
 * harf base32 üretiliyor (`short-code.util.ts`) ve sunucu `findUnique({ where: { code } })` ile
 * **harf duyarlı** arıyor → küçük harfli kod "davet geçersiz" verir. Ekrandaki
 * `autoCapitalize="characters"` yalnız YAZARKEN çalışır, **yapıştırılan** metni dönüştürmez —
 * paylaşılan şey link olduğu için asıl yol yapıştırmadır. Dönüşüm burada, tek çıkış noktasında:
 * önizleme ve katılma aynı kodu kullanmalı, yoksa iki yüzey birbirini yalanlar (önizleme
 * "geçersiz" derken Katıl çalışır). `toLocaleUpperCase` DEĞİL — TR yerelinde 'i' → 'İ' olur,
 * base32 alfabesinde öyle bir harf yok.
 */
export function extractInviteCode(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/invite\/([^/?#\s]+)/i);
  return (match ? match[1] : trimmed).toUpperCase();
}
