import http from './http';

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

/** Ortam üyesi — yalnız kendi rolümü çözmek için kullanılıyor (bkz. `getMembers`). */
export interface GuildMemberDto {
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
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
