import http from './http';
// Presign sonucu kullanıcı görselleriyle AYNI şekil (`{ uploadUrl, storageKey }`) — ikinci bir tip
// tanımlanmadı, sunucuda da tek `PresignResult` var.
import type { AnimatedPresignResult, AnimatedProcessPayload, PresignResult } from './users';

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
  /** C19: hareketli simge (WebP). `iconUrl` daima statik kare; SVG yuzeyleri (ray) YALNIZ statigi okur. */
  iconAnimatedUrl?: string | null;
  ownerId: string;
  // M1d-B §10.3 — afiş mobilde GÖSTERİLİR (yüklenmez). Sunucu `toGuildDto`'da zaten dönüyordu.
  bannerUrl: string | null;
  /** C19: hareketli afis (WebP); normal `Image` yuzeylerinde azaltilmis hareket kapaliyken gosterilir. */
  bannerAnimatedUrl?: string | null;
  // M1e-B — Genel ayarlar ekranı için. Hepsi `toGuildDto`'da ZATEN dönüyordu, tiplenmemişti.
  adultsOnly: boolean;
  description: string | null;
  /** Keşfet listesinde görünsün mü (C6). */
  discoverable: boolean;
  tags: string[];
  // Sprint M2a §3 — rail'deki pip/bahsetme rozeti için. Sunucu M0'dan beri `toGuildDto`'da
  // dönüyordu (guilds.service.ts), yalnız tiplenmemişti — yeni backend alanı DEĞİL.
  unreadCount: number;
  unreadMentionCount: number;
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

// 🔴 Sprint R20 — enum-ADMIN katmanı kaldırıldı (api/ `schema.prisma` `enum GuildRole { OWNER MEMBER }`).
// Bilinçli DAR tip: derleyici artık 'ADMIN' dalına dallanan HER yeri hata olarak gösterir.
export type GuildRole = 'OWNER' | 'MEMBER';

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

/** M1e-B §3.8 — `api/src/modules/guilds/dto/audit-log-entry.dto.ts`den birebir. */
export interface AuditLogUserDto {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface AuditLogEntryDto {
  id: string;
  /** Ör. `guild.member_kicked` — metin `audit.action.<son parça>` anahtarından okunur. */
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  actor: AuditLogUserDto;
  targetUser: AuditLogUserDto | null;
  reason: string | null;
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

  /**
   * M1e-B §3.7 — daveti iptal et. M1d-A'da "davet iptal ekranı kapsam dışı" diye bağlanmamıştı
   * (kullanılmayan uç bağlamak ölü koddur); ekranı gelince bağlandı.
   */
  async revokeInvite(code: string): Promise<null> {
    const res = await http.delete<null>(`/invites/${code}`);
    return res.data;
  },

  /** M1e-B §3.8 — denetim kaydı; `before` cursor (auditLog id). */
  async listAuditLogs(guildId: string, before?: string): Promise<AuditLogEntryDto[]> {
    const res = await http.get<AuditLogEntryDto[]>(`/guilds/${guildId}/audit-logs`, {
      params: before ? { before } : undefined,
    });
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
  /**
   * Sprint M1g R1 — kankayı ortama davet: hedefe **kalıcı GUILD_INVITE bildirimi** düşer
   * (`POST /guilds/:id/invite-friend`, `InviteFriendDto` = `{ userId }`).
   *
   * 🔴 Sunucu iki şey birden istiyor: `CREATE_INVITE` yetkisi **ve** aradaki arkadaşlık. Yani
   * rastgele bir kullanıcıyı davet etmek mümkün değil, yalnız kankalar. İstemci bu kuralı taklit
   * etmiyor; zaten yalnız kanka listesini gösterdiği için doğal olarak uyuyor.
   */
  async inviteFriend(guildId: string, userId: string): Promise<null> {
    const res = await http.post<null>(`/guilds/${guildId}/invite-friend`, { userId });
    return res.data;
  },
  async getMembers(guildId: string): Promise<GuildMemberDto[]> {
    const res = await http.get<GuildMemberDto[]>(`/guilds/${guildId}/members`);
    return res.data;
  },

  // ─── M1e-A — ortam yönetimi ────────────────────────────────────────────────
  // 🔴 Yetki hiyerarşisi SUNUCUDA (OWNER > MEMBER + izin bayrakları — Sprint R20, enum-ADMIN katmanı
  // kaldırıldı). İstemci yalnız kendi yetkisine göre satır gizler; kararı hesaplamaz, gevşetmez.
  // Ret gelirse sunucunun mesajı gösterilir.
  //
  // 🔴 Sprint R20 — `setMemberRole` (PATCH .../role) BURADAN SİLİNDİ: geriye atanabilir tek değer
  // kalmıyor (ADMIN enum'dan düştü), rol vermek artık özel rol sisteminin işi. Uç da backend'den
  // kaldırıldı (api/ §1.2).

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

  /** 🔴 Geri alınamaz: hedef OWNER olur, eski sahip MEMBER'e düşer. Çift onay ister (sözleşme §2.4). */
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
   * ister.
   * 🔴 **Ortam AFİŞİ mobilde düzenlenmez** — Discord mobilde de yok (sahip doğruladı), kural o
   * yüzden yalnız simge için gevşetildi.
   */
  async presignIcon(guildId: string, contentType: string): Promise<PresignResult> {
    const res = await http.post<PresignResult>(`/guilds/${guildId}/icon/presign`, { contentType });
    return res.data;
  },

  /** C19: ortam simgesi/afisi kaynagi icin ozel bucket staging presign (yalniz OWNER). */
  async animatedPresign(guildId: string, contentType: string, size: number): Promise<AnimatedPresignResult> {
    const res = await http.post<AnimatedPresignResult>(`/guilds/${guildId}/animated/presign`, { contentType, size });
    return res.data;
  },

  async processIcon(guildId: string, payload: AnimatedProcessPayload): Promise<GuildSummaryDto> {
    const res = await http.post<GuildSummaryDto>(`/guilds/${guildId}/icon/process`, payload);
    return res.data;
  },

  async processBanner(guildId: string, payload: AnimatedProcessPayload): Promise<GuildSummaryDto> {
    const res = await http.post<GuildSummaryDto>(`/guilds/${guildId}/banner/process`, payload);
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
