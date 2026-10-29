import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { ImageUploadService } from '../../shared/media/image-upload.service';

// ── Mock PrismaService ───────────────────────────────────────────────────────
const prismaMock = {
  user: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  guildMember: { findFirst: jest.fn(), findUnique: jest.fn() },
  channelMember: { findFirst: jest.fn() },
  guild: { findMany: jest.fn() },
  friendship: { findFirst: jest.fn(), findMany: jest.fn() },
  userBlock: { findUnique: jest.fn() },
  voiceSession: { findFirst: jest.fn() }, // C10 — kart ses durumu
  recentGame: { deleteMany: jest.fn(), findMany: jest.fn() }, // C31f
};

// C10 — canDm (inline mesaj kutusu kapısı) + VoiceService (ses durumu) mock'ları
const dmPermissionMock = { canDm: jest.fn() };
const voiceMock = { getLiveParticipation: jest.fn() };

// C8: ImageUploadService — StorageService/ConfigService mock üzerinden gerçek örnek
// (presignAvatar/setAvatar/presignBanner/setBanner testleri bunun üzerinden geçer).
const storageMock = {
  presignPut: jest.fn(),
  presignPutPublic: jest.fn(),
  presignGet: jest.fn(),
  delete: jest.fn(),
};
const configMock = {
  get: jest.fn((key: string) => {
    const values: Record<string, unknown> = {
      's3.publicUrl': 'http://localhost:9000/kankaverse',
      's3.publicBaseUrl': 'http://localhost:9000/kankaverse',
      uploadsEnabled: true,
    };
    return values[key];
  }),
};

function makeService() {
  return new UsersService(
    prismaMock as any,
    new ImageUploadService(storageMock as any, configMock as any),
    dmPermissionMock as any,
    voiceMock as any,
    { canCreateAnimated: () => true } as any, // AnimatedMediaService (yalniz C22 animatedAllowed icin)
    { get: () => undefined } as any, // ConfigService (C14 aiVideoAllowed: kapali)
    { clearGames: jest.fn(), broadcastActivity: jest.fn() } as any, // PresenceService (C31b)
  );
}

function resetMediaMocks() {
  storageMock.presignPut.mockReset();
  storageMock.presignPutPublic.mockReset();
  configMock.get.mockImplementation((key: string) => {
    const values: Record<string, unknown> = {
      's3.publicUrl': 'http://localhost:9000/kankaverse',
      's3.publicBaseUrl': 'http://localhost:9000/kankaverse',
      uploadsEnabled: true,
    };
    return values[key];
  });
}

const NOW_ISO = '2026-01-02T03:04:05.000Z';
const CREATED_AT = new Date(NOW_ISO);

function resetMocks() {
  jest.resetAllMocks();
  prismaMock.guildMember.findFirst.mockResolvedValue(null);
  prismaMock.guildMember.findUnique.mockResolvedValue(null);
  prismaMock.channelMember.findFirst.mockResolvedValue(null);
  prismaMock.guild.findMany.mockResolvedValue([]);
  prismaMock.friendship.findFirst.mockResolvedValue(null);
  prismaMock.friendship.findMany.mockResolvedValue([]);
  prismaMock.userBlock.findUnique.mockResolvedValue(null);
  prismaMock.user.findMany.mockResolvedValue([]);
  prismaMock.voiceSession.findFirst.mockResolvedValue(null);
  dmPermissionMock.canDm.mockResolvedValue({ allowed: true });
  voiceMock.getLiveParticipation.mockResolvedValue({
    present: false,
    streaming: false,
    video: false,
  });
  resetMediaMocks();
}

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  // ── PATCH /users/me ────────────────────────────────────────────────────────
  describe('updateProfile', () => {
    it('yalnız verilen alanları günceller (bio + dmPolicy)', async () => {
      const updated = {
        id: 'u1',
        username: 'kanka',
        email: 'k@x.tr',
        avatarUrl: null,
        bio: 'merhaba',
        dmPolicy: 'FRIENDS',
        isMinor: false,
        verificationStatus: 'NONE',
        createdAt: CREATED_AT,
        emailVerifiedAt: null,
        twoFactorEnabled: false,
        isModerator: false,
        friendCode: 'ABC123',
      };
      prismaMock.user.update.mockResolvedValue(updated);

      const dto = { bio: 'merhaba', dmPolicy: 'FRIENDS' as const };
      const res = await service.updateProfile('u1', dto);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { bio: 'merhaba', dmPolicy: 'FRIENDS' },
      });
      expect(res.bio).toBe('merhaba');
      expect(res.dmPolicy).toBe('FRIENDS');
    });

    it('undefined alan → data objesine girmez (değişmez)', async () => {
      prismaMock.user.update.mockResolvedValue({
        id: 'u1',
        username: 'kanka',
        email: 'k@x.tr',
        avatarUrl: null,
        bio: 'eski',
        dmPolicy: 'EVERYONE',
        isMinor: false,
        verificationStatus: 'NONE',
        createdAt: CREATED_AT,
        emailVerifiedAt: null,
        twoFactorEnabled: false,
        isModerator: false,
        friendCode: 'ABC123',
      });

      await service.updateProfile('u1', { dmPolicy: 'EVERYONE' as const });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { dmPolicy: 'EVERYONE' },
      });
      // bio gönderilmedi → data'da yok
      const callArg = prismaMock.user.update.mock.calls[0][0];
      expect(callArg.data).not.toHaveProperty('bio');
    });

    it('quickReactions data objesine yazılır; boş dizi sıfırlama olarak geçer (C24)', async () => {
      prismaMock.user.update.mockResolvedValue({
        id: 'u1',
        createdAt: CREATED_AT,
        emailVerifiedAt: null,
        quickReactions: [],
      });
      const res = await service.updateProfile('u1', { quickReactions: [] });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { quickReactions: [] },
      });
      expect(res.quickReactions).toEqual(['👍', '❤️', '😂', '😮', '😢']);
    });

    it('boş dto → boş data (hiçbir alan değişmez)', async () => {
      prismaMock.user.update.mockResolvedValue({
        id: 'u1',
        username: 'kanka',
        email: 'k@x.tr',
        avatarUrl: null,
        bio: null,
        dmPolicy: 'FRIENDS',
        isMinor: false,
        verificationStatus: 'NONE',
        createdAt: CREATED_AT,
        emailVerifiedAt: null,
        twoFactorEnabled: false,
        isModerator: false,
        friendCode: 'ABC123',
      });

      await service.updateProfile('u1', {});

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {},
      });
    });
  });

  // ── GET /users/:id/card — erişim kapısı KORUNDU ──────────────────────────────
  describe('getUserCard — erişim kapısı (R7)', () => {
    const CALLER = 'caller-1';
    const TARGET = 'target-1';

    function mockTargetExists(extra: Partial<{ bio: string | null }> = {}) {
      prismaMock.user.findUnique.mockResolvedValue({
        id: TARGET,
        username: 'hedef',
        avatarUrl: null,
        bio: extra.bio ?? null,
        createdAt: CREATED_AT,
      });
    }

    it('hedef yok → 404 USER_NOT_FOUND', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(service.getUserCard(CALLER, TARGET)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ortak ortam YOK + ilişki YOK + ortak GROUP_DM YOK → 404 (o-beni-engelledi sızmaz)', async () => {
      mockTargetExists();
      // sharedGuild null, sharedGroupDm null, friendship null, callerBlock null, targetBlock null (resetMocks)
      await expect(service.getUserCard(CALLER, TARGET)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ortak GROUP_DM üyeliği tek başına ilişki sayılır → kart döner (404 değil)', async () => {
      mockTargetExists({ bio: 'grup selam' });
      // ortak ortam/arkadaşlık/blok YOK; yalnız ortak GROUP_DM üyeliği var
      prismaMock.channelMember.findFirst.mockResolvedValue({ id: 'cm1' });
      const card = await service.getUserCard(CALLER, TARGET);
      expect(card.id).toBe(TARGET);
      expect(card.bio).toBe('grup selam');
      // GROUP_DM kapısı sorgusu doğru tipte
      const cmArg = prismaMock.channelMember.findFirst.mock.calls[0][0];
      expect(cmArg.where.userId).toBe(CALLER);
      expect(cmArg.where.channel.type).toBe('GROUP_DM');
      expect(cmArg.where.channel.members.some.userId).toBe(TARGET);
    });

    it('"o beni engelledi" (targetBlock) tek başına ilişki sayılır AMA selfBlocked sızmaz', async () => {
      mockTargetExists();
      // targetBlock var (target→caller), callerBlock yok
      prismaMock.userBlock.findUnique
        .mockResolvedValueOnce(null) // callerBlock
        .mockResolvedValueOnce({ id: 'blk' }); // targetBlock
      const card = await service.getUserCard(CALLER, TARGET);
      // selfBlocked yalnız callerBlock'u yansıtır → false
      expect(card.selfBlocked).toBe(false);
    });

    it('ortak ortam var → kart döner + genişletilmiş alanlar', async () => {
      mockTargetExists({ bio: 'selam' });
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm1' });
      const card = await service.getUserCard(CALLER, TARGET);
      expect(card.id).toBe(TARGET);
      expect(card.bio).toBe('selam');
      expect(card.memberSince).toBe(NOW_ISO);
      expect(card).toHaveProperty('mutualFriends');
      expect(card).toHaveProperty('mutualGuilds');
    });

    it('genişletilmiş alanların hiçbiri minör/yaş taşımaz', async () => {
      mockTargetExists();
      prismaMock.friendship.findFirst.mockResolvedValue({
        id: 'f1',
        status: 'ACCEPTED',
        requesterId: CALLER,
        addresseeId: TARGET,
      });
      const card = await service.getUserCard(CALLER, TARGET);
      expect(card).not.toHaveProperty('isMinor');
      expect(card).not.toHaveProperty('birthDate');
      expect(card).not.toHaveProperty('verificationStatus');
    });

    it('kendi kartı (self) → bio/memberSince döner, mutual listeler boş', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: CALLER,
        username: 'ben',
        avatarUrl: null,
        bio: 'kendi bio',
        createdAt: CREATED_AT,
      });
      const card = await service.getUserCard(CALLER, CALLER);
      expect(card.friendStatus).toBe('self');
      expect(card.bio).toBe('kendi bio');
      expect(card.memberSince).toBe(NOW_ISO);
      expect(card.mutualFriends).toEqual([]);
      expect(card.mutualGuilds).toEqual([]);
    });
  });

  // ── M3b §5.2 (R7): erişime 1-1 DM üyeliği eklendi + fail-closed sosyal graf ───
  describe('getUserCard — DM üyeliği erişimi (M3b §5.2, R7)', () => {
    const CALLER = 'caller-1';
    const TARGET = 'target-1';

    function mockTargetExists() {
      prismaMock.user.findUnique.mockResolvedValue({
        id: TARGET,
        username: 'hedef',
        avatarUrl: null,
        bio: 'yabancı bio',
        createdAt: CREATED_AT,
      });
    }

    type DmRow = { dmRequestStatus: string | null; dmRequesterId: string | null };
    const NORMAL_DM: DmRow = { dmRequestStatus: null, dmRequesterId: null };

    // Servisin ürettiği OR kollarını gerçek bir kanal satırına uygular — where şeklini
    // hardcode'layıp yeniden yazmak yerine üretilen koşulu bizzat değerlendiriyoruz
    // (`{ not: x }` biçimi destekli).
    function rowMatchesOr(or: any[], row: DmRow) {
      return or.some((arm) =>
        Object.entries(arm).every(([key, cond]: [string, any]) =>
          cond && typeof cond === 'object' && 'not' in cond
            ? (row as any)[key] !== cond.not
            : (row as any)[key] === cond,
        ),
      );
    }

    // channelMember.findFirst iki kez çağrılır (GROUP_DM kapısı + DM kapısı);
    // hangisinin dolduğunu sorgunun `channel.type`'ından ayırt ediyoruz. DM kapısında
    // verilen satır servisin kendi OR koşulundan geçerse üyelik döner (DB gibi).
    function mockChannelAccess(opts: { dm?: DmRow | null; groupDm?: boolean }) {
      prismaMock.channelMember.findFirst.mockImplementation((args: any) => {
        const ch = args.where.channel;
        if (ch.type === 'DM') {
          if (!opts.dm) return Promise.resolve(null);
          return Promise.resolve(rowMatchesOr(ch.OR, opts.dm) ? { id: 'cm-dm' } : null);
        }
        if (ch.type === 'GROUP_DM')
          return Promise.resolve(opts.groupDm ? { id: 'cm-group' } : null);
        return Promise.resolve(null);
      });
    }

    // (a) yalnız-DM erişimi → kart döner
    it('yalnız açık 1-1 DM kanalı var (arkadaşlık/ortam/grup yok) → kart döner, 404 değil', async () => {
      mockTargetExists();
      mockChannelAccess({ dm: NORMAL_DM });

      const card = await service.getUserCard(CALLER, TARGET);

      expect(card.id).toBe(TARGET);
      expect(card.bio).toBe('yabancı bio');
      expect(card.friendStatus).toBe('none');

      // DM kapısı sorgusu doğru: caller üye + hedef üye + tip DM + soft-delete HARİÇ
      const dmCall = prismaMock.channelMember.findFirst.mock.calls
        .map((c: any[]) => c[0])
        .find((a: any) => a.where.channel.type === 'DM');
      expect(dmCall.where.userId).toBe(CALLER);
      expect(dmCall.where.channel.deletedAt).toBeNull();
      expect(dmCall.where.channel.members.some.userId).toBe(TARGET);
    });

    // (b) yalnız-DM erişiminde sosyal graf kapalı (fail-closed)
    it('yalnız-DM erişimi → mutualFriends/mutualGuilds BOŞ (yabancıya sosyal graf açılmaz)', async () => {
      mockTargetExists();
      mockChannelAccess({ dm: NORMAL_DM });
      // Sorgulansaydı dolu dönecekti — çağrılmadığını da doğruluyoruz
      prismaMock.friendship.findMany.mockResolvedValue([
        { requesterId: CALLER, addresseeId: 'ortak' },
      ]);
      prismaMock.guild.findMany.mockResolvedValue([{ id: 'g1', name: 'Ortam', iconUrl: null }]);

      const card = await service.getUserCard(CALLER, TARGET);

      expect(card.mutualFriends).toEqual([]);
      expect(card.mutualGuilds).toEqual([]);
      // Kesişim sorguları hiç yapılmadı (boş dizi "hesaplanıp atıldı" değil, hiç sorulmadı)
      expect(prismaMock.friendship.findMany).not.toHaveBeenCalled();
      expect(prismaMock.guild.findMany).not.toHaveBeenCalled();
    });

    // (c) ilişkisiz üçüncü kişi hâlâ 404
    it('DM yok + grup yok + ortam yok + ilişki yok → hâlâ 404 (tarama yüzeyi kapalı)', async () => {
      mockTargetExists();
      mockChannelAccess({}); // ne DM ne GROUP_DM

      await expect(service.getUserCard(CALLER, TARGET)).rejects.toBeInstanceOf(NotFoundException);
    });

    // (d) mevcut yollar bozulmadı
    it('ortak ortam yolu bozulmadı: DM olmasa da kart + mutual kesişimi hesaplanır', async () => {
      mockTargetExists();
      mockChannelAccess({});
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm1' });
      prismaMock.guild.findMany.mockResolvedValue([{ id: 'g1', name: 'Ortam', iconUrl: null }]);

      const card = await service.getUserCard(CALLER, TARGET);

      expect(card.id).toBe(TARGET);
      expect(card.mutualGuilds).toEqual([{ id: 'g1', name: 'Ortam', iconUrl: null }]);
      expect(prismaMock.friendship.findMany).toHaveBeenCalled();
    });

    it('arkadaşlık yolu bozulmadı: DM de olsa mutual kesişimi kısıtlanmaz', async () => {
      mockTargetExists();
      mockChannelAccess({ dm: NORMAL_DM }); // DM var AMA tek erişim kaynağı değil
      prismaMock.friendship.findFirst.mockResolvedValue({
        id: 'f1',
        status: 'ACCEPTED',
        requesterId: CALLER,
        addresseeId: TARGET,
      });
      prismaMock.guild.findMany.mockResolvedValue([{ id: 'g1', name: 'Ortam', iconUrl: null }]);

      const card = await service.getUserCard(CALLER, TARGET);

      expect(card.friendStatus).toBe('friends');
      expect(card.mutualGuilds).toEqual([{ id: 'g1', name: 'Ortam', iconUrl: null }]);
      expect(prismaMock.friendship.findMany).toHaveBeenCalled();
    });

    // ── C9 kısıtı: PENDING istekte yalnız ALICI taraf erişim kazanır ────────────
    it('PENDING istek — ALICI taraf kartı açabilir (gelen isteği engelleyebilmeli)', async () => {
      mockTargetExists();
      // İsteği hedef başlattı, caller alıcı
      mockChannelAccess({ dm: { dmRequestStatus: 'PENDING', dmRequesterId: TARGET } });

      const card = await service.getUserCard(CALLER, TARGET);

      expect(card.id).toBe(TARGET);
      expect(card.mutualFriends).toEqual([]); // yalnız-DM erişimi → fail-closed
    });

    it('PENDING istek — BAŞLATAN taraf kartı açamaz → 404 (tek taraflı istekle profil açılmaz)', async () => {
      mockTargetExists();
      // İsteği caller başlattı, hedef henüz kabul etmedi
      mockChannelAccess({ dm: { dmRequestStatus: 'PENDING', dmRequesterId: CALLER } });

      await expect(service.getUserCard(CALLER, TARGET)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('istek KABUL edilince başlatan taraf da kartı açabilir', async () => {
      mockTargetExists();
      mockChannelAccess({ dm: { dmRequestStatus: 'ACCEPTED', dmRequesterId: CALLER } });

      const card = await service.getUserCard(CALLER, TARGET);

      expect(card.id).toBe(TARGET);
    });

    // ── Silinmiş grup kanalı erişim vermez (DM kapısıyla tutarlı) ───────────────
    it('GROUP_DM kapısı da soft-delete edilmiş kanalı süzer (deletedAt: null)', async () => {
      mockTargetExists();
      mockChannelAccess({ groupDm: true });

      await service.getUserCard(CALLER, TARGET);

      const groupCall = prismaMock.channelMember.findFirst.mock.calls
        .map((c: any[]) => c[0])
        .find((a: any) => a.where.channel.type === 'GROUP_DM');
      expect(groupCall.where.channel.deletedAt).toBeNull();
    });
  });

  // ── M3b §5.2 sahip turu (R7): ortak kanka/ortam görünürlüğü tek ilkede ───────
  // İLKE: kendi tek taraflı hareketinle sosyal graf görünürlüğü kazanamazsın.
  describe('getUserCard — ortak kanka/ortam görünürlüğü (M3b §5.2, R7)', () => {
    const CALLER = 'caller-1';
    const TARGET = 'target-1';
    const MUTUAL_GUILD = { id: 'g1', name: 'Ortam', iconUrl: null };

    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: TARGET,
        username: 'hedef',
        avatarUrl: null,
        bio: null,
        createdAt: CREATED_AT,
      });
      // Graf AÇILIRSA görülecek veri — kapalı beklenen testlerde hiç sorgulanmamalı
      prismaMock.guild.findMany.mockResolvedValue([MUTUAL_GUILD]);
      prismaMock.friendship.findMany.mockResolvedValue([]);
    });

    // Graf kapalı: yalnız boş dizi değil, kesişim SORGUSU hiç yapılmamalı
    function expectGrafKapali(card: { mutualFriends: unknown[]; mutualGuilds: unknown[] }) {
      expect(card.mutualFriends).toEqual([]);
      expect(card.mutualGuilds).toEqual([]);
      expect(prismaMock.friendship.findMany).not.toHaveBeenCalled();
      expect(prismaMock.guild.findMany).not.toHaveBeenCalled();
    }

    function expectGrafAcik(card: { mutualGuilds: unknown[] }) {
      expect(card.mutualGuilds).toEqual([MUTUAL_GUILD]);
      expect(prismaMock.friendship.findMany).toHaveBeenCalled();
    }

    // (a) ENGELLEYEN taraf
    it('ben onu engelledim → graf kapalı (kart yine açılır, engeli kaldırabilmek için)', async () => {
      prismaMock.userBlock.findUnique
        .mockResolvedValueOnce({ id: 'blk' }) // callerBlock
        .mockResolvedValueOnce(null); // targetBlock

      const card = await service.getUserCard(CALLER, TARGET);

      expect(card.id).toBe(TARGET);
      expect(card.selfBlocked).toBe(true);
      expectGrafKapali(card);
    });

    // (b) ENGELLENEN taraf — sahibin asıl isteği
    it('o beni engelledi → graf kapalı (selfBlocked yine sızmaz)', async () => {
      prismaMock.userBlock.findUnique
        .mockResolvedValueOnce(null) // callerBlock
        .mockResolvedValueOnce({ id: 'blk' }); // targetBlock

      const card = await service.getUserCard(CALLER, TARGET);

      expect(card.selfBlocked).toBe(false); // G3 semantiği değişmedi
      expectGrafKapali(card);
    });

    // (c) yalnız GROUP_DM — D33 borcu
    it('yalnız ortak GROUP_DM → graf kapalı (grup üyeleri birbirine yabancı olabilir)', async () => {
      prismaMock.channelMember.findFirst.mockImplementation((args: any) =>
        Promise.resolve(args.where.channel.type === 'GROUP_DM' ? { id: 'cm-group' } : null),
      );

      const card = await service.getUserCard(CALLER, TARGET);

      expect(card.id).toBe(TARGET); // erişim kuralı DEĞİŞMEDİ
      expectGrafKapali(card);
    });

    // (d) GİDEN bekleyen istek — tek taraflı hareket
    it('benim gönderdiğim bekleyen istek → graf kapalı (istek atarak graf açılmaz)', async () => {
      prismaMock.friendship.findFirst.mockResolvedValue({
        id: 'f1',
        status: 'PENDING',
        requesterId: CALLER,
        addresseeId: TARGET,
      });

      const card = await service.getUserCard(CALLER, TARGET);

      expect(card.friendStatus).toBe('pending_out');
      expectGrafKapali(card);
    });

    // (e) GELEN bekleyen istek — bilinçli açık kol
    it('bana gelmiş bekleyen istek → graf AÇIK (kabul kararını verirken gerçek ihtiyaç)', async () => {
      prismaMock.friendship.findFirst.mockResolvedValue({
        id: 'f1',
        status: 'PENDING',
        requesterId: TARGET,
        addresseeId: CALLER,
      });

      const card = await service.getUserCard(CALLER, TARGET);

      expect(card.friendStatus).toBe('pending_in');
      expectGrafAcik(card);
    });

    // (f) kabul edilmiş arkadaşlık
    it('kabul edilmiş arkadaşlık → graf açık', async () => {
      prismaMock.friendship.findFirst.mockResolvedValue({
        id: 'f1',
        status: 'ACCEPTED',
        requesterId: CALLER,
        addresseeId: TARGET,
      });

      const card = await service.getUserCard(CALLER, TARGET);

      expect(card.friendStatus).toBe('friends');
      expectGrafAcik(card);
    });

    // (g) ortak ortam
    it('ortak ortam → graf açık', async () => {
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm1' });

      const card = await service.getUserCard(CALLER, TARGET);

      expectGrafAcik(card);
    });

    // Reddedilmiş istek açık kollardan hiçbiri değil
    it('DECLINED arkadaşlık → graf kapalı', async () => {
      prismaMock.friendship.findFirst.mockResolvedValue({
        id: 'f1',
        status: 'DECLINED',
        requesterId: TARGET,
        addresseeId: CALLER,
      });

      const card = await service.getUserCard(CALLER, TARGET);

      expect(card.friendStatus).toBe('none');
      expectGrafKapali(card);
    });
  });

  // ── C10 kart zenginleştirme: canMessage + rol/ses ifşa kapıları ───────────────
  describe('getUserCard — C10 (canMessage / roller / ses durumu)', () => {
    const CALLER = 'caller-1';
    const TARGET = 'target-1';
    const GUILD = 'guild-1';

    function mockTargetExists() {
      prismaMock.user.findUnique.mockResolvedValue({
        id: TARGET,
        username: 'hedef',
        avatarUrl: null,
        bio: null,
        createdAt: CREATED_AT,
      });
      // erişim kapısı: ortak ortam var
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm-access' });
    }

    it('canMessage = canDm.allowed (izin yok → false, kutu gösterilmez)', async () => {
      mockTargetExists();
      dmPermissionMock.canDm.mockResolvedValue({ allowed: false, reason: 'DM_NOT_ALLOWED' });
      const card = await service.getUserCard(CALLER, TARGET);
      expect(card.canMessage).toBe(false);
    });

    it('guildId verilmezse roller boş (findUnique çağrılmaz)', async () => {
      mockTargetExists();
      const card = await service.getUserCard(CALLER, TARGET);
      expect(card.roles).toEqual([]);
      expect(prismaMock.guildMember.findUnique).not.toHaveBeenCalled();
    });

    it('rol kapısı: caller o ortamın üyesi DEĞİL → roller boş (ifşa yok)', async () => {
      mockTargetExists();
      prismaMock.guildMember.findUnique.mockResolvedValueOnce(null); // callerMember yok
      const card = await service.getUserCard(CALLER, TARGET, GUILD);
      expect(card.roles).toEqual([]);
    });

    it('rol kapısı geçti → @everyone hariç, pozisyona göre yüksekten alçağa', async () => {
      mockTargetExists();
      prismaMock.guildMember.findUnique
        .mockResolvedValueOnce({ id: 'caller-member' }) // callerMember var
        .mockResolvedValueOnce({
          roleLinks: [
            { role: { id: 'r-low', name: 'Üye', color: '#aaa', position: 1, isEveryone: false } },
            {
              role: {
                id: 'r-everyone',
                name: '@everyone',
                color: '#000',
                position: 0,
                isEveryone: true,
              },
            },
            {
              role: { id: 'r-high', name: 'Admin', color: '#f00', position: 5, isEveryone: false },
            },
          ],
        });
      const card = await service.getUserCard(CALLER, TARGET, GUILD);
      expect(card.roles.map((r) => r.id)).toEqual(['r-high', 'r-low']);
      expect(card.roles.find((r) => r.name === '@everyone')).toBeUndefined();
    });

    // Ortak kurulum: hedef aktif VoiceSession + caller ortam üyesi (LiveKit doğrulaması kalır)
    function mockActiveSession() {
      prismaMock.voiceSession.findFirst.mockResolvedValue({
        channelId: 'vc-1',
        channel: { name: 'Lounge', guildId: GUILD, guild: { name: 'Ortam' } },
      });
      prismaMock.guildMember.findUnique.mockResolvedValueOnce({ id: 'caller-member' });
    }

    it('ses durumu: aktif oturum yok → null (LiveKit sorgulanmaz)', async () => {
      mockTargetExists();
      const card = await service.getUserCard(CALLER, TARGET);
      expect(card.voiceStatus).toBeNull();
      expect(voiceMock.getLiveParticipation).not.toHaveBeenCalled();
    });

    it('ses kapısı: caller o ortamın üyesi DEĞİL → null (konum ifşası yok, LiveKit sorgulanmaz)', async () => {
      mockTargetExists();
      prismaMock.voiceSession.findFirst.mockResolvedValue({
        channelId: 'vc-1',
        channel: { name: 'Lounge', guildId: GUILD, guild: { name: 'Ortam' } },
      });
      prismaMock.guildMember.findUnique.mockResolvedValueOnce(null); // callerMember yok
      const card = await service.getUserCard(CALLER, TARGET);
      expect(card.voiceStatus).toBeNull();
      expect(voiceMock.getLiveParticipation).not.toHaveBeenCalled();
    });

    it('LiveKit CANLI doğrular + ekran yayını → streaming true', async () => {
      mockTargetExists();
      mockActiveSession();
      voiceMock.getLiveParticipation.mockResolvedValue({
        present: true,
        streaming: true,
        video: false,
      });
      const card = await service.getUserCard(CALLER, TARGET);
      expect(card.voiceStatus).toMatchObject({
        channelId: 'vc-1',
        channelName: 'Lounge',
        guildName: 'Ortam',
        streaming: true,
        video: false,
      });
    });

    it('bayat oturum: LiveKit hedefi içermiyor (present=false) → null', async () => {
      mockTargetExists();
      mockActiveSession();
      voiceMock.getLiveParticipation.mockResolvedValue({
        present: false,
        streaming: false,
        video: false,
      });
      const card = await service.getUserCard(CALLER, TARGET);
      expect(card.voiceStatus).toBeNull();
    });

    it('LiveKit erişilemez (null) → null (fail-closed, bayat kayda düşülmez)', async () => {
      mockTargetExists();
      mockActiveSession();
      voiceMock.getLiveParticipation.mockResolvedValue(null);
      const card = await service.getUserCard(CALLER, TARGET);
      expect(card.voiceStatus).toBeNull();
    });
  });

  // ── Mutual hesap mantığı ─────────────────────────────────────────────────────
  describe('getUserCard — mutual kesişim', () => {
    const CALLER = 'caller-1';
    const TARGET = 'target-1';

    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: TARGET,
        username: 'hedef',
        avatarUrl: null,
        bio: null,
        createdAt: CREATED_AT,
      });
      // erişim kapısı geçsin
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm1' });
    });

    it('mutualFriends = caller ∩ target ACCEPTED arkadaş kesişimi', async () => {
      // caller arkadaşları: A, B, C   target arkadaşları: B, C, D  → kesişim B, C
      prismaMock.friendship.findMany
        .mockResolvedValueOnce([
          { requesterId: CALLER, addresseeId: 'A' },
          { requesterId: 'B', addresseeId: CALLER },
          { requesterId: CALLER, addresseeId: 'C' },
        ]) // caller
        .mockResolvedValueOnce([
          { requesterId: TARGET, addresseeId: 'B' },
          { requesterId: 'C', addresseeId: TARGET },
          { requesterId: TARGET, addresseeId: 'D' },
        ]); // target
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'B', username: 'b', avatarUrl: null },
        { id: 'C', username: 'c', avatarUrl: null },
      ]);

      const card = await service.getUserCard(CALLER, TARGET);

      // user.findMany çağrısı sadece kesişim id'leriyle yapıldı
      const findManyArg = prismaMock.user.findMany.mock.calls[0][0];
      expect(findManyArg.where.id.in.sort()).toEqual(['B', 'C']);
      expect(card.mutualFriends.map((f) => f.id).sort()).toEqual(['B', 'C']);
    });

    it('kesişim yoksa mutualFriends boş, user.findMany çağrılmaz', async () => {
      prismaMock.friendship.findMany
        .mockResolvedValueOnce([{ requesterId: CALLER, addresseeId: 'A' }])
        .mockResolvedValueOnce([{ requesterId: TARGET, addresseeId: 'D' }]);

      const card = await service.getUserCard(CALLER, TARGET);
      expect(card.mutualFriends).toEqual([]);
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });

    it('mutualGuilds = caller ve target ORTAK üye olduğu guild (deletedAt null)', async () => {
      prismaMock.guild.findMany.mockResolvedValue([
        { id: 'g1', name: 'Ortam 1', iconUrl: null },
        { id: 'g2', name: 'Ortam 2', iconUrl: 'i.png' },
      ]);
      const card = await service.getUserCard(CALLER, TARGET);

      const guildArg = prismaMock.guild.findMany.mock.calls[0][0];
      expect(guildArg.where.deletedAt).toBeNull();
      expect(guildArg.where.members.some.userId).toBe(CALLER);
      expect(guildArg.where.AND[0].members.some.userId).toBe(TARGET);
      expect(card.mutualGuilds).toEqual([
        { id: 'g1', name: 'Ortam 1', iconUrl: null },
        { id: 'g2', name: 'Ortam 2', iconUrl: 'i.png' },
      ]);
    });
  });
});

// ── C8: Avatar/Profil-afişi (self) — presign + set ──────────────────────────

const USER_FIXTURE_BASE = {
  id: 'u1',
  username: 'kanka',
  email: 'k@x.tr',
  avatarUrl: null,
  bannerUrl: null,
  bio: null,
  bannerColor: null,
  dmPolicy: 'FRIENDS',
  isMinor: false,
  verificationStatus: 'NONE',
  createdAt: CREATED_AT,
  emailVerifiedAt: null,
  twoFactorEnabled: false,
  isModerator: false,
  friendCode: 'ABC123',
};

describe('UsersService.presignAvatar / presignBanner', () => {
  let service: UsersService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    // C8-fix: profil görselleri public bucket'a → presignPutPublic
    storageMock.presignPutPublic.mockResolvedValue('https://minio/presigned-put-url');
  });

  it('desteklenmeyen contentType (gif) → BadRequestException UNSUPPORTED_TYPE', async () => {
    await expect(service.presignAvatar('u1', 'image/gif')).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'UNSUPPORTED_TYPE' }),
    });
    expect(storageMock.presignPutPublic).not.toHaveBeenCalled();
  });

  it('UPLOADS_ENABLED=false → ForbiddenException UPLOADS_DISABLED', async () => {
    configMock.get.mockImplementation((key: string) =>
      key === 'uploadsEnabled' ? false : 'http://localhost:9000/kankaverse',
    );

    await expect(service.presignAvatar('u1', 'image/png')).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'UPLOADS_DISABLED' }),
    });
    expect(storageMock.presignPutPublic).not.toHaveBeenCalled();
  });

  it('geçerli istek → storageKey avatars/${userId}/ prefix taşır', async () => {
    const result = await service.presignAvatar('u1', 'image/png');
    expect(result.storageKey.startsWith('avatars/u1/')).toBe(true);
    expect(result.uploadUrl).toBe('https://minio/presigned-put-url');
  });

  it('profil afişi: geçerli istek → storageKey banners/${userId}/ prefix taşır', async () => {
    const result = await service.presignBanner('u1', 'image/webp');
    expect(result.storageKey.startsWith('banners/u1/')).toBe(true);
  });

  it('profil afişi: UPLOADS_ENABLED=false → ForbiddenException UPLOADS_DISABLED', async () => {
    configMock.get.mockImplementation((key: string) =>
      key === 'uploadsEnabled' ? false : 'http://localhost:9000/kankaverse',
    );

    await expect(service.presignBanner('u1', 'image/png')).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'UPLOADS_DISABLED' }),
    });
  });
});

describe('UsersService.setAvatar / setBanner', () => {
  let service: UsersService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('yanlış prefix (başka kullanıcının anahtarı) → BadRequestException INVALID_STORAGE_KEY', async () => {
    await expect(
      service.setAvatar('u1', { storageKey: 'avatars/other-user/abc.png' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'INVALID_STORAGE_KEY' }),
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('UPLOADS_ENABLED=false iken storageKey ile avatar SET → ForbiddenException UPLOADS_DISABLED (D14 savunma-derinliği)', async () => {
    configMock.get.mockImplementation((key: string) =>
      key === 'uploadsEnabled' ? false : 'http://localhost:9000/kankaverse',
    );

    await expect(
      service.setAvatar('u1', { storageKey: 'avatars/u1/abc.png' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'UPLOADS_DISABLED' }),
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('UPLOADS_ENABLED=false iken storageKey null → avatar KALDIRMA yine çalışır (kapı yalnız set yolunda)', async () => {
    configMock.get.mockImplementation((key: string) =>
      key === 'uploadsEnabled' ? false : 'http://localhost:9000/kankaverse',
    );
    prismaMock.user.update.mockResolvedValue({ ...USER_FIXTURE_BASE, avatarUrl: null });

    const result = await service.setAvatar('u1', { storageKey: null });
    expect(result.avatarUrl).toBeNull();
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { avatarUrl: null, avatarAnimatedUrl: null },
    });
  });

  it('geçerli storageKey → avatarUrl publicUrl + "/" + storageKey olarak kaydedilir', async () => {
    const storageKey = 'avatars/u1/550e8400.png';
    const expectedUrl = `http://localhost:9000/kankaverse/${storageKey}`;
    prismaMock.user.update.mockResolvedValue({ ...USER_FIXTURE_BASE, avatarUrl: expectedUrl });

    const result = await service.setAvatar('u1', { storageKey });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { avatarUrl: expectedUrl, avatarAnimatedUrl: null },
    });
    expect(result.avatarUrl).toBe(expectedUrl);
  });

  it('storageKey null → avatarUrl null olarak güncellenir (avatar kaldırma)', async () => {
    prismaMock.user.update.mockResolvedValue({ ...USER_FIXTURE_BASE, avatarUrl: null });

    const result = await service.setAvatar('u1', { storageKey: null });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { avatarUrl: null, avatarAnimatedUrl: null },
    });
    expect(result.avatarUrl).toBeNull();
  });

  // ── Profil afişi (banner) — aynı desen, ayrı alan ──────────────────────────

  it('profil afişi: yanlış prefix → BadRequestException INVALID_STORAGE_KEY', async () => {
    await expect(
      service.setBanner('u1', { storageKey: 'banners/other-user/abc.png' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'INVALID_STORAGE_KEY' }),
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('profil afişi: geçerli storageKey → bannerUrl doğru kaydedilir', async () => {
    const storageKey = 'banners/u1/550e8400.png';
    const expectedUrl = `http://localhost:9000/kankaverse/${storageKey}`;
    prismaMock.user.update.mockResolvedValue({ ...USER_FIXTURE_BASE, bannerUrl: expectedUrl });

    const result = await service.setBanner('u1', { storageKey });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { bannerUrl: expectedUrl, bannerAnimatedUrl: null },
    });
    expect(result.bannerUrl).toBe(expectedUrl);
  });

  it('profil afişi: storageKey null → bannerUrl null olarak güncellenir (kaldırma)', async () => {
    prismaMock.user.update.mockResolvedValue({ ...USER_FIXTURE_BASE, bannerUrl: null });

    const result = await service.setBanner('u1', { storageKey: null });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { bannerUrl: null, bannerAnimatedUrl: null },
    });
    expect(result.bannerUrl).toBeNull();
  });
});
