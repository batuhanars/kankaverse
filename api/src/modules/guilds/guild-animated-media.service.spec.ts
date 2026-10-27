import { ForbiddenException } from '@nestjs/common';
import { GuildAnimatedMediaService } from './guild-animated-media.service';

const GUILD = {
  id: 'g1',
  name: 'G',
  ownerId: 'owner',
  adultsOnly: false,
  iconUrl: 'http://cdn/icons/g1/a-still.webp',
  iconAnimatedUrl: 'http://cdn/icons/g1/a.webp',
  bannerUrl: null,
  bannerAnimatedUrl: null,
  description: null,
  discoverable: false,
  tags: [],
  bannerColor: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('GuildAnimatedMediaService (C19)', () => {
  const guilds = { requireOwner: jest.fn() };
  const animated = { presign: jest.fn(), process: jest.fn() };
  const service = new GuildAnimatedMediaService(guilds as any, animated as any);

  beforeEach(() => jest.resetAllMocks());

  it('OWNER değil → 403, işleme hattına HİÇ girilmez (presign ve process)', async () => {
    guilds.requireOwner.mockRejectedValue(new ForbiddenException({ error: 'FORBIDDEN' }));
    await expect(
      service.presign('u', 'g1', { contentType: 'image/gif', size: 10 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.process('u', 'g1', 'GUILD_ICON', { stagingKey: 'k' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(animated.presign).not.toHaveBeenCalled();
    expect(animated.process).not.toHaveBeenCalled();
  });

  it('presign: staging sahibi guildId, kapı kullanıcıya göre', async () => {
    guilds.requireOwner.mockResolvedValue(undefined);
    animated.presign.mockResolvedValue({ uploadUrl: 'u', stagingKey: 'k' });
    await service.presign('owner', 'g1', { contentType: 'video/mp4', size: 99 });
    expect(animated.presign).toHaveBeenCalledWith('g1', 'video/mp4', 99, 'owner');
  });

  it('process: hedef + sahip guildId ile çağrılır, GuildDto döner (her iki alan)', async () => {
    guilds.requireOwner.mockResolvedValue(undefined);
    animated.process.mockResolvedValue(GUILD);
    const dto = await service.process('owner', 'g1', 'GUILD_ICON', { stagingKey: 'k' });
    expect(animated.process).toHaveBeenCalledWith('g1', 'GUILD_ICON', { stagingKey: 'k' }, 'owner');
    expect(dto.iconUrl).toBe(GUILD.iconUrl);
    expect(dto.iconAnimatedUrl).toBe(GUILD.iconAnimatedUrl);
    expect(dto.bannerAnimatedUrl).toBeNull();
  });
});
