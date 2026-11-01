import { ForbiddenException } from '@nestjs/common';
import { ReactionNotifierService } from './reaction-notifier.service';

// C46 §4 🔴 R7 — tepki bildirimi alıcı süzgeci

const ACTOR = 'actor-1';
const AUTHOR = 'author-1';
const CH = 'ch-1';
const MSG = 'msg-1';
const GUILD = 'guild-1';

const prismaMock = {
  message: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  userBlock: { findFirst: jest.fn() },
  channelMember: { updateMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
};
const membershipMock = { requireChannelAccess: jest.fn() };
const notificationsMock = { shouldNotifyChannel: jest.fn(), create: jest.fn() };
const pushMock = { sendToUsers: jest.fn() };
const realtimeMock = { emitToUser: jest.fn() };
const redisMock = { setIfAbsent: jest.fn() };
const gatewayMock = { resolveMentionPreview: jest.fn() };

function makeService() {
  return new ReactionNotifierService(
    prismaMock as any,
    membershipMock as any,
    notificationsMock as any,
    pushMock as any,
    realtimeMock as any,
    redisMock as any,
    gatewayMock as any,
  );
}

function setHappyPath(guildId: string | null = GUILD) {
  prismaMock.message.findUnique.mockResolvedValue({
    authorId: AUTHOR,
    webhookId: null,
    content: 'selam',
    deletedAt: null,
    attachments: [],
  });
  prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(
      where.id === AUTHOR
        ? { deletedAt: null, reactionNotifications: true }
        : { id: ACTOR, username: 'aktor', avatarUrl: null },
    ),
  );
  membershipMock.requireChannelAccess.mockResolvedValue({ guildId });
  prismaMock.userBlock.findFirst.mockResolvedValue(null);
  notificationsMock.shouldNotifyChannel.mockResolvedValue(true);
  redisMock.setIfAbsent.mockResolvedValue(true);
  notificationsMock.create.mockResolvedValue({});
  pushMock.sendToUsers.mockResolvedValue(undefined);
  gatewayMock.resolveMentionPreview.mockImplementation((t: string) => Promise.resolve(t));
  prismaMock.channelMember.updateMany.mockResolvedValue({ count: 1 });
}

function expectNoNotification() {
  expect(notificationsMock.create).not.toHaveBeenCalled();
  expect(pushMock.sendToUsers).not.toHaveBeenCalled();
  expect(realtimeMock.emitToUser).not.toHaveBeenCalled();
  expect(prismaMock.channelMember.updateMany).not.toHaveBeenCalled();
}

describe('ReactionNotifierService.notifyAdded — C46 §4', () => {
  let service: ReactionNotifierService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = makeService();
  });

  it('ortam: çan kaydı (REACTION) üretir, önizleme emoji + metin', async () => {
    setHappyPath(GUILD);

    await service.notifyAdded(ACTOR, CH, MSG, '❤️');

    expect(notificationsMock.create).toHaveBeenCalledWith(AUTHOR, {
      type: 'REACTION',
      actorId: ACTOR,
      guildId: GUILD,
      channelId: CH,
      messageId: MSG,
      preview: '❤️ selam',
    });
    expect(pushMock.sendToUsers).not.toHaveBeenCalled(); // push create() içinden gider
    expect(notificationsMock.shouldNotifyChannel).toHaveBeenCalledWith(AUTHOR, GUILD, CH);
  });

  it('DM: çan kaydı YOK; doğrudan push + reaction.notify', async () => {
    setHappyPath(null);

    await service.notifyAdded(ACTOR, CH, MSG, '👍');

    expect(notificationsMock.create).not.toHaveBeenCalled();
    expect(pushMock.sendToUsers).toHaveBeenCalledWith([AUTHOR], {
      title: 'aktor',
      body: 'aktor mesajına 👍 bıraktı: selam',
      data: { type: 'REACTION', channelId: CH, messageId: MSG },
      androidChannelId: 'messages_v6',
      priority: 'high',
    });
    expect(realtimeMock.emitToUser).toHaveBeenCalledWith(AUTHOR, 'reaction.notify', {
      actor: { id: ACTOR, username: 'aktor', avatarUrl: null },
      emoji: '👍',
      channelId: CH,
      messageId: MSG,
      preview: '👍 selam',
    });
    expect(notificationsMock.shouldNotifyChannel).toHaveBeenCalledWith(AUTHOR, null, CH);
  });

  it('DM push `tag` taşımaz', async () => {
    setHappyPath(null);
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    expect(pushMock.sendToUsers.mock.calls[0][1]).not.toHaveProperty('tag');
  });

  it('önizleme boşsa (içerik ve ek yok) yalnız emoji saklanır, gövde kısa biçim', async () => {
    setHappyPath(null);
    prismaMock.message.findUnique.mockResolvedValue({
      authorId: AUTHOR,
      webhookId: null,
      content: '',
      deletedAt: null,
      attachments: [],
    });

    await service.notifyAdded(ACTOR, CH, MSG, '👍');

    expect(pushMock.sendToUsers.mock.calls[0][1].body).toBe('aktor mesajına 👍 bıraktı.');
    const notify = realtimeMock.emitToUser.mock.calls.find(
      (c: unknown[]) => c[1] === 'reaction.notify',
    );
    expect(notify[2].preview).toBe('👍');
  });

  it('ek-yalnız mesajda önizleme eklerden üretilir', async () => {
    setHappyPath(null);
    prismaMock.message.findUnique.mockResolvedValue({
      authorId: AUTHOR,
      webhookId: null,
      content: '',
      deletedAt: null,
      attachments: [{ contentType: 'image/png' }],
    });

    await service.notifyAdded(ACTOR, CH, MSG, '👍');

    expect(gatewayMock.resolveMentionPreview).toHaveBeenCalledWith('📷 Görsel', null);
  });

  it('önizleme 120 karaktere kırpılır', async () => {
    setHappyPath(GUILD);
    gatewayMock.resolveMentionPreview.mockResolvedValue('a'.repeat(300));

    await service.notifyAdded(ACTOR, CH, MSG, '❤️');

    expect(notificationsMock.create.mock.calls[0][1].preview).toHaveLength(120);
  });

  // ── Süzgeçler: hiçbiri bildirim üretmez ─────────────────────────────────────

  it('kendi mesajına tepki → bildirim yok', async () => {
    setHappyPath();
    await service.notifyAdded(AUTHOR, CH, MSG, '👍');
    expectNoNotification();
  });

  it('mesaj yok → bildirim yok', async () => {
    setHappyPath();
    prismaMock.message.findUnique.mockResolvedValue(null);
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    expectNoNotification();
  });

  it('silinmiş mesaj → bildirim yok', async () => {
    setHappyPath();
    prismaMock.message.findUnique.mockResolvedValue({
      authorId: AUTHOR,
      webhookId: null,
      content: 'x',
      deletedAt: new Date(),
      attachments: [],
    });
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    expectNoNotification();
  });

  it('webhook mesajı → bildirim yok', async () => {
    setHappyPath();
    prismaMock.message.findUnique.mockResolvedValue({
      authorId: AUTHOR,
      webhookId: 'wh-1',
      content: 'x',
      deletedAt: null,
      attachments: [],
    });
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    expectNoNotification();
  });

  it('yazar yok → bildirim yok', async () => {
    setHappyPath();
    prismaMock.user.findUnique.mockResolvedValue(null);
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    expectNoNotification();
  });

  it('yazar silinmiş → bildirim yok', async () => {
    setHappyPath();
    prismaMock.user.findUnique.mockResolvedValue({
      deletedAt: new Date(),
      reactionNotifications: true,
    });
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    expectNoNotification();
  });

  it('yazarın ayarı kapalı (reactionNotifications=false) → bildirim yok', async () => {
    setHappyPath();
    prismaMock.user.findUnique.mockResolvedValue({
      deletedAt: null,
      reactionNotifications: false,
    });
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    expectNoNotification();
    expect(redisMock.setIfAbsent).not.toHaveBeenCalled();
  });

  it('yazarın kanala erişimi kalmamış (ortamdan ayrılmış / DM üyesi değil) → bildirim yok', async () => {
    setHappyPath();
    membershipMock.requireChannelAccess.mockRejectedValue(new ForbiddenException());
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    expectNoNotification();
    expect(membershipMock.requireChannelAccess).toHaveBeenCalledWith(AUTHOR, CH);
  });

  it('yazar tepki vereni engellemiş → bildirim yok', async () => {
    setHappyPath();
    prismaMock.userBlock.findFirst.mockResolvedValue({ id: 'b1' });
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    expectNoNotification();
  });

  it('engel sorgusu iki yönlüdür (yazar<->tepki veren)', async () => {
    setHappyPath();
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    expect(prismaMock.userBlock.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { blockerId: AUTHOR, blockedId: ACTOR },
          { blockerId: ACTOR, blockedId: AUTHOR },
        ],
      },
      select: { id: true },
    });
  });

  it('ortamda sessize alınmış kanal (shouldNotifyChannel=false) → bildirim yok', async () => {
    setHappyPath(GUILD);
    notificationsMock.shouldNotifyChannel.mockResolvedValue(false);
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    expectNoNotification();
    expect(redisMock.setIfAbsent).not.toHaveBeenCalled();
  });

  it('DM sessize alınmış (shouldNotifyChannel=false) → push da reaction.notify de yok', async () => {
    setHappyPath(null);
    notificationsMock.shouldNotifyChannel.mockResolvedValue(false);
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    expectNoNotification();
  });

  // ── Tekrar süzgeci ─────────────────────────────────────────────────────────

  it('tekrar süzgeci: anahtar `rxn:notif:{messageId}:{actorId}`, 24 saat TTL', async () => {
    setHappyPath();
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    expect(redisMock.setIfAbsent).toHaveBeenCalledWith(`rxn:notif:${MSG}:${ACTOR}`, 86_400);
  });

  it('tekrar süzgeci: anahtar zaten varsa (koy/kaldır/koy veya emoji değiştirme) → ikinci bildirim yok', async () => {
    setHappyPath();
    redisMock.setIfAbsent.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await service.notifyAdded(ACTOR, CH, MSG, '❤️');
    await service.notifyAdded(ACTOR, CH, MSG, '👍'); // değiştirme: yeni emoji `added`

    expect(notificationsMock.create).toHaveBeenCalledTimes(1);
  });

  it('Redis hatasında bildirim atlanır, hata fırlatılmaz', async () => {
    setHappyPath();
    redisMock.setIfAbsent.mockRejectedValue(new Error('redis down'));

    await expect(service.notifyAdded(ACTOR, CH, MSG, '👍')).resolves.toBeUndefined();
    expectNoNotification();
  });
});

describe('ReactionNotifier C46 §4b — DM liste göstergesi', () => {
  let service: ReactionNotifierService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = makeService();
  });

  const lastReactionCall = () => prismaMock.channelMember.updateMany.mock.calls[0][0];
  const dmReactionEmits = () =>
    realtimeMock.emitToUser.mock.calls.filter((c: unknown[]) => c[1] === 'dm.reaction');

  it('DM: üyelik satırına yazar ve dm.reaction yayınlar', async () => {
    setHappyPath(null);
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    const call = lastReactionCall();
    expect(call.where).toEqual({ channelId: CH, userId: AUTHOR });
    expect(call.data.lastReaction).toMatchObject({
      actorId: ACTOR,
      actorUsername: 'aktor',
      emoji: '👍',
      messageId: MSG,
    });
    const emits = dmReactionEmits();
    expect(emits).toHaveLength(1);
    expect(emits[0][0]).toBe(AUTHOR);
    expect(emits[0][2].channelId).toBe(CH);
    expect(emits[0][2].lastReaction.emoji).toBe('👍');
  });

  it('ortam: yazma ve dm.reaction yok', async () => {
    setHappyPath(GUILD);
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    expect(prismaMock.channelMember.updateMany).not.toHaveBeenCalled();
    expect(dmReactionEmits()).toHaveLength(0);
  });

  it('süzgeçle elenen durumlarda yazma yok (kendi mesajı, ayar kapalı, engel, sessiz kanal)', async () => {
    setHappyPath(null);
    await service.notifyAdded(AUTHOR, CH, MSG, '👍');
    prismaMock.user.findUnique.mockResolvedValueOnce({
      deletedAt: null,
      reactionNotifications: false,
    });
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    prismaMock.userBlock.findFirst.mockResolvedValueOnce({ id: 'b' });
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    notificationsMock.shouldNotifyChannel.mockResolvedValueOnce(false);
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    expectNoNotification();
  });

  it('tekrar süzgecinde satır YAZILIR ama push ve reaction.notify gitmez', async () => {
    setHappyPath(null);
    redisMock.setIfAbsent.mockResolvedValue(false);
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    expect(prismaMock.channelMember.updateMany).toHaveBeenCalledTimes(1);
    expect(dmReactionEmits()).toHaveLength(1);
    expect(pushMock.sendToUsers).not.toHaveBeenCalled();
    expect(
      realtimeMock.emitToUser.mock.calls.some((c: unknown[]) => c[1] === 'reaction.notify'),
    ).toBe(false);
  });

  it('yazma hatası bildirimi düşürmez', async () => {
    setHappyPath(null);
    prismaMock.channelMember.updateMany.mockRejectedValue(new Error('db'));
    await service.notifyAdded(ACTOR, CH, MSG, '👍');
    expect(pushMock.sendToUsers).toHaveBeenCalled();
  });

  describe('notifyRemoved', () => {
    const stored = {
      actorId: ACTOR,
      actorUsername: 'aktor',
      emoji: '👍',
      messageId: MSG,
      at: '2026-11-01T10:00:00.000Z',
    };
    beforeEach(() => {
      prismaMock.message.findUnique.mockResolvedValue({ authorId: AUTHOR });
      prismaMock.channelMember.update.mockResolvedValue({});
    });

    it('aynı aktör+mesaj+emoji ise temizler ve null yayınlar', async () => {
      prismaMock.channelMember.findUnique.mockResolvedValue({ lastReaction: stored });
      await service.notifyRemoved(ACTOR, CH, MSG, '👍');
      expect(prismaMock.channelMember.update).toHaveBeenCalledTimes(1);
      expect(realtimeMock.emitToUser).toHaveBeenCalledWith(AUTHOR, 'dm.reaction', {
        channelId: CH,
        lastReaction: null,
      });
    });

    it.each([
      ['farklı mesaj', { ...stored, messageId: 'other' }],
      ['farklı emoji', { ...stored, emoji: '❤️' }],
      ['farklı aktör', { ...stored, actorId: 'x' }],
      ['bozuk veri', { foo: 1 }],
      ['boş', null],
    ])('%s: temizlemez', async (_n, value) => {
      prismaMock.channelMember.findUnique.mockResolvedValue({ lastReaction: value });
      await service.notifyRemoved(ACTOR, CH, MSG, '👍');
      expect(prismaMock.channelMember.update).not.toHaveBeenCalled();
      expect(realtimeMock.emitToUser).not.toHaveBeenCalled();
    });
  });
});
