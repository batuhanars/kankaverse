/**
 * FriendsService — C1 bildirim üretimi birim testleri.
 *
 * Odak: FRIEND_REQUEST / FRIEND_ACCEPT üretimi mevcut emit'e PARALEL,
 * ve removeFriend'in notifications.create ÇAĞIRMADIĞI (sessiz T&S — R7-hafif).
 */

import { FriendsService } from './friends.service';

const prismaMock = {
  friendship: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  user: { findFirst: jest.fn(), findUnique: jest.fn() },
};

const realtimeMock = { emitToUser: jest.fn() };
const friendPermissionMock = { canSendFriendRequest: jest.fn() };
const notificationsCreateMock = jest.fn();
const notificationsMock = { create: notificationsCreateMock };

function makeService() {
  return new FriendsService(
    prismaMock as any,
    realtimeMock as any,
    friendPermissionMock as any,
    notificationsMock as any,
  );
}

function resetMocks() {
  jest.resetAllMocks();
}

const SENDER_ID = 'user-sender';
const TARGET_ID = 'user-target';

const TARGET = { id: TARGET_ID, username: 'hedef', avatarUrl: null };

function friendshipRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'fr-1',
    requesterId: SENDER_ID,
    addresseeId: TARGET_ID,
    status: 'PENDING',
    createdAt: new Date('2026-06-16T10:00:00.000Z'),
    updatedAt: new Date('2026-06-16T10:00:00.000Z'),
    requester: { id: SENDER_ID, username: 'sender', avatarUrl: null },
    addressee: TARGET,
    ...overrides,
  };
}

describe('FriendsService — C1 bildirim üretimi', () => {
  let service: FriendsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  // ── FRIEND_REQUEST: yeni PENDING ────────────────────────────────────────────
  it('yeni istek → FRIEND_REQUEST bildirimi (hedefe, actor=sender) — emit ile paralel', async () => {
    prismaMock.user.findFirst.mockResolvedValue(TARGET); // sendFriendRequest hedef arama
    friendPermissionMock.canSendFriendRequest.mockResolvedValue({ allowed: true });
    prismaMock.friendship.findFirst.mockResolvedValue(null); // mevcut yok → yeni PENDING
    prismaMock.friendship.create.mockResolvedValue(friendshipRow());

    await service.sendFriendRequest(SENDER_ID, { friendCode: 'ABC123' } as any);

    expect(realtimeMock.emitToUser).toHaveBeenCalledWith(
      TARGET_ID,
      'friend.request',
      expect.anything(),
    );
    expect(notificationsCreateMock).toHaveBeenCalledTimes(1);
    expect(notificationsCreateMock).toHaveBeenCalledWith(TARGET_ID, {
      type: 'FRIEND_REQUEST',
      actorId: SENDER_ID,
    });
  });

  // ── FRIEND_ACCEPT: karşıdan PENDING → otomatik kabul ─────────────────────────
  it('karşıdan PENDING varken istek → otomatik kabul → FRIEND_ACCEPT bildirimi (istek sahibine)', async () => {
    prismaMock.user.findFirst.mockResolvedValue(TARGET);
    friendPermissionMock.canSendFriendRequest.mockResolvedValue({ allowed: true });
    // Karşıdan gelen PENDING: requester=TARGET, addressee=SENDER
    prismaMock.friendship.findFirst.mockResolvedValue(
      friendshipRow({ requesterId: TARGET_ID, addresseeId: SENDER_ID, status: 'PENDING' }),
    );
    prismaMock.friendship.update.mockResolvedValue(
      friendshipRow({
        requesterId: TARGET_ID,
        addresseeId: SENDER_ID,
        status: 'ACCEPTED',
        requester: TARGET,
        addressee: { id: SENDER_ID, username: 'sender', avatarUrl: null },
      }),
    );

    await service.sendFriendRequest(SENDER_ID, { friendCode: 'ABC123' } as any);

    // Bildirim: istek sahibi (requesterId = TARGET_ID), kabul eden = SENDER_ID
    expect(notificationsCreateMock).toHaveBeenCalledWith(TARGET_ID, {
      type: 'FRIEND_ACCEPT',
      actorId: SENDER_ID,
    });
  });

  // ── FRIEND_ACCEPT: acceptFriendRequest ──────────────────────────────────────
  it('acceptFriendRequest → FRIEND_ACCEPT bildirimi (istek sahibine, actor=kabul eden)', async () => {
    prismaMock.friendship.findUnique.mockResolvedValue(
      friendshipRow({ requesterId: TARGET_ID, addresseeId: SENDER_ID, status: 'PENDING' }),
    );
    prismaMock.friendship.update.mockResolvedValue(
      friendshipRow({
        requesterId: TARGET_ID,
        addresseeId: SENDER_ID,
        status: 'ACCEPTED',
        requester: TARGET,
        addressee: { id: SENDER_ID, username: 'sender', avatarUrl: null },
      }),
    );

    // SENDER_ID isteği kabul ediyor (o addressee)
    await service.acceptFriendRequest(SENDER_ID, 'fr-1');

    expect(notificationsCreateMock).toHaveBeenCalledWith(TARGET_ID, {
      type: 'FRIEND_ACCEPT',
      actorId: SENDER_ID,
    });
  });

  // ── FRIEND_REMOVE: bildirim ÜRETMEZ (sessiz T&S — R7-hafif) ──────────────────
  it('removeFriend → notifications.create ÇAĞRILMAZ (sessiz); friend.remove WS aynen', async () => {
    prismaMock.friendship.findFirst.mockResolvedValue(
      friendshipRow({ status: 'ACCEPTED' }),
    );
    prismaMock.friendship.delete.mockResolvedValue(friendshipRow());

    await service.removeFriend(SENDER_ID, TARGET_ID);

    expect(realtimeMock.emitToUser).toHaveBeenCalledWith(TARGET_ID, 'friend.remove', {
      userId: SENDER_ID,
    });
    expect(notificationsCreateMock).not.toHaveBeenCalled();
  });
});
