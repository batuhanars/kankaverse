import { MessagesGateway } from './messages.gateway';

/** E2 §2.5: şifreli mesajın message.updated yayını, GROUP_DM'de katılım öncesi üyelere ulaşmaz. */
const MSG_AT = '2026-11-10T12:00:00.000Z';

function setup(type: string | null, members: string[] = []) {
  const prisma = {
    channel: { findUnique: jest.fn().mockResolvedValue(type ? { type } : null) },
    channelMember: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }: { where: { createdAt: { lte: Date } } }) => {
          expect(where.createdAt.lte).toEqual(new Date(MSG_AT));
          return Promise.resolve(members.map((userId) => ({ userId })));
        }),
    },
  };
  const gateway = new MessagesGateway(
    {} as never,
    {} as never,
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const targets: string[] = [];
  const emit = jest.fn();
  (gateway as unknown as { server: unknown }).server = {
    to: (t: string) => {
      targets.push(t);
      return { emit };
    },
  };
  return { gateway, prisma, targets, emit };
}

const encDto = { id: 'm1', encrypted: true, ciphertext: 'AAAA', createdAt: MSG_AT };

describe('MessagesGateway.broadcastMessageUpdate (E2 §2.5)', () => {
  it('GROUP_DM + şifreli: yalnız mesaj anında üye olanların kişisel odasına; yeni üye ve oda almaz', async () => {
    const { gateway, targets, emit } = setup('GROUP_DM', ['old1', 'old2']);
    await gateway.broadcastMessageUpdate('g1', encDto);
    expect(targets).toEqual(['user:old1', 'user:old2']);
    expect(emit).toHaveBeenCalledWith('message.updated', encDto);
    expect(targets).not.toContain('room:g1');
  });

  it('GROUP_DM + şifresiz: oda yayını (bugünkü gibi), üyelik sorgusu yok', async () => {
    const { gateway, prisma, targets } = setup('GROUP_DM');
    await gateway.broadcastMessageUpdate('g1', { id: 'm1', content: 'x', createdAt: MSG_AT });
    expect(targets).toEqual(['room:g1']);
    expect(prisma.channelMember.findMany).not.toHaveBeenCalled();
  });

  it('1-1 DM + şifreli: oda yayını (değişmez)', async () => {
    const { gateway, targets } = setup('DM');
    await gateway.broadcastMessageUpdate('d1', encDto);
    expect(targets).toEqual(['room:d1']);
  });
});
