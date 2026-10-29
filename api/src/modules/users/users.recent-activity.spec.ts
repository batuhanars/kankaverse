import { ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';

// C31f — son etkinlik: ayar ucu (minör kapısı, silme) ve görünürlük ucu.

const prismaMock = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  recentGame: { deleteMany: jest.fn(), findMany: jest.fn() },
};
const presenceMock = {
  clearGames: jest.fn(),
  broadcastActivity: jest.fn(),
  canSeeActivity: jest.fn(),
};

function makeService() {
  return new UsersService(
    prismaMock as any,
    {} as any,
    {} as any,
    {} as any,
    { canCreateAnimated: () => false } as any,
    { get: () => undefined } as any,
    presenceMock as any,
  );
}

const userRow = {
  id: 'u1',
  username: 'kanka',
  email: 'k@x.tr',
  avatarUrl: null,
  bio: null,
  dmPolicy: 'EVERYONE',
  isMinor: false,
  showRecentActivity: false,
  quickReactions: [],
  verificationStatus: 'NONE',
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
  emailVerifiedAt: null,
  twoFactorEnabled: false,
  isModerator: false,
  friendCode: 'ABC123',
};

describe('UsersService.updateProfile (showRecentActivity)', () => {
  let service: UsersService;
  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.user.update.mockResolvedValue(userRow);
    prismaMock.recentGame.deleteMany.mockResolvedValue({ count: 0 });
    service = makeService();
  });

  it('minör ayarı true yapamaz (403) ve hiçbir şey yazılmaz', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: true });
    await expect(service.updateProfile('u1', { showRecentActivity: true })).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('yetişkin ayarı açabilir', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false });
    await service.updateProfile('u1', { showRecentActivity: true });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { showRecentActivity: true },
    });
    expect(prismaMock.recentGame.deleteMany).not.toHaveBeenCalled();
  });

  it('ayar kapanınca tüm satırlar hemen silinir', async () => {
    await service.updateProfile('u1', { showRecentActivity: false });
    expect(prismaMock.recentGame.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('oyun paylaşımı kapanınca da satırlar silinir', async () => {
    await service.updateProfile('u1', { showGameActivity: false });
    expect(prismaMock.recentGame.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});

describe('UsersService.getRecentActivity', () => {
  let service: UsersService;
  const row = {
    lastPlayedAt: new Date('2026-10-29T10:00:00.000Z'),
    game: { id: 'g1', name: 'Oyun', iconUrl: null, source: 'STEAM', externalId: '10' },
  };
  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.recentGame.findMany.mockResolvedValue([row]);
    presenceMock.canSeeActivity.mockResolvedValue(true);
    service = makeService();
  });

  it('ayar açık + canSeeActivity → liste; gizli oyun ve 7 gün süzgeci sorguda', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ showRecentActivity: true, isMinor: false });
    const res = await service.getRecentActivity('v', 't');
    expect(res).toEqual([
      {
        game: {
          id: 'g1',
          name: 'Oyun',
          iconUrl: null,
          storeUrl: 'https://store.steampowered.com/app/10',
        },
        lastPlayedAt: '2026-10-29T10:00:00.000Z',
      },
    ]);
    const args = prismaMock.recentGame.findMany.mock.calls[0][0];
    expect(args.where.game).toEqual({ hidden: false });
    expect(args.where.lastPlayedAt.gte).toBeInstanceOf(Date);
    expect(args.take).toBe(10);
  });

  it('hedefin ayarı kapalıysa boş dizi, sorgu bile yapılmaz', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ showRecentActivity: false, isMinor: false });
    expect(await service.getRecentActivity('v', 't')).toEqual([]);
    expect(prismaMock.recentGame.findMany).not.toHaveBeenCalled();
  });

  it('canSeeActivity false (engelli, ortak ortam yok, oyun ayarı kapalı) → boş dizi', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ showRecentActivity: true, isMinor: false });
    presenceMock.canSeeActivity.mockResolvedValue(false);
    expect(await service.getRecentActivity('v', 't')).toEqual([]);
    expect(prismaMock.recentGame.findMany).not.toHaveBeenCalled();
  });

  it('minör hedef asla liste döndürmez', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ showRecentActivity: true, isMinor: true });
    expect(await service.getRecentActivity('v', 't')).toEqual([]);
  });
});
