import { E2eeNotifyService } from './e2ee-notify.service';

describe('E2eeNotifyService.devicesChanged (E2 §2.4)', () => {
  it('1-1 DM ve GROUP_DM kanallarını kapsar; yalnız grubu kurulmuş kanalların odasına yayar', async () => {
    const prisma = {
      channelMember: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ channelId: 'dm1' }, { channelId: 'g1' }, { channelId: 'g2' }]),
      },
      e2eeGroup: {
        findMany: jest.fn().mockResolvedValue([{ channelId: 'dm1' }, { channelId: 'g1' }]),
      },
    };
    const realtime = { emitToRoom: jest.fn() };
    const svc = new E2eeNotifyService(prisma as never, realtime as never);

    await svc.devicesChanged('u1');

    expect(prisma.channelMember.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      channel: { type: { in: ['DM', 'GROUP_DM'] }, guildId: null, deletedAt: null },
    });
    expect(realtime.emitToRoom.mock.calls).toEqual([
      ['dm1', 'e2ee:devices-changed', { channelId: 'dm1', userId: 'u1' }],
      ['g1', 'e2ee:devices-changed', { channelId: 'g1', userId: 'u1' }],
    ]);
  });
});
