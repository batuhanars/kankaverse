import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MembershipService } from './membership.service';

// ── Mock PrismaService ───────────────────────────────────────────────────────
const prismaMock = {
  guild: { findUnique: jest.fn() },
  guildMember: { findUnique: jest.fn() },
  channel: { findUnique: jest.fn() },
  channelMember: { findUnique: jest.fn(), findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  userBlock: { findFirst: jest.fn() },
  groupDmDeparture: { findUnique: jest.fn() },
};

// R20 — özel kanal kapısında "yönetici mi" sorusu artık PermissionsService.hasFullAccess'e
// devredilir (eskiden membership.role === 'OWNER' || membership.role === 'ADMIN' idi).
const permissionsMock = {
  hasFullAccess: jest.fn().mockResolvedValue(false),
};

function makeService() {
  return new MembershipService(prismaMock as any, permissionsMock as any);
}

function resetMocks() {
  jest.resetAllMocks();
  permissionsMock.hasFullAccess.mockResolvedValue(false);
}

// ── Sabit fixtures ───────────────────────────────────────────────────────────
const GUILD = { id: 'guild1', deletedAt: null, adultsOnly: false };
const MEMBERSHIP = { guildId: 'guild1', userId: 'user1', role: 'MEMBER' };
const ADULT_USER = { id: 'user1', isMinor: false };
const MINOR_USER = { id: 'minor1', isMinor: true };

// Kanallar: channel.findUnique artık guild'i include ederek döner (Sprint 7A)
const GUILD_CHANNEL = {
  id: 'ch1',
  guildId: 'guild1',
  ageGated: false,
  isPrivate: false,
  deletedAt: null,
  guild: GUILD,
};
const DM_CHANNEL = {
  id: 'dm1',
  guildId: null,
  ageGated: false,
  isPrivate: false,
  deletedAt: null,
  guild: null,
};
const AGE_GATED_CHANNEL = {
  id: 'ch-adult',
  guildId: 'guild1',
  ageGated: true,
  isPrivate: false,
  deletedAt: null,
  guild: GUILD,
};
// adultsOnly guild kanalı (Sprint 7A §4 erişim-zamanı enforcement)
const ADULTS_ONLY_GUILD = { id: 'guild2', deletedAt: null, adultsOnly: true };
const ADULTS_ONLY_CHANNEL = {
  id: 'ch-ao',
  guildId: 'guild2',
  ageGated: false,
  isPrivate: false,
  deletedAt: null,
  guild: ADULTS_ONLY_GUILD,
};
// Özel kanal (Sprint V2 B — R7)
const PRIVATE_CHANNEL = {
  id: 'ch-priv',
  guildId: 'guild1',
  ageGated: false,
  isPrivate: true,
  deletedAt: null,
  guild: GUILD,
};
const PRIVATE_AGE_GATED_CHANNEL = {
  id: 'ch-priv-adult',
  guildId: 'guild1',
  ageGated: true,
  isPrivate: true,
  deletedAt: null,
  guild: GUILD,
};
const OWNER_MEMBERSHIP = { guildId: 'guild1', userId: 'owner1', role: 'OWNER' };

// ── requireGuildMembership ───────────────────────────────────────────────────
describe('MembershipService.requireGuildMembership', () => {
  let service: MembershipService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('guild yok → NotFoundException GUILD_NOT_FOUND fırlatır', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(null);

    await expect(service.requireGuildMembership('user1', 'ghost-guild')).rejects.toThrow(
      NotFoundException,
    );

    await expect(service.requireGuildMembership('user1', 'ghost-guild')).rejects.toMatchObject({
      response: { error: 'GUILD_NOT_FOUND' },
    });
  });

  it('guild var ama üye değil → ForbiddenException FORBIDDEN fırlatır', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD);
    prismaMock.guildMember.findUnique.mockResolvedValue(null);

    await expect(service.requireGuildMembership('user1', GUILD.id)).rejects.toThrow(
      ForbiddenException,
    );

    await expect(service.requireGuildMembership('user1', GUILD.id)).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
  });

  it('guild var + üye → { guild, membership } döner', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD);
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBERSHIP);

    const result = await service.requireGuildMembership('user1', GUILD.id);

    expect(result).toEqual({ guild: GUILD, membership: MEMBERSHIP });
  });
});

// ── requireChannelAccess ─────────────────────────────────────────────────────
describe('MembershipService.requireChannelAccess', () => {
  let service: MembershipService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  // Kanal bulunamadı
  it('kanal yok (deletedAt filtresi) → NotFoundException CHANNEL_NOT_FOUND fırlatır', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(null);

    await expect(service.requireChannelAccess('user1', 'ghost-ch')).rejects.toThrow(
      NotFoundException,
    );

    await expect(service.requireChannelAccess('user1', 'ghost-ch')).rejects.toMatchObject({
      response: { error: 'CHANNEL_NOT_FOUND' },
    });
  });

  // Yaş-kapısı guard — Sprint 4A §7 (KRİTİK)
  describe('ageGated kanal', () => {
    it('ageGated kanal + isMinor kullanıcı → ForbiddenException AGE_RESTRICTED fırlatır', async () => {
      prismaMock.channel.findUnique.mockResolvedValue(AGE_GATED_CHANNEL);
      prismaMock.user.findUnique.mockResolvedValue({ isMinor: true });

      await expect(
        service.requireChannelAccess(MINOR_USER.id, AGE_GATED_CHANNEL.id),
      ).rejects.toThrow(ForbiddenException);

      prismaMock.channel.findUnique.mockResolvedValue(AGE_GATED_CHANNEL);
      prismaMock.user.findUnique.mockResolvedValue({ isMinor: true });
      await expect(
        service.requireChannelAccess(MINOR_USER.id, AGE_GATED_CHANNEL.id),
      ).rejects.toMatchObject({
        response: { error: 'AGE_RESTRICTED' },
      });
    });

    it('ageGated kanal + yetişkin kullanıcı → guild üyelik kontrolüne düşer; üye ise geçer', async () => {
      prismaMock.channel.findUnique.mockResolvedValue(AGE_GATED_CHANNEL);
      prismaMock.user.findUnique.mockResolvedValue({ isMinor: false });
      prismaMock.guildMember.findUnique.mockResolvedValue(MEMBERSHIP);

      const result = await service.requireChannelAccess(ADULT_USER.id, AGE_GATED_CHANNEL.id);
      expect(result).toMatchObject({ id: AGE_GATED_CHANNEL.id });
    });

    it('ageGated kanal + yetişkin + guild üyesi değil → NOT_CHANNEL_MEMBER fırlatır', async () => {
      prismaMock.channel.findUnique.mockResolvedValue(AGE_GATED_CHANNEL);
      prismaMock.user.findUnique.mockResolvedValue({ isMinor: false });
      prismaMock.guildMember.findUnique.mockResolvedValue(null);

      await expect(
        service.requireChannelAccess(ADULT_USER.id, AGE_GATED_CHANNEL.id),
      ).rejects.toMatchObject({ response: { error: 'NOT_CHANNEL_MEMBER' } });
    });
  });

  // adultsOnly guild-seviyesi erişim kapısı — Sprint 7A §4 (KRİTİK)
  describe('adultsOnly guild kanalı (Sprint 7A §4 — savunma derinliği)', () => {
    it('adultsOnly guild kanalı + minör → AGE_RESTRICTED fırlatır', async () => {
      prismaMock.channel.findUnique.mockResolvedValue(ADULTS_ONLY_CHANNEL);
      prismaMock.user.findUnique.mockResolvedValue({ isMinor: true });

      await expect(
        service.requireChannelAccess(MINOR_USER.id, ADULTS_ONLY_CHANNEL.id),
      ).rejects.toMatchObject({ response: { error: 'AGE_RESTRICTED' } });
    });

    it('adultsOnly guild kanalı + yetişkin + üye → geçer', async () => {
      prismaMock.channel.findUnique.mockResolvedValue(ADULTS_ONLY_CHANNEL);
      prismaMock.user.findUnique.mockResolvedValue({ isMinor: false });
      prismaMock.guildMember.findUnique.mockResolvedValue({
        guildId: 'guild2',
        userId: 'adult1',
        role: 'MEMBER',
      });

      const result = await service.requireChannelAccess('adult1', ADULTS_ONLY_CHANNEL.id);
      expect(result).toMatchObject({ id: ADULTS_ONLY_CHANNEL.id });
    });

    it('adultsOnly guild kanalı + minör → tek isMinor sorgusu yapılır (DRY)', async () => {
      prismaMock.channel.findUnique.mockResolvedValue(ADULTS_ONLY_CHANNEL);
      prismaMock.user.findUnique.mockResolvedValue({ isMinor: true });

      await expect(
        service.requireChannelAccess(MINOR_USER.id, ADULTS_ONLY_CHANNEL.id),
      ).rejects.toThrow(ForbiddenException);

      // user.findUnique yalnız BİR kez çağrılmalı (hem ageGated hem adultsOnly tek sorgu — DRY)
      expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
    });

    it('non-adultsOnly guild kanalı (ageGated=false) → isMinor sorgusu yapılmaz', async () => {
      prismaMock.channel.findUnique.mockResolvedValue(GUILD_CHANNEL); // adultsOnly=false
      prismaMock.guildMember.findUnique.mockResolvedValue(MEMBERSHIP);

      await service.requireChannelAccess(ADULT_USER.id, GUILD_CHANNEL.id);

      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it("DM kanalı adultsOnly'den etkilenmez", async () => {
      prismaMock.channel.findUnique.mockResolvedValue(DM_CHANNEL);
      prismaMock.channelMember.findUnique.mockResolvedValue({
        channelId: 'dm1',
        userId: MINOR_USER.id,
      });

      // Minör DM kanalına girebilir (adultsOnly guild kanalı değil)
      const result = await service.requireChannelAccess(MINOR_USER.id, DM_CHANNEL.id);
      expect(result).toMatchObject({ id: DM_CHANNEL.id });
    });
  });

  // Guild kanalı erişim
  describe('Guild kanalı', () => {
    it('guild kanalı + guild üyesi → kanalı döner', async () => {
      prismaMock.channel.findUnique.mockResolvedValue(GUILD_CHANNEL);
      prismaMock.guildMember.findUnique.mockResolvedValue(MEMBERSHIP);

      const result = await service.requireChannelAccess('user1', GUILD_CHANNEL.id);

      expect(result).toMatchObject({ id: GUILD_CHANNEL.id, guildId: 'guild1' });
    });

    it('guild kanalı + guild üyesi değil → ForbiddenException NOT_CHANNEL_MEMBER fırlatır', async () => {
      prismaMock.channel.findUnique.mockResolvedValue(GUILD_CHANNEL);
      prismaMock.guildMember.findUnique.mockResolvedValue(null);

      await expect(service.requireChannelAccess('user1', GUILD_CHANNEL.id)).rejects.toThrow(
        ForbiddenException,
      );

      await expect(service.requireChannelAccess('user1', GUILD_CHANNEL.id)).rejects.toMatchObject({
        response: { error: 'NOT_CHANNEL_MEMBER' },
      });
    });
  });

  // DM kanalı — R7 Sprint 3 açık kapanışı
  describe('DM kanalı (guildId null) — R7 güvenlik açığı kapanışı', () => {
    it('DM kanalı + ChannelMember kaydı var → kanalı döner', async () => {
      prismaMock.channel.findUnique.mockResolvedValue(DM_CHANNEL);
      prismaMock.channelMember.findUnique.mockResolvedValue({ channelId: 'dm1', userId: 'user1' });

      const result = await service.requireChannelAccess('user1', DM_CHANNEL.id);

      expect(result).toMatchObject({ id: DM_CHANNEL.id, guildId: null });
    });

    it('DM kanalı + ChannelMember kaydı YOK → ForbiddenException NOT_CHANNEL_MEMBER fırlatır', async () => {
      prismaMock.channel.findUnique.mockResolvedValue(DM_CHANNEL);
      prismaMock.channelMember.findUnique.mockResolvedValue(null);

      await expect(service.requireChannelAccess('user1', DM_CHANNEL.id)).rejects.toThrow(
        ForbiddenException,
      );

      await expect(service.requireChannelAccess('user1', DM_CHANNEL.id)).rejects.toMatchObject({
        response: { error: 'NOT_CHANNEL_MEMBER' },
      });
    });

    it('DM kanalı + guildMember.findUnique hiç çağrılmamalı (DM path)', async () => {
      prismaMock.channel.findUnique.mockResolvedValue(DM_CHANNEL);
      prismaMock.channelMember.findUnique.mockResolvedValue({ channelId: 'dm1', userId: 'user1' });

      await service.requireChannelAccess('user1', DM_CHANNEL.id);

      expect(prismaMock.guildMember.findUnique).not.toHaveBeenCalled();
    });
  });
});

// ── requireNoDmBlock ─────────────────────────────────────────────────────────
describe('MembershipService.requireNoDmBlock — G3 blok-obfuscation', () => {
  let service: MembershipService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('karşı taraf yok (otherMember null) → sessiz return, exception yok', async () => {
    prismaMock.channelMember.findFirst.mockResolvedValue(null);

    await expect(service.requireNoDmBlock('user1', 'dm1')).resolves.toBeUndefined();
    expect(prismaMock.userBlock.findFirst).not.toHaveBeenCalled();
  });

  it('blok sender→other → ForbiddenException DM_NOT_ALLOWED fırlatır (BLOCKED sızdırmaz)', async () => {
    prismaMock.channelMember.findFirst.mockResolvedValue({ userId: 'user2' });
    prismaMock.userBlock.findFirst.mockResolvedValue({
      id: 'blk1',
      blockerId: 'user1',
      blockedId: 'user2',
    });

    await expect(service.requireNoDmBlock('user1', 'dm1')).rejects.toThrow(ForbiddenException);

    await expect(service.requireNoDmBlock('user1', 'dm1')).rejects.toMatchObject({
      response: { error: 'DM_NOT_ALLOWED' },
    });
  });

  it('blok other→sender → ForbiddenException DM_NOT_ALLOWED fırlatır (BLOCKED sızdırmaz)', async () => {
    prismaMock.channelMember.findFirst.mockResolvedValue({ userId: 'user2' });
    prismaMock.userBlock.findFirst.mockResolvedValue({
      id: 'blk2',
      blockerId: 'user2',
      blockedId: 'user1',
    });

    await expect(service.requireNoDmBlock('user1', 'dm1')).rejects.toThrow(ForbiddenException);

    await expect(service.requireNoDmBlock('user1', 'dm1')).rejects.toMatchObject({
      response: { error: 'DM_NOT_ALLOWED' },
    });
  });

  it('blok yok → sessiz return, exception yok', async () => {
    prismaMock.channelMember.findFirst.mockResolvedValue({ userId: 'user2' });
    prismaMock.userBlock.findFirst.mockResolvedValue(null);

    await expect(service.requireNoDmBlock('user1', 'dm1')).resolves.toBeUndefined();
  });

  // G3 kritik: error kodu BLOCKED OLMAMALI
  it('G3 kontrol: fırlatılan hata kodu BLOCKED DEĞİL, DM_NOT_ALLOWED olmalı', async () => {
    prismaMock.channelMember.findFirst.mockResolvedValue({ userId: 'user2' });
    prismaMock.userBlock.findFirst.mockResolvedValue({ id: 'blk3' });

    let caughtError: any;
    try {
      await service.requireNoDmBlock('user1', 'dm1');
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError.response.error).toBe('DM_NOT_ALLOWED');
    expect(caughtError.response.error).not.toBe('BLOCKED');
  });
});

// ── requireChannelAccess — özel kanal (Sprint V2 B3 R7) ─────────────────────
describe('MembershipService.requireChannelAccess — özel kanal (isPrivate)', () => {
  let service: MembershipService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  // Tam yetkili (OWNER/ADMINISTRATOR) her özel kanala erişir — R20: PermissionsService.hasFullAccess
  it('özel kanal + OWNER → erişim verilir (ChannelMember kontrolü yapılmaz)', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(PRIVATE_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);
    permissionsMock.hasFullAccess.mockResolvedValue(true);

    const result = await service.requireChannelAccess('owner1', PRIVATE_CHANNEL.id);
    expect(result).toMatchObject({ id: PRIVATE_CHANNEL.id });
    // ChannelMember sorgusu yapılmamalı (OWNER ayrıcalığı)
    expect(prismaMock.channelMember.findUnique).not.toHaveBeenCalled();
  });

  // R20 §0.1 regresyon kalkanı: enum GuildRole'ü MEMBER olan ama rolüne ADMINISTRATOR bayrağı
  // atanmış bir üye de özel kanala erişebilmeli — enum-ADMIN kısa devresi kalktı, karar
  // PermissionsService.hasFullAccess'e (OWNER veya ADMINISTRATOR) devredildi.
  it('özel kanal + ADMINISTRATOR bayraklı role sahip MEMBER → erişim verilir (ChannelMember kontrolü yapılmaz)', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(PRIVATE_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBERSHIP); // enum role: MEMBER
    permissionsMock.hasFullAccess.mockResolvedValue(true); // ama ADMINISTRATOR bayraklı rolü var

    const result = await service.requireChannelAccess('user1', PRIVATE_CHANNEL.id);
    expect(result).toMatchObject({ id: PRIVATE_CHANNEL.id });
    expect(prismaMock.channelMember.findUnique).not.toHaveBeenCalled();
  });

  // MEMBER + ChannelMember kaydı YOK → 403 NOT_CHANNEL_MEMBER
  it('özel kanal + MEMBER + ChannelMember kaydı yok → ForbiddenException NOT_CHANNEL_MEMBER', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(PRIVATE_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBERSHIP); // role: MEMBER
    prismaMock.channelMember.findUnique.mockResolvedValue(null);

    await expect(service.requireChannelAccess('user1', PRIVATE_CHANNEL.id)).rejects.toMatchObject({
      response: { error: 'NOT_CHANNEL_MEMBER' },
    });
  });

  // MEMBER + ChannelMember kaydı VAR → erişim verilir
  it('özel kanal + MEMBER + ChannelMember kaydı var → erişim verilir', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(PRIVATE_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBERSHIP);
    prismaMock.channelMember.findUnique.mockResolvedValue({
      channelId: PRIVATE_CHANNEL.id,
      userId: 'user1',
    });

    const result = await service.requireChannelAccess('user1', PRIVATE_CHANNEL.id);
    expect(result).toMatchObject({ id: PRIVATE_CHANNEL.id });
  });

  // Genel kanal → ChannelMember kontrolü hiç yapılmaz
  it('genel kanal (isPrivate=false) + MEMBER → ChannelMember sorgusu yapılmaz', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBERSHIP);

    await service.requireChannelAccess('user1', GUILD_CHANNEL.id);

    expect(prismaMock.channelMember.findUnique).not.toHaveBeenCalled();
  });

  // Yaş-kapılı + özel birlikte — yaş kapısı önce, özel kanal sonra
  it('özel + yaş-kapılı kanal + minör → AGE_RESTRICTED fırlatır (yaş kapısı önce)', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(PRIVATE_AGE_GATED_CHANNEL);
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: true });

    await expect(
      service.requireChannelAccess(MINOR_USER.id, PRIVATE_AGE_GATED_CHANNEL.id),
    ).rejects.toMatchObject({ response: { error: 'AGE_RESTRICTED' } });

    // Yaş kapısı önce fırlatıldı; guild/channelMember sorgularına gidilmedi
    expect(prismaMock.guildMember.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.channelMember.findUnique).not.toHaveBeenCalled();
  });

  it('özel + yaş-kapılı kanal + yetişkin MEMBER + ChannelMember var → erişim verilir', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(PRIVATE_AGE_GATED_CHANNEL);
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false });
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBERSHIP);
    prismaMock.channelMember.findUnique.mockResolvedValue({
      channelId: PRIVATE_AGE_GATED_CHANNEL.id,
      userId: 'user1',
    });

    const result = await service.requireChannelAccess('user1', PRIVATE_AGE_GATED_CHANNEL.id);
    expect(result).toMatchObject({ id: PRIVATE_AGE_GATED_CHANNEL.id });
  });

  it('özel + yaş-kapılı kanal + yetişkin MEMBER + ChannelMember yok → NOT_CHANNEL_MEMBER', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(PRIVATE_AGE_GATED_CHANNEL);
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false });
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBERSHIP);
    prismaMock.channelMember.findUnique.mockResolvedValue(null);

    await expect(
      service.requireChannelAccess('user1', PRIVATE_AGE_GATED_CHANNEL.id),
    ).rejects.toMatchObject({ response: { error: 'NOT_CHANNEL_MEMBER' } });
  });
});

// ── C62: eski grup üyesi — yalnız geçmiş okuma kapısı ─────────────────────────
describe('MembershipService.requireGroupHistoryAccess (C62, R7)', () => {
  const GROUP_CHANNEL = {
    id: 'grp1',
    type: 'GROUP_DM',
    guildId: null,
    ageGated: false,
    deletedAt: null,
    guild: null,
  };
  const DEPARTURE = {
    joinedAt: new Date('2026-11-01T00:00:00Z'),
    leftAt: new Date('2026-11-10T00:00:00Z'),
    clearedAt: null,
  };
  let service: MembershipService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  async function codeOf(p: Promise<unknown>): Promise<string> {
    try {
      await p;
    } catch (e) {
      return ((e as ForbiddenException).getResponse() as { error: string }).error;
    }
    return 'NO_ERROR';
  }

  it('departure satırı olan eski üye: kanal + pencere döner', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(GROUP_CHANNEL);
    prismaMock.groupDmDeparture.findUnique.mockResolvedValue(DEPARTURE);
    const res = await service.requireGroupHistoryAccess('u1', 'grp1');
    expect(res.channel).toBe(GROUP_CHANNEL);
    expect(res.window).toEqual(DEPARTURE);
    expect(prismaMock.groupDmDeparture.findUnique).toHaveBeenCalledWith({
      where: { channelId_userId: { channelId: 'grp1', userId: 'u1' } },
    });
  });

  it('departure satırı yok: bugünkü jenerik 403 NOT_CHANNEL_MEMBER', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(GROUP_CHANNEL);
    prismaMock.groupDmDeparture.findUnique.mockResolvedValue(null);
    expect(await codeOf(service.requireGroupHistoryAccess('stranger', 'grp1'))).toBe(
      'NOT_CHANNEL_MEMBER',
    );
  });

  it('GROUP_DM olmayan kanal (1-1 DM / ortam) departure olsa bile 403, kayıt hiç sorgulanmaz', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ ...GROUP_CHANNEL, type: 'DM' });
    expect(await codeOf(service.requireGroupHistoryAccess('u1', 'grp1'))).toBe('NOT_CHANNEL_MEMBER');
    prismaMock.channel.findUnique.mockResolvedValue({ ...GROUP_CHANNEL, guildId: 'guild1' });
    expect(await codeOf(service.requireGroupHistoryAccess('u1', 'grp1'))).toBe('NOT_CHANNEL_MEMBER');
    expect(prismaMock.groupDmDeparture.findUnique).not.toHaveBeenCalled();
  });

  it('silinmiş/yok kanal: 404 CHANNEL_NOT_FOUND', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(null);
    await expect(service.requireGroupHistoryAccess('u1', 'grp1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('DEĞİŞMEZLİK: requireChannelAccess / requireChannelVisible eski üyeye 403 verir, departure kaydına HİÇ bakmaz', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(GROUP_CHANNEL);
    prismaMock.channelMember.findUnique.mockResolvedValue(null);
    prismaMock.groupDmDeparture.findUnique.mockResolvedValue(DEPARTURE);
    expect(await codeOf(service.requireChannelAccess('u1', 'grp1'))).toBe('NOT_CHANNEL_MEMBER');
    expect(await codeOf(service.requireChannelVisible('u1', 'grp1'))).toBe('NOT_CHANNEL_MEMBER');
    expect(prismaMock.groupDmDeparture.findUnique).not.toHaveBeenCalled();
  });
});
