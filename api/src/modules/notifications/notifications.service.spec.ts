import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

// ── Mock fabrikaları ──────────────────────────────────────────────────────────

const prismaMock = {
  notification: {
    create: jest.fn(),
    createManyAndReturn: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  notificationPref: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
  pushToken: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  guild: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
};

const emitToUserMock = jest.fn();
const realtimeMock = { emitToUser: emitToUserMock };

const membershipMock = {
  requireGuildMembership: jest.fn(),
  requireChannelAccess: jest.fn(),
};

const pushSendToUsersMock = jest.fn();
const pushMock = { sendToUsers: pushSendToUsersMock };

function makeService() {
  return new NotificationsService(
    prismaMock as any,
    realtimeMock as any,
    membershipMock as any,
    pushMock as any,
  );
}

function resetMocks() {
  jest.resetAllMocks();
  prismaMock.user.findUnique.mockResolvedValue(null);
  prismaMock.user.findMany.mockResolvedValue([]);
  prismaMock.guild.findUnique.mockResolvedValue(null);
  prismaMock.guild.findMany.mockResolvedValue([]);
  prismaMock.notificationPref.findMany.mockResolvedValue([]);
  pushSendToUsersMock.mockResolvedValue(undefined);
}

const USER_ID = 'user-recipient';
const OTHER_ID = 'user-other';
const ACTOR_ID = 'user-actor';

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'notif-1',
    userId: USER_ID,
    type: 'MENTION',
    actorId: ACTOR_ID,
    guildId: 'guild-1',
    channelId: 'ch-1',
    messageId: 'msg-1',
    preview: '@kanka selam',
    readAt: null,
    createdAt: new Date('2026-06-16T10:00:00.000Z'),
    ...overrides,
  };
}

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  // ── create → persist + emitToUser ───────────────────────────────────────────
  describe('create', () => {
    it('persist eder, sonra emitToUser(userId, "notification", dto) çağırır', async () => {
      prismaMock.notification.create.mockResolvedValue(makeRow());
      prismaMock.user.findUnique.mockResolvedValue({
        id: ACTOR_ID,
        username: 'aktor',
        avatarUrl: null,
      });

      const dto = await service.create(USER_ID, {
        type: 'MENTION',
        actorId: ACTOR_ID,
        guildId: 'guild-1',
        channelId: 'ch-1',
        messageId: 'msg-1',
        preview: '@kanka selam',
      });

      expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
      expect(emitToUserMock).toHaveBeenCalledTimes(1);
      const [target, event, payload] = emitToUserMock.mock.calls[0];
      expect(target).toBe(USER_ID);
      expect(event).toBe('notification');
      expect(payload).toBe(dto);
      // §5 şekli
      expect(dto.id).toBe('notif-1');
      expect(dto.type).toBe('MENTION');
      expect(dto.actor).toEqual({ id: ACTOR_ID, username: 'aktor', avatarUrl: null });
      expect(dto.channelId).toBe('ch-1');
      expect(dto.messageId).toBe('msg-1');
      expect(dto.preview).toBe('@kanka selam');
      expect(dto.readAt).toBeNull();
      expect(dto.createdAt).toBe('2026-06-16T10:00:00.000Z');
    });

    it('actorId yoksa actor null (User join yapılmaz)', async () => {
      prismaMock.notification.create.mockResolvedValue(
        makeRow({ actorId: null, type: 'FRIEND_ACCEPT' }),
      );

      const dto = await service.create(USER_ID, { type: 'FRIEND_ACCEPT' });

      expect(dto.actor).toBeNull();
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('actor User silinmişse (SetNull → join null) actor null', async () => {
      prismaMock.notification.create.mockResolvedValue(makeRow());
      prismaMock.user.findUnique.mockResolvedValue(null);

      const dto = await service.create(USER_ID, { type: 'MENTION', actorId: ACTOR_ID });

      expect(dto.actor).toBeNull();
    });

    // ── M3 §2.4 — push, kalıcı bildirim üretilen noktaya takılı ────────────────
    it('persist sonrası push.sendToUsers([userId], payload) çağrılır (aynı alıcı, yeni süzgeç yok)', async () => {
      prismaMock.notification.create.mockResolvedValue(makeRow());
      prismaMock.user.findUnique.mockResolvedValue({
        id: ACTOR_ID,
        username: 'aktor',
        avatarUrl: null,
      });

      await service.create(USER_ID, {
        type: 'MENTION',
        actorId: ACTOR_ID,
        guildId: 'guild-1',
        channelId: 'ch-1',
        messageId: 'msg-1',
        preview: '@kanka selam',
      });

      // Fire-and-forget: microtask kuyruğunun boşalmasını bekle.
      await Promise.resolve();

      expect(pushSendToUsersMock).toHaveBeenCalledTimes(1);
      const [targets, payload] = pushSendToUsersMock.mock.calls[0];
      expect(targets).toEqual([USER_ID]);
      expect(payload.data).toEqual({
        type: 'MENTION',
        guildId: 'guild-1',
        channelId: 'ch-1',
        messageId: 'msg-1',
      });
      expect(payload.body).toContain('aktor');
      expect(payload.body).toContain('@kanka selam');
    });

    it('push.sendToUsers reddederse bile create() normal dto döner (ana akış bozulmaz)', async () => {
      prismaMock.notification.create.mockResolvedValue(makeRow());
      pushSendToUsersMock.mockRejectedValue(new Error('expo kapalı'));

      const dto = await service.create(USER_ID, { type: 'MENTION', actorId: ACTOR_ID });

      expect(dto.id).toBe('notif-1');
    });

    it('preview yoksa (FRIEND_REQUEST) push body actor + sabit metin taşır', async () => {
      prismaMock.notification.create.mockResolvedValue(
        makeRow({
          type: 'FRIEND_REQUEST',
          preview: null,
          channelId: null,
          messageId: null,
          guildId: null,
        }),
      );
      prismaMock.user.findUnique.mockResolvedValue({
        id: ACTOR_ID,
        username: 'aktor',
        avatarUrl: null,
      });

      await service.create(USER_ID, { type: 'FRIEND_REQUEST', actorId: ACTOR_ID });
      await Promise.resolve();

      const [, payload] = pushSendToUsersMock.mock.calls[0];
      expect(payload.body).toBe('aktor sana kanka isteği gönderdi.');
    });
  });

  // ── R14 — createMany: tek insert, actor/guild çözümü bir kez, emit kullanıcı başına ────
  describe('createMany', () => {
    it('tek createManyAndReturn + kullanıcı başına emit; actor/guild TEK sorguda çözülür', async () => {
      prismaMock.notification.createManyAndReturn.mockResolvedValue([
        makeRow({
          id: 'n1',
          userId: USER_ID,
          type: 'EVENT_CREATED',
          messageId: null,
          preview: 'Oyun Gecesi',
        }),
        makeRow({
          id: 'n2',
          userId: OTHER_ID,
          type: 'EVENT_CREATED',
          messageId: null,
          preview: 'Oyun Gecesi',
        }),
      ]);
      prismaMock.user.findMany.mockResolvedValue([
        { id: ACTOR_ID, username: 'aktor', avatarUrl: null },
      ]);
      prismaMock.guild.findMany.mockResolvedValue([{ id: 'guild-1', name: 'Ortam' }]);

      const dtos = await service.createMany([USER_ID, OTHER_ID], {
        type: 'EVENT_CREATED',
        actorId: ACTOR_ID,
        guildId: 'guild-1',
        preview: 'Oyun Gecesi',
      });

      expect(prismaMock.notification.createManyAndReturn).toHaveBeenCalledTimes(1);
      // N+1 yok: actor ve guild çözümü birer sorgu (alıcı başına DEĞİL)
      expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.guild.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();

      expect(dtos).toHaveLength(2);
      expect(dtos[0].type).toBe('EVENT_CREATED');
      expect(dtos[0].guildName).toBe('Ortam');
      expect(emitToUserMock).toHaveBeenCalledTimes(2);
      expect(emitToUserMock).toHaveBeenCalledWith(USER_ID, 'notification', dtos[0]);
      expect(emitToUserMock).toHaveBeenCalledWith(OTHER_ID, 'notification', dtos[1]);
    });

    it('boş alıcı listesi → insert de emit de yok', async () => {
      const dtos = await service.createMany([], { type: 'EVENT_CREATED' });

      expect(dtos).toEqual([]);
      expect(prismaMock.notification.createManyAndReturn).not.toHaveBeenCalled();
      expect(emitToUserMock).not.toHaveBeenCalled();
    });

    it('tekrarlı alıcı id tekilleştirilir', async () => {
      prismaMock.notification.createManyAndReturn.mockResolvedValue([]);

      await service.createMany([USER_ID, USER_ID], { type: 'EVENT_CREATED' });

      const call = prismaMock.notification.createManyAndReturn.mock.calls[0][0];
      expect(call.data).toHaveLength(1);
    });

    // ── M3 §2.4 — push TEK çağrıda tüm alıcılara (data ortak) ─────────────────
    it('push.sendToUsers(targets, payload) TEK kez, tüm alıcılarla çağrılır', async () => {
      prismaMock.notification.createManyAndReturn.mockResolvedValue([
        makeRow({
          id: 'n1',
          userId: USER_ID,
          type: 'EVENT_CREATED',
          messageId: null,
          preview: 'Oyun Gecesi',
        }),
        makeRow({
          id: 'n2',
          userId: OTHER_ID,
          type: 'EVENT_CREATED',
          messageId: null,
          preview: 'Oyun Gecesi',
        }),
      ]);
      prismaMock.user.findMany.mockResolvedValue([
        { id: ACTOR_ID, username: 'aktor', avatarUrl: null },
      ]);
      prismaMock.guild.findMany.mockResolvedValue([{ id: 'guild-1', name: 'Ortam' }]);

      await service.createMany([USER_ID, OTHER_ID], {
        type: 'EVENT_CREATED',
        actorId: ACTOR_ID,
        guildId: 'guild-1',
        preview: 'Oyun Gecesi',
      });

      expect(pushSendToUsersMock).toHaveBeenCalledTimes(1);
      const [targets, payload] = pushSendToUsersMock.mock.calls[0];
      expect(targets).toEqual([USER_ID, OTHER_ID]);
      expect(payload.data.type).toBe('EVENT_CREATED');
      expect(payload.body).toContain('Oyun Gecesi');
    });

    it('C46: REACTION push gövdesi emoji + önizleme taşır, tag verilmez', async () => {
      prismaMock.notification.createManyAndReturn.mockResolvedValue([
        makeRow({ id: 'n1', type: 'REACTION', preview: '❤️ selam millet' }),
      ]);
      prismaMock.user.findMany.mockResolvedValue([
        { id: ACTOR_ID, username: 'aktor', avatarUrl: null },
      ]);

      await service.createMany([USER_ID], { type: 'REACTION', preview: '❤️ selam millet' });

      const payload = pushSendToUsersMock.mock.calls[0][1];
      expect(payload.body).toBe('aktor mesajına ❤️ bıraktı: selam millet');
      expect(payload.data.type).toBe('REACTION');
      expect(payload.tag).toBeUndefined();
    });

    it('C46: REACTION önizlemesiz → kısa gövde', async () => {
      prismaMock.notification.createManyAndReturn.mockResolvedValue([
        makeRow({ id: 'n1', type: 'REACTION', preview: '👍' }),
      ]);
      prismaMock.user.findMany.mockResolvedValue([
        { id: ACTOR_ID, username: 'aktor', avatarUrl: null },
      ]);

      await service.createMany([USER_ID], { type: 'REACTION', preview: '👍' });

      expect(pushSendToUsersMock.mock.calls[0][1].body).toBe('aktor mesajına 👍 bıraktı.');
    });

    it('boş alıcı listesi → push.sendToUsers çağrılmaz', async () => {
      await service.createMany([], { type: 'EVENT_CREATED' });

      expect(pushSendToUsersMock).not.toHaveBeenCalled();
    });
  });

  // ── unreadCount ─────────────────────────────────────────────────────────────
  describe('unreadCount', () => {
    it('readAt null sayısını döner', async () => {
      prismaMock.notification.count.mockResolvedValue(7);

      const result = await service.unreadCount(USER_ID);

      expect(prismaMock.notification.count).toHaveBeenCalledWith({
        where: { userId: USER_ID, readAt: null },
      });
      expect(result).toEqual({ count: 7 });
    });
  });

  // ── markAll ─────────────────────────────────────────────────────────────────
  describe('markAll', () => {
    it('readAt null olanları now ile günceller, count döner', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAll(USER_ID);

      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, readAt: null },
        data: { readAt: expect.any(Date) },
      });
      expect(result).toEqual({ count: 3 });
    });
  });

  // ── markOne sahiplik ────────────────────────────────────────────────────────
  describe('markOne', () => {
    it('kendi bildirimini okundu işaretler ve NotificationDto döner', async () => {
      prismaMock.notification.findUnique.mockResolvedValue(makeRow());
      prismaMock.notification.update.mockResolvedValue(
        makeRow({ readAt: new Date('2026-06-16T11:00:00.000Z') }),
      );

      const dto = await service.markOne(USER_ID, 'notif-1');

      expect(prismaMock.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { readAt: expect.any(Date) },
      });
      expect(dto.readAt).toBe('2026-06-16T11:00:00.000Z');
    });

    it('başkasının bildirimi → jenerik 404 (update çağrılmaz)', async () => {
      prismaMock.notification.findUnique.mockResolvedValue(makeRow({ userId: OTHER_ID }));

      await expect(service.markOne(USER_ID, 'notif-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.notification.update).not.toHaveBeenCalled();
    });

    it('bildirim yok → jenerik 404', async () => {
      prismaMock.notification.findUnique.mockResolvedValue(null);

      await expect(service.markOne(USER_ID, 'yok')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('zaten okunmuşsa update çağırmaz, mevcut readAt korunur', async () => {
      const already = makeRow({ readAt: new Date('2026-06-15T09:00:00.000Z') });
      prismaMock.notification.findUnique.mockResolvedValue(already);

      const dto = await service.markOne(USER_ID, 'notif-1');

      expect(prismaMock.notification.update).not.toHaveBeenCalled();
      expect(dto.readAt).toBe('2026-06-15T09:00:00.000Z');
    });
  });

  // ── list cursor ─────────────────────────────────────────────────────────────
  describe('list', () => {
    it('createdAt desc, limit ≤50, nextCursor hesaplar (take+1 fazlası varsa)', async () => {
      // limit 2 iste → take+1 = 3 satır döner → hasMore true
      const rows = [
        makeRow({ id: 'n1', actorId: null }),
        makeRow({ id: 'n2', actorId: null }),
        makeRow({ id: 'n3', actorId: null }),
      ];
      prismaMock.notification.findMany.mockResolvedValue(rows);

      const result = await service.list(USER_ID, undefined, 2);

      const call = prismaMock.notification.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ userId: USER_ID });
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
      expect(call.take).toBe(3); // take+1
      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('n2');
    });

    it('cursor verilirse cursor+skip:1 uygular', async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);

      await service.list(USER_ID, 'cursor-x', 10);

      const call = prismaMock.notification.findMany.mock.calls[0][0];
      expect(call.cursor).toEqual({ id: 'cursor-x' });
      expect(call.skip).toBe(1);
    });

    it('sayfa dolu değilse nextCursor null', async () => {
      prismaMock.notification.findMany.mockResolvedValue([makeRow({ id: 'n1', actorId: null })]);

      const result = await service.list(USER_ID, undefined, 10);

      expect(result.nextCursor).toBeNull();
      expect(result.items).toHaveLength(1);
    });

    it('limit 50 üstü cap edilir (take = 51)', async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);

      await service.list(USER_ID, undefined, 999);

      expect(prismaMock.notification.findMany.mock.calls[0][0].take).toBe(51);
    });
  });

  // ── snapshot (§3) ───────────────────────────────────────────────────────────
  describe('snapshot', () => {
    it('okunmamışları (take 50, desc) + unreadCount döner', async () => {
      prismaMock.notification.findMany.mockResolvedValue([makeRow({ actorId: null })]);
      prismaMock.notification.count.mockResolvedValue(1);

      const result = await service.snapshot(USER_ID);

      const call = prismaMock.notification.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ userId: USER_ID, readAt: null });
      expect(call.take).toBe(50);
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
      expect(result.notifications).toHaveLength(1);
      expect(result.unreadCount).toBe(1);
    });
  });

  // ── R12 — setPref erişim + upsert ───────────────────────────────────────────
  describe('setPref', () => {
    it('GUILD hedefi → requireGuildMembership çağrılır, upsert yapılır', async () => {
      prismaMock.notificationPref.upsert.mockResolvedValue({
        targetType: 'GUILD',
        targetId: 'guild-1',
        muted: true,
        mutedUntil: null,
        level: 'ALL',
      });

      const dto = await service.setPref(USER_ID, {
        targetType: 'GUILD',
        targetId: 'guild-1',
        muted: true,
      });

      expect(membershipMock.requireGuildMembership).toHaveBeenCalledWith(USER_ID, 'guild-1');
      expect(membershipMock.requireChannelAccess).not.toHaveBeenCalled();
      expect(dto).toEqual({
        targetType: 'GUILD',
        targetId: 'guild-1',
        muted: true,
        mutedUntil: null,
        level: 'ALL',
      });
    });

    it('CHANNEL hedefi → requireChannelAccess çağrılır', async () => {
      prismaMock.notificationPref.upsert.mockResolvedValue({
        targetType: 'CHANNEL',
        targetId: 'ch-1',
        muted: false,
        level: 'NONE',
      });

      await service.setPref(USER_ID, {
        targetType: 'CHANNEL',
        targetId: 'ch-1',
        level: 'NONE',
      });

      expect(membershipMock.requireChannelAccess).toHaveBeenCalledWith(USER_ID, 'ch-1');
    });

    it("kısmi update: verilmeyen alan update payload'ına girmez", async () => {
      prismaMock.notificationPref.upsert.mockResolvedValue({
        targetType: 'CHANNEL',
        targetId: 'ch-1',
        muted: true,
        level: 'ALL',
      });

      await service.setPref(USER_ID, {
        targetType: 'CHANNEL',
        targetId: 'ch-1',
        muted: true,
      });

      const call = prismaMock.notificationPref.upsert.mock.calls[0][0];
      expect(call.update).toEqual({ muted: true }); // level yok
      expect(call.create).toEqual({
        userId: USER_ID,
        targetType: 'CHANNEL',
        targetId: 'ch-1',
        muted: true,
      });
    });

    // ── R14 §2.2 — bastırma bayrakları YALNIZ ortam düzeyinde ────────────────
    it("GUILD hedefi + suppressEveryone/suppressEvents → upsert payload'ına girer", async () => {
      prismaMock.notificationPref.upsert.mockResolvedValue({
        targetType: 'GUILD',
        targetId: 'guild-1',
        muted: false,
        mutedUntil: null,
        level: 'ALL',
        suppressEveryone: true,
        suppressEvents: true,
      });

      const dto = await service.setPref(USER_ID, {
        targetType: 'GUILD',
        targetId: 'guild-1',
        suppressEveryone: true,
        suppressEvents: true,
      });

      const call = prismaMock.notificationPref.upsert.mock.calls[0][0];
      expect(call.update).toEqual({ suppressEveryone: true, suppressEvents: true });
      expect(dto.suppressEveryone).toBe(true);
      expect(dto.suppressEvents).toBe(true);
    });

    it('CHANNEL hedefi + suppressEveryone → 400 INVALID_PREF_TARGET (upsert yapılmaz)', async () => {
      await expect(
        service.setPref(USER_ID, {
          targetType: 'CHANNEL' as any,
          targetId: 'ch-1',
          suppressEveryone: true,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.setPref(USER_ID, {
          targetType: 'CHANNEL' as any,
          targetId: 'ch-1',
          suppressEveryone: true,
        }),
      ).rejects.toMatchObject({ response: { error: 'INVALID_PREF_TARGET' } });

      expect(prismaMock.notificationPref.upsert).not.toHaveBeenCalled();
      expect(membershipMock.requireChannelAccess).not.toHaveBeenCalled();
    });

    it('CHANNEL hedefi + suppressEvents=false (açıkça) → yine 400 (alan gönderildiyse yeter)', async () => {
      await expect(
        service.setPref(USER_ID, {
          targetType: 'CHANNEL' as any,
          targetId: 'ch-1',
          suppressEvents: false,
        }),
      ).rejects.toMatchObject({ response: { error: 'INVALID_PREF_TARGET' } });
    });

    it('CHANNEL hedefi + bayrak YOK → normal akış (mevcut davranış bozulmaz)', async () => {
      prismaMock.notificationPref.upsert.mockResolvedValue({
        targetType: 'CHANNEL',
        targetId: 'ch-1',
        muted: true,
        mutedUntil: null,
        level: 'ALL',
        suppressEveryone: false,
        suppressEvents: false,
      });

      await service.setPref(USER_ID, {
        targetType: 'CHANNEL',
        targetId: 'ch-1',
        muted: true,
      });

      expect(prismaMock.notificationPref.upsert).toHaveBeenCalledTimes(1);
    });
  });

  // ── R12 — shouldNotifyChannel suppression ───────────────────────────────────
  describe('shouldNotifyChannel', () => {
    it('tercih yoksa varsayılan → true', async () => {
      prismaMock.notificationPref.findMany.mockResolvedValue([]);
      expect(await service.shouldNotifyChannel(USER_ID, 'guild-1', 'ch-1')).toBe(true);
    });

    it("kanal muted → false (kanal guild'i geçersiz kılar)", async () => {
      prismaMock.notificationPref.findMany.mockResolvedValue([
        { targetType: 'CHANNEL', targetId: 'ch-1', muted: true, level: 'ALL' },
        { targetType: 'GUILD', targetId: 'guild-1', muted: false, level: 'ALL' },
      ]);
      expect(await service.shouldNotifyChannel(USER_ID, 'guild-1', 'ch-1')).toBe(false);
    });

    it('kanal level NONE → false', async () => {
      prismaMock.notificationPref.findMany.mockResolvedValue([
        { targetType: 'CHANNEL', targetId: 'ch-1', muted: false, level: 'NONE' },
      ]);
      expect(await service.shouldNotifyChannel(USER_ID, 'guild-1', 'ch-1')).toBe(false);
    });

    it('kanal tercihi yoksa guild tercihine düşer (guild muted → false)', async () => {
      prismaMock.notificationPref.findMany.mockResolvedValue([
        { targetType: 'GUILD', targetId: 'guild-1', muted: true, level: 'ALL' },
      ]);
      expect(await service.shouldNotifyChannel(USER_ID, 'guild-1', 'ch-1')).toBe(false);
    });

    it('etkin tercih ALL/unmuted → true', async () => {
      prismaMock.notificationPref.findMany.mockResolvedValue([
        { targetType: 'GUILD', targetId: 'guild-1', muted: false, level: 'ALL' },
      ]);
      expect(await service.shouldNotifyChannel(USER_ID, 'guild-1', 'ch-1')).toBe(true);
    });

    it('guildId null (DM-benzeri) → yalnız kanal tercihi sorgulanır', async () => {
      prismaMock.notificationPref.findMany.mockResolvedValue([]);
      await service.shouldNotifyChannel(USER_ID, null, 'ch-1');
      const call = prismaMock.notificationPref.findMany.mock.calls[0][0];
      expect(call.where.OR).toEqual([{ targetType: 'CHANNEL', targetId: 'ch-1' }]);
    });
  });

  // ── M3 §2.1/§2.2 — push token upsert (userId TAŞINIR) ───────────────────────
  describe('registerPushToken', () => {
    it('upsert çağrılır; update dalı da userId yazar (token devrinde eski kullanıcı sızmasın)', async () => {
      prismaMock.pushToken.upsert.mockResolvedValue({});

      await service.registerPushToken(USER_ID, {
        token: 'ExponentPushToken[abc]',
        platform: 'android',
        deviceName: 'Pixel',
      });

      expect(prismaMock.pushToken.upsert).toHaveBeenCalledWith({
        where: { token: 'ExponentPushToken[abc]' },
        create: {
          userId: USER_ID,
          token: 'ExponentPushToken[abc]',
          platform: 'android',
          deviceName: 'Pixel',
        },
        update: {
          userId: USER_ID,
          platform: 'android',
          deviceName: 'Pixel',
          lastUsedAt: expect.any(Date),
        },
      });
    });

    it('deviceName verilmezse null yazılır', async () => {
      prismaMock.pushToken.upsert.mockResolvedValue({});

      await service.registerPushToken(USER_ID, {
        token: 'ExponentPushToken[abc]',
        platform: 'android',
      });

      const call = prismaMock.pushToken.upsert.mock.calls[0][0];
      expect(call.create.deviceName).toBeNull();
      expect(call.update.deviceName).toBeNull();
    });
  });

  describe('deletePushToken', () => {
    it("kendi token'ını siler", async () => {
      prismaMock.pushToken.findUnique.mockResolvedValue({
        token: 'ExponentPushToken[abc]',
        userId: USER_ID,
      });

      await service.deletePushToken(USER_ID, 'ExponentPushToken[abc]');

      expect(prismaMock.pushToken.delete).toHaveBeenCalledWith({
        where: { token: 'ExponentPushToken[abc]' },
      });
    });

    it("başkasının token'ı → jenerik 404 (delete çağrılmaz, varlık sızdırılmaz)", async () => {
      prismaMock.pushToken.findUnique.mockResolvedValue({
        token: 'ExponentPushToken[abc]',
        userId: OTHER_ID,
      });

      await expect(
        service.deletePushToken(USER_ID, 'ExponentPushToken[abc]'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.pushToken.delete).not.toHaveBeenCalled();
    });

    it('token yoksa → jenerik 404', async () => {
      prismaMock.pushToken.findUnique.mockResolvedValue(null);

      await expect(service.deletePushToken(USER_ID, 'yok')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
