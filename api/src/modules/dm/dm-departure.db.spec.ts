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
import { DmGroupEventsService } from './dm-group-events.service';

const run = process.env.E2EE_DB_TESTS === '1' ? describe : describe.skip;

run('C62 grup DM departure gerçek DB', () => {
  const tag = randomBytes(4).toString('hex');
  const prisma = new PrismaService();
  const userIds: string[] = [];
  const channelIds: string[] = [];

  const realtime = { removeUserFromRoom: jest.fn(), emitToUser: jest.fn(), emitToUsers: jest.fn() };
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

  const events = new DmGroupEventsService(prisma, membership);

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
    await prisma.groupDmPastPeriod.deleteMany({ where: { channelId: { in: channelIds } } });
    await prisma.groupDmEvent.deleteMany({ where: { channelId: { in: channelIds } } });
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

  it('C64: çıkarma + geri ekleme olay satırları; üyelikle aynı an; pencere (aktif/eski üye/yabancı) ve yayın alıcıları', async () => {
    const { ch, owner, b, c } = await makeGroup('7');
    await prisma.friendship.create({
      data: { requesterId: owner.id, addresseeId: b.id, status: 'ACCEPTED' },
    });
    await dm.removeGroupMember(owner.id, ch.id, b.id);
    const dep = await prisma.groupDmDeparture.findFirstOrThrow({
      where: { channelId: ch.id, userId: b.id },
    });
    const removed = await prisma.groupDmEvent.findFirstOrThrow({ where: { channelId: ch.id } });
    expect(removed).toMatchObject({ kind: 'MEMBER_REMOVED', actorId: owner.id, targetId: b.id });
    expect(removed.createdAt).toEqual(dep.leftAt);
    const [recipients, name] = realtime.emitToUsers.mock.calls[0];
    expect(name).toBe('dm.group_event');
    expect([...recipients].sort()).toEqual([owner.id, c.id, b.id].sort());

    // eski üye kendi çıkarılma olayını görür; yabancı 403
    const own = await events.listEvents(b.id, ch.id);
    expect(own.map((e) => e.kind)).toEqual(['MEMBER_REMOVED']);
    expect(own[0].actor?.id).toBe(owner.id);
    const stranger = await makeUser('s7');
    await expect(events.listEvents(stranger.id, ch.id)).rejects.toMatchObject({ status: 403 });

    // geri ekle: ekleme olayı, ChannelMember.createdAt ile aynı an
    await dm.addGroupMember(owner.id, ch.id, { userId: b.id });
    const added = await prisma.groupDmEvent.findFirstOrThrow({
      where: { channelId: ch.id, kind: 'MEMBER_ADDED' },
    });
    const cm = await prisma.channelMember.findFirstOrThrow({
      where: { channelId: ch.id, userId: b.id },
    });
    expect(added.createdAt).toEqual(cm.createdAt);

    // aktif b: C65 ile önceki üyelik dönemi de görünür (çıkarılma olayı dönemin son anında)
    const active = await events.listEvents(b.id, ch.id);
    expect(active.map((e) => e.kind)).toEqual(['MEMBER_REMOVED', 'MEMBER_ADDED']);
    // owner (eski üyelikten beri) ikisini de eskiden yeniye görür
    const all = await events.listEvents(owner.id, ch.id);
    expect(all.map((e) => e.kind)).toEqual(['MEMBER_REMOVED', 'MEMBER_ADDED']);
    // olay mesaj hattına girmez
    expect(await prisma.message.count({ where: { channelId: ch.id } })).toBe(0);
  });

  it('C65: çık-gir dönemleri; m1 ve m3 görünür, dışarıdaki şifreli m2 görünmez (sayfalama, replyTo, liste, olay); Sohbeti sil sonrası m1 gizli', async () => {
    const { ch, owner, b } = await makeGroup('8');
    await prisma.friendship.create({
      data: { requesterId: owner.id, addresseeId: b.id, status: 'ACCEPTED' },
    });
    const encMsg = (content: string, authorId: string, createdAt: Date, replyToId?: string) =>
      prisma.message.create({
        data: {
          channelId: ch.id,
          authorId,
          content,
          encrypted: true,
          ciphertext: Buffer.from(content),
          senderDeviceId: 'd',
          createdAt,
          ...(replyToId ? { replyToId } : {}),
        },
      });
    const m1 = await encMsg('m1', b.id, new Date(Date.now() - 60_000));
    await dm.removeGroupMember(owner.id, ch.id, b.id);
    const periods1 = await prisma.groupDmPastPeriod.findMany({
      where: { channelId: ch.id, userId: b.id },
    });
    expect(periods1).toHaveLength(1);
    expect(periods1[0].joinedAt).toEqual(new Date('2026-11-01T00:00:00Z'));
    await new Promise((r) => setTimeout(r, 30));
    const m2 = await encMsg('m2', owner.id, new Date());
    await new Promise((r) => setTimeout(r, 50));
    await dm.addGroupMember(owner.id, ch.id, { userId: b.id });
    const m3 = await encMsg('m3', owner.id, new Date(Date.now() + 5000));
    const r1 = await encMsg('yanit-m1', owner.id, new Date(Date.now() + 6000), m1.id);
    const r2 = await encMsg('yanit-m2', owner.id, new Date(Date.now() + 7000), m2.id);

    const seen = (await messages.findMessages(b.id, ch.id)) as Array<Record<string, any>>;
    const ids = seen.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining([m1.id, m3.id, r1.id, r2.id]));
    expect(ids).not.toContain(m2.id);
    const by = Object.fromEntries(seen.map((m) => [m.id, m]));
    expect(by[r1.id].replyTo).not.toBeNull(); // m1 alıntısı görünür
    expect(by[r2.id].replyTo).toBeNull(); // m2 alıntısı gizli
    // sayfalama: cursor m3 iken m1 görünür, m2 yok
    const paged = (await messages.findMessages(b.id, ch.id, m3.id)) as Array<Record<string, any>>;
    expect(paged.map((m) => m.id)).toContain(m1.id);
    expect(paged.map((m) => m.id)).not.toContain(m2.id);

    // geçmiş dönemi olmayan üye (owner) hepsini görür (üyelik başlangıcından beri; m2 dışarıda değil)
    const ownerSees = (await messages.findMessages(owner.id, ch.id)) as Array<Record<string, any>>;
    expect(ownerSees.map((m) => m.id)).toContain(m2.id);

    // olay penceresi: b hem ilk dönemdeki çıkarılma olayını hem eklenmeyi görür
    const evs = await events.listEvents(b.id, ch.id);
    expect(evs.map((e) => e.kind)).toEqual(['MEMBER_REMOVED', 'MEMBER_ADDED']);

    // ikinci çık-gir: iki dönem
    await dm.removeGroupMember(owner.id, ch.id, b.id);
    await dm.addGroupMember(owner.id, ch.id, { userId: b.id });
    expect(
      await prisma.groupDmPastPeriod.count({ where: { channelId: ch.id, userId: b.id } }),
    ).toBe(2);
    const again = (await messages.findMessages(b.id, ch.id)) as Array<Record<string, any>>;
    expect(again.map((m) => m.id)).toContain(m1.id);
    expect(again.map((m) => m.id)).toContain(m3.id);

    // liste lastMessage: görünür en yeni mesaj
    const item = (await dm.getDmChannels(b.id)).find((x) => x.id === ch.id) as Record<string, any>;
    expect(item.lastMessage.id).toBe(r2.id);

    // Sohbeti sil: kaydı olan eski üye için; çıkar -> sil -> geri ekle -> m1 görünmez
    await dm.removeGroupMember(owner.id, ch.id, b.id);
    await dm.deleteDeparture(b.id, ch.id);
    expect(
      await prisma.groupDmPastPeriod.count({ where: { channelId: ch.id, userId: b.id } }),
    ).toBe(0);
    await dm.addGroupMember(owner.id, ch.id, { userId: b.id });
    const afterDelete = (await messages.findMessages(b.id, ch.id)) as Array<Record<string, any>>;
    expect(afterDelete.map((m) => m.id)).not.toContain(m1.id);
  });
});
