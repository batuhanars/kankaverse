import { PresenceService } from './presence.service';

// ── Mock PrismaService ─────────────────────────────────────────────────────
const prismaMock = {
  userBlock: { findFirst: jest.fn() },
  friendship: { findFirst: jest.fn(), findMany: jest.fn() },
  user: { findUnique: jest.fn() },
  guildMember: { findFirst: jest.fn(), findMany: jest.fn() },
};

function makeService() {
  return new PresenceService(prismaMock as any);
}

function resetMocks() {
  jest.resetAllMocks();
  prismaMock.userBlock.findFirst.mockResolvedValue(null);
  prismaMock.friendship.findFirst.mockResolvedValue(null);
  prismaMock.friendship.findMany.mockResolvedValue([]);
  prismaMock.user.findUnique.mockResolvedValue(null);
  prismaMock.guildMember.findFirst.mockResolvedValue(null);
  prismaMock.guildMember.findMany.mockResolvedValue([]);
}

const ADULT_TARGET = { id: 'target-adult', isMinor: false };
const MINOR_TARGET = { id: 'target-minor', isMinor: true };
const VIEWER = 'viewer1';

describe('PresenceService', () => {
  let service: PresenceService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  // ── connect / disconnect sayaç mantığı ─────────────────────────────────────
  describe('connect / disconnect — çok-sekme sayaç mantığı', () => {
    it('ilk connect → status=online döner', () => {
      const status = service.connect('user1');
      expect(status).toBe('online');
    });

    it('2 connect + 1 disconnect → hâlâ online (nowOffline=false)', () => {
      service.connect('user1');
      service.connect('user1');
      const nowOffline = service.disconnect('user1');
      expect(nowOffline).toBe(false);
      expect(service.getStatus('user1')).toBe('online');
    });

    it('2 connect + 2 disconnect → offline (nowOffline=true)', () => {
      service.connect('user1');
      service.connect('user1');
      service.disconnect('user1');
      const nowOffline = service.disconnect('user1');
      expect(nowOffline).toBe(true);
      expect(service.getStatus('user1')).toBe('offline');
    });

    it('bağlı değilken disconnect → false', () => {
      const nowOffline = service.disconnect('ghost');
      expect(nowOffline).toBe(false);
    });

    it('bağlı değilken getStatus → offline', () => {
      expect(service.getStatus('ghost')).toBe('offline');
    });
  });

  // ── setStatus ───────────────────────────────────────────────────────────────
  describe('setStatus', () => {
    it('bağlıyken durum günceller', () => {
      service.connect('user1');
      const result = service.setStatus('user1', 'dnd');
      expect(result).toBe('dnd');
      expect(service.getStatus('user1')).toBe('dnd');
    });

    it('bağlı değilken setStatus → offline döner, güncelleme olmaz', () => {
      const result = service.setStatus('ghost', 'away');
      expect(result).toBe('offline');
    });

    it('connect sonrası setStatus away → away; tekrar connect → away korunur', () => {
      service.connect('user1');
      service.setStatus('user1', 'away');
      service.connect('user1'); // ikinci sekme
      expect(service.getStatus('user1')).toBe('away');
    });
  });

  // ── canSeePresence — R7 karar matrisi ──────────────────────────────────────
  describe('canSeePresence — R7 karar matrisi', () => {
    // Kural 1
    it('viewerId === targetId → true (kendini görür)', async () => {
      const result = await service.canSeePresence('u1', 'u1');
      expect(result).toBe(true);
      // DB sorgusu yapılmamalı
      expect(prismaMock.userBlock.findFirst).not.toHaveBeenCalled();
    });

    // Kural 2 — engel (T&S sertleştirme — contract'ta yoktu, görevde eklendi)
    it('viewer→target blok → false (arkadaş bile olsa engel kazanır)', async () => {
      prismaMock.userBlock.findFirst.mockResolvedValue({ id: 'blk1' });
      const result = await service.canSeePresence(VIEWER, ADULT_TARGET.id);
      expect(result).toBe(false);
      // friendship sorgusuna gelinmemeli
      expect(prismaMock.friendship.findFirst).not.toHaveBeenCalled();
    });

    it('target→viewer blok → false (ters yön de engeller)', async () => {
      prismaMock.userBlock.findFirst.mockResolvedValue({ id: 'blk2' });
      const result = await service.canSeePresence(VIEWER, MINOR_TARGET.id);
      expect(result).toBe(false);
    });

    // Kural 3 — karşılıklı arkadaş
    it('karşılıklı arkadaş (ACCEPTED) + hedef minör → true (arkadaş önce gelir)', async () => {
      prismaMock.friendship.findFirst.mockResolvedValue({ id: 'fs1' });
      const result = await service.canSeePresence(VIEWER, MINOR_TARGET.id);
      expect(result).toBe(true);
    });

    it('karşılıklı arkadaş (ACCEPTED) + hedef yetişkin → true', async () => {
      prismaMock.friendship.findFirst.mockResolvedValue({ id: 'fs2' });
      const result = await service.canSeePresence(VIEWER, ADULT_TARGET.id);
      expect(result).toBe(true);
    });

    // Kural 4 — minör hedef, arkadaş değil
    it('minör hedef + arkadaş DEĞİL + ortak guild VAR → false (kritik invariant)', async () => {
      // Blok yok, arkadaş yok, target minör, ortak guild var
      prismaMock.user.findUnique.mockResolvedValue(MINOR_TARGET);
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm1' });
      const result = await service.canSeePresence(VIEWER, MINOR_TARGET.id);
      expect(result).toBe(false);
      // Guild sorgusuna gelinmemeli (kural 4 önce durmalı)
      expect(prismaMock.guildMember.findFirst).not.toHaveBeenCalled();
    });

    it('minör hedef + arkadaş değil + ortak guild yok → false', async () => {
      prismaMock.user.findUnique.mockResolvedValue(MINOR_TARGET);
      const result = await service.canSeePresence(VIEWER, MINOR_TARGET.id);
      expect(result).toBe(false);
    });

    // Kural 5 — yetişkin + ortak guild
    it('yetişkin hedef + arkadaş değil + ortak guild → true', async () => {
      prismaMock.user.findUnique.mockResolvedValue(ADULT_TARGET);
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm1' });
      const result = await service.canSeePresence(VIEWER, ADULT_TARGET.id);
      expect(result).toBe(true);
    });

    // Kural 6 — fail-closed
    it('yabancı (ilişkisiz, yetişkin hedef, ortak guild yok) → false', async () => {
      prismaMock.user.findUnique.mockResolvedValue(ADULT_TARGET);
      const result = await service.canSeePresence(VIEWER, ADULT_TARGET.id);
      expect(result).toBe(false);
    });

    it('target bulunamaz (silinmiş) → false (fail-closed)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      const result = await service.canSeePresence(VIEWER, 'ghost-id');
      expect(result).toBe(false);
    });
  });

  // ── visibleOnlineFor — snapshot doğru yönü kullanmalı ────────────────────
  describe('visibleOnlineFor — snapshot kaynağı', () => {
    it('aday offline → listede yok', async () => {
      // userId'nin arkadaşı friend1; ama friend1 bağlı değil (offline)
      prismaMock.friendship.findMany.mockResolvedValueOnce([
        { requesterId: 'viewer1', addresseeId: 'friend1' },
      ]);
      prismaMock.guildMember.findMany.mockResolvedValueOnce([]);
      // canSeePresence sorgusu yapılmadan getStatus offline döner; listeye girmez
      prismaMock.userBlock.findFirst.mockResolvedValue(null);
      prismaMock.friendship.findFirst.mockResolvedValue({ id: 'fs1' });

      const service = makeService();
      // friend1 bağlı değil (state'e eklenmedi)
      const result = await service.visibleOnlineFor('viewer1');
      expect(result).toEqual([]);
    });

    it('arkadaş online → listede var', async () => {
      prismaMock.friendship.findMany.mockResolvedValueOnce([
        { requesterId: 'viewer1', addresseeId: 'friend1' },
      ]);
      prismaMock.guildMember.findMany.mockResolvedValueOnce([]);
      prismaMock.userBlock.findFirst.mockResolvedValue(null);
      prismaMock.friendship.findFirst.mockResolvedValue({ id: 'fs1' });

      const service = makeService();
      service.connect('friend1'); // friend1 online

      const result = await service.visibleOnlineFor('viewer1');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ userId: 'friend1', status: 'online' });
    });

    it('engelli kullanıcı online → listede YOK', async () => {
      prismaMock.friendship.findMany.mockResolvedValueOnce([
        { requesterId: 'viewer1', addresseeId: 'blocked1' },
      ]);
      prismaMock.guildMember.findMany.mockResolvedValueOnce([]);
      // blok var → canSeePresence false
      prismaMock.userBlock.findFirst.mockResolvedValue({ id: 'blk1' });

      const service = makeService();
      service.connect('blocked1');

      const result = await service.visibleOnlineFor('viewer1');
      expect(result).toEqual([]);
    });

    it('KRİTİK: minör viewer + yetişkin ortak-guild üyesi online → listede VAR', async () => {
      // Minör viewer1'in arkadaşı yok; sadece ortak-guild üyesi adult1
      prismaMock.friendship.findMany.mockResolvedValueOnce([]); // arkadaş yok
      prismaMock.guildMember.findMany
        .mockResolvedValueOnce([{ guildId: 'guild1' }]) // viewer1'in guild'leri
        .mockResolvedValueOnce([{ userId: 'adult1' }]); // guild1 üyeleri

      // canSeePresence('viewer1' → minör, 'adult1' → yetişkin):
      //  Kural 2: blok yok
      //  Kural 3: arkadaş yok
      //  Kural 4: target=adult1 → isMinor=false → geç
      //  Kural 5: ortak guild → true
      prismaMock.userBlock.findFirst.mockResolvedValue(null);
      prismaMock.friendship.findFirst.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue({ isMinor: false }); // adult1
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm1' }); // ortak guild var

      const service = makeService();
      service.connect('adult1'); // adult1 online

      const result = await service.visibleOnlineFor('viewer1');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ userId: 'adult1', status: 'online' });
    });

    it('minör viewer + minör-olmayan-arkadaş online → listede var', async () => {
      prismaMock.friendship.findMany.mockResolvedValueOnce([
        { requesterId: 'minor1', addresseeId: 'adultfriend1' },
      ]);
      prismaMock.guildMember.findMany.mockResolvedValueOnce([]);
      prismaMock.userBlock.findFirst.mockResolvedValue(null);
      prismaMock.friendship.findFirst.mockResolvedValue({ id: 'fs1' }); // arkadaş → kural 3 true

      const service = makeService();
      service.connect('adultfriend1');

      const result = await service.visibleOnlineFor('minor1');
      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('adultfriend1');
    });
  });

  // ── audienceFor — temel davranış ───────────────────────────────────────────
  describe('audienceFor — temel davranış', () => {
    it('arkadaş yok + guild yok → boş liste', async () => {
      const audience = await service.audienceFor('user1');
      expect(audience).toEqual([]);
    });

    it('minör userId — yalnız arkadışlar audience döner', async () => {
      // userId'nin arkadaşı: friend1
      prismaMock.friendship.findMany.mockResolvedValueOnce([
        { requesterId: 'user1', addresseeId: 'friend1' },
      ]);
      // ortak guild yok
      prismaMock.guildMember.findMany.mockResolvedValueOnce([]);

      // canSeePresence(friend1, user1):
      //  - blok yok
      //  - arkadaş var → true
      prismaMock.userBlock.findFirst.mockResolvedValue(null);
      prismaMock.friendship.findFirst.mockResolvedValue({ id: 'fs1' });

      const audience = await service.audienceFor('user1');
      expect(audience).toContain('friend1');
    });

    it('userId kendisi audience\'a girmez (dedup)', async () => {
      prismaMock.friendship.findMany.mockResolvedValueOnce([
        { requesterId: 'user1', addresseeId: 'user1' }, // kendine arkadaş olamaz ama savunma testi
      ]);
      prismaMock.guildMember.findMany.mockResolvedValueOnce([]);

      const audience = await service.audienceFor('user1');
      expect(audience).not.toContain('user1');
    });
  });
});
