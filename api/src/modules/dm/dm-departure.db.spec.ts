/**
 * C62 §2 gerçek Postgres'e karşı (departure tx + okuma penceresi + kapıların değişmezliği). Varsayılan KAPALI:
 *   E2EE_DB_TESTS=1 npx jest src/modules/dm/dm-departure.db.spec.ts
 * Yerel geliştirme DB'sine yazar, kendi satırlarını (rastgele ek) temizler.
 */
import 'dotenv/config';
import { randomBytes } from 'crypto';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { MessagesService } from '../messages/messages.service';
import { DmService } from './dm.service';

const run = process.env.E2EE_DB_TESTS === '1' ? describe : describe.skip;

run('C62 grup DM departure gerçek DB', () => {
  const tag = randomBytes(4).toString('hex');
  const prisma = new PrismaService();
  const userIds: string[] = [];
  const channelIds: string[] = [];

  const realtime = { removeUserFromRoom: jest.fn(), emitToUser: jest.fn() };
  const membership = new MembershipService(prisma, { hasFullAccess: jest.fn() } as never);
  const dm = new DmService(prisma, { canDm: jest.fn() } as never, realtime as never);
  const messages = new MessagesService(
    prisma,
    membership,
    {} as never,
    {} as never,
    { get: jest.fn() } as never,
    {} as never,
    {} as never,
  );

  async function makeUser(name: string) {
    const u = await prisma.user.create({
      data: {
        username: `c62_${tag}_${name}`,
        email: `c62_${tag}_${name}@test.invalid`,
        passwordHash: 'x',
        birthDate: new Date('1990-01-01'),
        isMinor: false,
        friendCode: `C${tag}${name}`,
      },
    });
    userIds.push(u.id);
    return u;
  }

  async function makeGroup(name: string, members = 3) {
    const owner = await makeUser(`o${name}`);
    const b = await makeUser(`b${name}`);
    const rest = [owner, b];
    if (members > 2) rest.push(await makeUser(`c${name}`));
    const ch = await prisma.channel.create({
      data: { type: 'GROUP_DM', ownerId: owner.id, name: `g${name}` },
    });
    channelIds.push(ch.id);
    await prisma.channelMember.createMany({
      data: rest.map((u) => ({
        channelId: ch.id,
        userId: u.id,
        createdAt: new Date('2026-11-01T00:00:00Z'),
      })),
    });
    return { ch, owner, b, c: rest[2] };
  }

  const say = (channelId: string, authorId: string, content: string, createdAt: Date) =>
    prisma.message.create({ data: { channelId, authorId, content, createdAt } });

  afterAll(async () => {
    await prisma.groupDmDeparture.deleteMany({ where: { channelId: { in: channelIds } } });
    await prisma.messageReaction.deleteMany({
      where: { message: { channelId: { in: channelIds } } },
    });
    await prisma.message.deleteMany({ where: { channelId: { in: channelIds } } });
    await prisma.channelMember.deleteMany({ where: { channelId: { in: channelIds } } });
    await prisma.channel.deleteMany({ where: { id: { in: channelIds } } });
    await prisma.friendship.deleteMany({
      where: { OR: [{ requesterId: { in: userIds } }, { addresseeId: { in: userIds } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  beforeEach(() => jest.clearAllMocks());

  it('çıkarma: departure (REMOVED, joinedAt, memberIds) + üyelik silme; olay yalnız çıkarılana; eski üye pencereyi okur, sonrasını ASLA', async () => {
    const { ch, owner, b, c } = await makeGroup('1');
    await prisma.channelMember.update({
      where: { channelId_userId: { channelId: ch.id, userId: b.id } },
      data: { clearedAt: new Date('2026-11-02T00:00:00Z') },
    });
    await say(ch.id, owner.id, 'temizlenmis', new Date('2026-11-01T12:00:00Z'));
    await say(ch.id, owner.id, 'once-1', new Date('2026-11-03T00:00:00Z'));
    await say(ch.id, owner.id, 'once-2', new Date('2026-11-04T00:00:00Z'));

    await dm.removeGroupMember(owner.id, ch.id, b.id);
    const dep = await prisma.groupDmDeparture.findUniqueOrThrow({
      where: { channelId_userId: { channelId: ch.id, userId: b.id } },
    });
    expect(dep.reason).toBe('REMOVED');
    expect(dep.joinedAt).toEqual(new Date('2026-11-01T00:00:00Z'));
    expect(dep.clearedAt).toEqual(new Date('2026-11-02T00:00:00Z'));
    expect([...dep.memberIds].sort()).toEqual([owner.id, c.id].sort());
    expect(await prisma.channelMember.count({ where: { channelId: ch.id, userId: b.id } })).toBe(0);
    expect(realtime.emitToUser).toHaveBeenCalledTimes(1);
    expect(realtime.emitToUser.mock.calls[0][0]).toBe(b.id);

    // ayrılmadan SONRA yazılan mesaj (gelecek tarihli de olsa leftAt sonrası)
    await say(ch.id, owner.id, 'sonra', new Date(dep.leftAt.getTime() + 1000));

    const page = await messages.findMessages(b.id, ch.id);
    expect(page.map((m) => m.content).sort()).toEqual(['once-1', 'once-2']);

    // sayfalama: cursor leftAt sonrasındaki mesaja işaret etse bile sonrası dönmez
    const after = await prisma.message.findFirstOrThrow({
      where: { channelId: ch.id, content: 'sonra' },
    });
    const paged = await messages.findMessages(b.id, ch.id, after.id);
    expect(paged.map((m) => m.content).sort()).toEqual(['once-1', 'once-2']);
    expect(paged.map((m) => m.content)).not.toContain('sonra');

    // liste: eski grup departed ile, lastMessage leftAt sonrasını içermez
    const list = await dm.getDmChannels(b.id);
    const item = list.find((x) => x.id === ch.id) as Record<string, any>;
    expect(item.departed).toEqual({ leftAt: dep.leftAt.toISOString(), reason: 'REMOVED' });
    expect(item.lastMessage.content).toBe('once-2');
    expect(item.unread).toBe(false);
    expect(item.members.map((m: { id: string }) => m.id).sort()).toEqual([owner.id, c.id].sort());
  });

  it('kapılar DEĞİŞMEDİ: eski üye requireChannelAccess/markRead/başka üyenin geçmişi → 403; yabancı departure yoksa 403', async () => {
    const { ch, owner, b } = await makeGroup('2');
    const stranger = await makeUser('s2');
    await dm.leaveGroupDm(b.id, ch.id);

    await expect(membership.requireChannelAccess(b.id, ch.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(membership.requireChannelVisible(b.id, ch.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(dm.markRead(b.id, ch.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(messages.findMessages(stranger.id, ch.id)).rejects.toMatchObject({
      status: 403,
    });
    // ayrılan kendi kaydı dışında hiçbir şeye yetkili değil: sahibin departure'ı yok
    await expect(messages.findMessages(owner.id, ch.id)).resolves.toBeDefined();
    expect(
      await prisma.groupDmDeparture.count({ where: { channelId: ch.id, userId: stranger.id } }),
    ).toBe(0);
  });

  it('geri ekleme: departure silinir, normal üye olur (aradaki mesaj katılım öncesi şifreli süzgecine tabi, düz kalır)', async () => {
    const { ch, owner, b } = await makeGroup('3');
    await prisma.friendship.create({
      data: { requesterId: owner.id, addresseeId: b.id, status: 'ACCEPTED' },
    });
    await dm.leaveGroupDm(b.id, ch.id);
    expect(await prisma.groupDmDeparture.count({ where: { channelId: ch.id } })).toBe(1);

    await dm.addGroupMember(owner.id, ch.id, { userId: b.id });
    expect(await prisma.groupDmDeparture.count({ where: { channelId: ch.id } })).toBe(0);
    await expect(membership.requireChannelAccess(b.id, ch.id)).resolves.toBeDefined();
    const list = await dm.getDmChannels(b.id);
    expect((list.find((x) => x.id === ch.id) as Record<string, unknown>).departed).toBeNull();
  });

  it('DELETE departure: yalnız kendi satırı; ikinci çağrı 404; kanal soft-delete olunca eski üye listesinde yok', async () => {
    const { ch, owner, b } = await makeGroup('4');
    await dm.leaveGroupDm(b.id, ch.id);

    // başkası (owner) b'nin kaydını silemez: kendi satırı yok → 404, b'nin satırı durur
    await expect(dm.deleteDeparture(owner.id, ch.id)).rejects.toMatchObject({ status: 404 });
    expect(await prisma.groupDmDeparture.count({ where: { channelId: ch.id, userId: b.id } })).toBe(
      1,
    );

    await prisma.channel.update({ where: { id: ch.id }, data: { deletedAt: new Date() } });
    expect((await dm.getDmChannels(b.id)).find((x) => x.id === ch.id)).toBeUndefined();
    await expect(messages.findMessages(b.id, ch.id)).rejects.toMatchObject({ status: 404 });
    await prisma.channel.update({ where: { id: ch.id }, data: { deletedAt: null } });

    await expect(dm.deleteDeparture(b.id, ch.id)).resolves.toBeNull();
    await expect(dm.deleteDeparture(b.id, ch.id)).rejects.toMatchObject({ status: 404 });
    await expect(messages.findMessages(b.id, ch.id)).rejects.toMatchObject({ status: 403 });
  });

  it('ayrılma LEFT yazar; iki kişilik gruptan ayrılınca kanal soft-delete (bugünkü kural) ve listede görünmez', async () => {
    const { ch, owner, b } = await makeGroup('5', 2);
    await dm.leaveGroupDm(b.id, ch.id);
    const dep = await prisma.groupDmDeparture.findFirstOrThrow({
      where: { channelId: ch.id, userId: b.id },
    });
    expect(dep.reason).toBe('LEFT');
    expect(dep.memberIds).toEqual([owner.id]);
    expect(
      (await prisma.channel.findUniqueOrThrow({ where: { id: ch.id } })).deletedAt,
    ).not.toBeNull();
    expect((await dm.getDmChannels(b.id)).find((x) => x.id === ch.id)).toBeUndefined();
  });

  it('§2.3.b: tepkiler leftAt ile kesilir; sonradan düzenlenen düz + şifreli mesaj gövdesiz + bayraklı; replyTo ve lastMessage aynı; aktif üyede bayrak yok; silinmiş üye members dışı', async () => {
    const { ch, owner, b, c } = await makeGroup('6');
    const t = (min: number) => new Date(Date.UTC(2026, 10, 3, 0, min));
    const plain = await say(ch.id, owner.id, 'duz', t(1));
    const enc = await prisma.message.create({
      data: {
        channelId: ch.id,
        authorId: owner.id,
        content: '',
        encrypted: true,
        ciphertext: Buffer.from('gizli'),
        frankingTag: Buffer.from('tag'),
        senderDeviceId: 'dev-x',
        createdAt: t(2),
      },
    });
    const untouched = await say(ch.id, owner.id, 'dokunulmadi', t(3));
    const reply = await prisma.message.create({
      data: {
        channelId: ch.id,
        authorId: owner.id,
        content: 'yanit',
        replyToId: plain.id,
        createdAt: t(4),
      },
    });
    // leftAt'ten ÖNCE tepki: görünür
    await prisma.messageReaction.create({
      data: { messageId: untouched.id, userId: c.id, emoji: '👍', createdAt: t(5) },
    });

    await dm.removeGroupMember(owner.id, ch.id, b.id);
    const dep = await prisma.groupDmDeparture.findFirstOrThrow({
      where: { channelId: ch.id, userId: b.id },
    });
    const later = new Date(dep.leftAt.getTime() + 5000);
    // leftAt SONRASI: tepki + iki düzenleme (düz ve şifreli). Son mesaj da düzenlenir.
    await prisma.messageReaction.create({
      data: { messageId: plain.id, userId: c.id, emoji: '🔥', createdAt: later },
    });
    await prisma.message.update({
      where: { id: plain.id },
      data: { content: 'gizli-duzenleme', editedAt: later },
    });
    await prisma.message.update({
      where: { id: enc.id },
      data: {
        ciphertext: Buffer.from('yeni'),
        frankingTag: Buffer.from('yeni-tag'),
        editedAt: later,
      },
    });
    await prisma.message.update({
      where: { id: reply.id },
      data: { content: 'yanit-duzenleme', editedAt: later },
    });

    const res = (await messages.findMessages(b.id, ch.id)) as Array<Record<string, any>>;
    const by = Object.fromEntries(res.map((m) => [m.id, m]));
    expect(by[untouched.id].reactions).toEqual([{ emoji: '👍', count: 1, reactedByMe: false }]);
    expect(by[plain.id].reactions).toEqual([]); // leftAt sonrası tepki yok
    expect(by[plain.id]).toMatchObject({ content: '', editedAfterLeave: true, mentions: [] });
    expect(by[enc.id].editedAfterLeave).toBe(true);
    expect(by[enc.id]).not.toHaveProperty('ciphertext');
    expect(by[enc.id]).not.toHaveProperty('frankingTag');
    expect(by[untouched.id]).not.toHaveProperty('editedAfterLeave');
    expect(by[reply.id]).toMatchObject({ content: '', editedAfterLeave: true });
    expect(by[reply.id].replyTo).toMatchObject({ content: '', editedAfterLeave: true });

    // liste lastMessage (en son mesaj `reply`, leftAt sonrası düzenlendi)
    const item = (await dm.getDmChannels(b.id)).find((x) => x.id === ch.id) as Record<string, any>;
    expect(item.lastMessage).toMatchObject({ id: reply.id, content: '', editedAfterLeave: true });

    // aktif üye (c) aynı mesajları tam görür, bayrak yok
    const act = (await messages.findMessages(c.id, ch.id)) as Array<Record<string, any>>;
    const actPlain = act.find((m) => m.id === plain.id)!;
    expect(actPlain.content).toBe('gizli-duzenleme');
    expect(actPlain).not.toHaveProperty('editedAfterLeave');
    expect(actPlain.reactions).toHaveLength(1);

    // silinmiş (imha edilmiş) üye eski grup members'ında yok
    await prisma.user.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
    const after = (await dm.getDmChannels(b.id)).find((x) => x.id === ch.id) as Record<string, any>;
    expect(after.members.map((m: { id: string }) => m.id)).toEqual([owner.id]);
  });
});
