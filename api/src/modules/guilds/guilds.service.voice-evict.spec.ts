import { GuildsService } from './guilds.service';

/** C62 §2.3.d: ortamdan atma/yasaklama/ayrılma sonrası kullanıcı ortamın TÜM ses odalarından düşürülür. */
const GUILD = 'guild-1';
const ACTOR = 'actor-1';
const TARGET = 'target-1';

function setup() {
  const prisma = {
    guildMember: {
      findUnique: jest.fn().mockResolvedValue({ id: 'gm-t', role: 'MEMBER' }),
      findMany: jest.fn().mockResolvedValue([{ userId: ACTOR }, { userId: TARGET }]),
      delete: jest.fn().mockReturnValue('gm-delete'),
    },
    channel: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }: { where: { type?: string } }) =>
          Promise.resolve(
            where.type === 'GUILD_VOICE'
              ? [{ id: 'v1' }, { id: 'v2' }]
              : [{ id: 'v1' }, { id: 't1' }],
          ),
        ),
    },
    channelMember: { deleteMany: jest.fn().mockReturnValue('cm-delete') },
    guildBan: { upsert: jest.fn().mockReturnValue('ban') },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const membership = {
    requireGuildMembership: jest.fn().mockResolvedValue({ membership: { role: 'MEMBER' } }),
  };
  const permissions = {
    hasGuildPermission: jest.fn().mockResolvedValue(true),
    requireMemberHierarchy: jest.fn().mockResolvedValue(undefined),
  };
  const realtime = { emitToUsers: jest.fn() };
  const voice = { evictFromRooms: jest.fn().mockResolvedValue(undefined) };
  const service = new GuildsService(
    prisma as never,
    membership as never,
    permissions as never,
    {} as never,
    {} as never,
    realtime as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    voice as never,
  );
  return { prisma, voice, service };
}

describe('GuildsService: ses odasından düşürme (C62 §2.3.d)', () => {
  it('kickMember: hedef ortamın silinmemiş GUILD_VOICE kanallarından düşürülür (metin kanalı değil)', async () => {
    const { prisma, voice, service } = setup();
    await service.kickMember(ACTOR, GUILD, TARGET);
    expect(prisma.channel.findMany).toHaveBeenCalledWith({
      where: { guildId: GUILD, type: 'GUILD_VOICE', deletedAt: null },
      select: { id: true },
    });
    expect(voice.evictFromRooms).toHaveBeenCalledWith(TARGET, ['v1', 'v2']);
  });

  it('banMember: yasaklanan düşürülür', async () => {
    const { voice, service } = setup();
    await service.banMember(ACTOR, GUILD, TARGET);
    expect(voice.evictFromRooms).toHaveBeenCalledWith(TARGET, ['v1', 'v2']);
  });

  it('leaveGuild: ayrılan kendisi düşürülür', async () => {
    const { voice, service } = setup();
    await service.leaveGuild(TARGET, GUILD);
    expect(voice.evictFromRooms).toHaveBeenCalledWith(TARGET, ['v1', 'v2']);
  });

  it('düşürme commit SONRASI: transaction bitmeden çağrılmaz', async () => {
    const { prisma, voice, service } = setup();
    prisma.$transaction.mockImplementation(() => {
      expect(voice.evictFromRooms).not.toHaveBeenCalled();
      return Promise.resolve([]);
    });
    await service.kickMember(ACTOR, GUILD, TARGET);
    expect(voice.evictFromRooms).toHaveBeenCalledTimes(1);
  });

  it('düşürme hata verse de atma işlemi başarıyla döner (best-effort)', async () => {
    const { voice, service } = setup();
    voice.evictFromRooms.mockRejectedValue(new Error('livekit down'));
    await expect(service.kickMember(ACTOR, GUILD, TARGET)).resolves.toBeNull();
  });

  it('üye olmayan hedef: düşürme çağrılmaz', async () => {
    const { prisma, voice, service } = setup();
    prisma.guildMember.findUnique.mockResolvedValue(null);
    await expect(service.kickMember(ACTOR, GUILD, TARGET)).rejects.toBeDefined();
    expect(voice.evictFromRooms).not.toHaveBeenCalled();
  });
});
