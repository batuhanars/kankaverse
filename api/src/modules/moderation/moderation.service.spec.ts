import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReportsService } from '../reports/reports.service';
import { ModerationModuleService } from './moderation.service';
import { ModerationService } from '../../shared/moderation/moderation.service';
import { ModeratorGuard } from '../../common/guards/moderator.guard';

// ── Mock Fabrikaları ───────────────────────────────────────────────────────────

const prismaMock = {
  report: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  moderationAction: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  guildMember: {
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  message: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

// ── Test: ReportsService ───────────────────────────────────────────────────────

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ReportsService(prismaMock as any);
  });

  it('CSAM reason → priority 100 (en yuksek)', async () => {
    prismaMock.report.create.mockResolvedValue({ id: 'rpt-1' });

    await service.create('user-1', {
      targetType: 'USER',
      targetId: 'target-1',
      reason: 'CSAM',
    });

    const createCall = prismaMock.report.create.mock.calls[0][0];
    expect(createCall.data.priority).toBe(100);
  });

  it('MINOR_SAFETY reason → priority 100 (en yuksek)', async () => {
    prismaMock.report.create.mockResolvedValue({ id: 'rpt-2' });

    await service.create('user-1', {
      targetType: 'USER',
      targetId: 'target-1',
      reason: 'MINOR_SAFETY',
    });

    const createCall = prismaMock.report.create.mock.calls[0][0];
    expect(createCall.data.priority).toBe(100);
  });

  it('VIOLENCE reason → priority 50', async () => {
    prismaMock.report.create.mockResolvedValue({ id: 'rpt-3' });

    await service.create('user-1', {
      targetType: 'MESSAGE',
      targetId: 'msg-1',
      reason: 'VIOLENCE',
    });

    const createCall = prismaMock.report.create.mock.calls[0][0];
    expect(createCall.data.priority).toBe(50);
  });

  it('SPAM reason → priority 0', async () => {
    prismaMock.report.create.mockResolvedValue({ id: 'rpt-4' });

    await service.create('user-1', {
      targetType: 'USER',
      targetId: 'target-1',
      reason: 'SPAM',
    });

    const createCall = prismaMock.report.create.mock.calls[0][0];
    expect(createCall.data.priority).toBe(0);
  });

  // §0 KURUL kontrolu: contextSnapshot minimal — icerik yok
  it('contextSnapshot yalniz minimal referans icerir — icerik/kanit YOK (§0 KURUL)', async () => {
    prismaMock.report.create.mockResolvedValue({ id: 'rpt-5' });

    await service.create('reporter-1', {
      targetType: 'MESSAGE',
      targetId: 'msg-abc',
      reason: 'HARASSMENT',
      description: 'Bana hakaret etti',
    });

    const createCall = prismaMock.report.create.mock.calls[0][0];
    const snapshot = createCall.data.contextSnapshot;

    // Izin verilen alanlar
    expect(snapshot.targetType).toBe('MESSAGE');
    expect(snapshot.targetId).toBe('msg-abc');
    expect(snapshot.reason).toBe('HARASSMENT');
    expect(snapshot.reportedAt).toBeDefined();

    // ICERIK OLMAMALI — §0 KURUL kisiti
    expect(snapshot.content).toBeUndefined();
    expect(snapshot.messageContent).toBeUndefined();
    expect(snapshot.userProfile).toBeUndefined();
    expect(snapshot.evidence).toBeUndefined();

    // Tam olarak 4 alan (targetType, targetId, reason, reportedAt)
    const keys = Object.keys(snapshot);
    expect(keys).toHaveLength(4);
    expect(keys).toEqual(expect.arrayContaining(['targetType', 'targetId', 'reason', 'reportedAt']));
  });

  it('create → jenerik { id } doner', async () => {
    prismaMock.report.create.mockResolvedValue({ id: 'rpt-gen' });

    const result = await service.create('user-1', {
      targetType: 'USER',
      targetId: 'target-1',
      reason: 'SPAM',
    });

    expect(result).toEqual({ id: 'rpt-gen' });
  });
});

// ── Test: ModeratorGuard ───────────────────────────────────────────────────────

describe('ModeratorGuard', () => {
  function makeGuard(isModerator: boolean | null) {
    const guardPrisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(
          isModerator === null ? null : { isModerator },
        ),
      },
    };
    const guard = new ModeratorGuard(guardPrisma as any);
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'user-123' } }),
      }),
    };
    return { guard, mockContext };
  }

  it('isModerator=true → canActivate true doner', async () => {
    const { guard, mockContext } = makeGuard(true);
    const result = await guard.canActivate(mockContext as any);
    expect(result).toBe(true);
  });

  it('isModerator=false → ForbiddenException firlatir', async () => {
    const { guard, mockContext } = makeGuard(false);
    await expect(guard.canActivate(mockContext as any)).rejects.toThrow(ForbiddenException);
  });

  it('kullanici bulunamadi (null) → ForbiddenException firlatir', async () => {
    const { guard, mockContext } = makeGuard(null);
    await expect(guard.canActivate(mockContext as any)).rejects.toThrow(ForbiddenException);
  });
});

// ── Test: ModerationModuleService — Action + AuditLog ─────────────────────────

describe('ModerationModuleService.createAction', () => {
  let service: ModerationModuleService;
  const MOD_ID = 'mod-user-1';
  const TARGET_ID = 'target-user-1';

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ModerationModuleService(prismaMock as any);
  });

  it('BAN aksiyonu → AuditLog yazilir (action: "moderation.ban")', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: TARGET_ID, deletedAt: null });
    prismaMock.moderationAction.create.mockResolvedValue({ id: 'action-1', type: 'BAN' });
    prismaMock.auditLog.create.mockResolvedValue({});

    await service.createAction(MOD_ID, {
      targetUserId: TARGET_ID,
      type: 'BAN',
      reason: 'Test ban',
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = prismaMock.auditLog.create.mock.calls[0][0];
    expect(auditCall.data.action).toBe('moderation.ban');
    expect(auditCall.data.actorId).toBe(MOD_ID);
    expect(auditCall.data.entityType).toBe('ModerationAction');
  });

  it('MUTE aksiyonu → AuditLog yazilir (action: "moderation.mute")', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: TARGET_ID, deletedAt: null });
    prismaMock.moderationAction.create.mockResolvedValue({ id: 'action-2', type: 'MUTE' });
    prismaMock.auditLog.create.mockResolvedValue({});

    await service.createAction(MOD_ID, {
      targetUserId: TARGET_ID,
      type: 'MUTE',
      reason: 'Spam gonderdi',
      scope: 'guild-abc',
      expiresInHours: 24,
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = prismaMock.auditLog.create.mock.calls[0][0];
    expect(auditCall.data.action).toBe('moderation.mute');
  });

  it('relatedReportId verilirse → report status RESOLVED yapilir', async () => {
    prismaMock.report.findUnique.mockResolvedValue({ id: 'rpt-linked', status: 'OPEN' });
    prismaMock.user.findUnique.mockResolvedValue({ id: TARGET_ID, deletedAt: null });
    prismaMock.moderationAction.create.mockResolvedValue({ id: 'action-3', type: 'WARN' });
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.report.update.mockResolvedValue({});

    await service.createAction(MOD_ID, {
      targetUserId: TARGET_ID,
      type: 'WARN',
      reason: 'Uyari',
      relatedReportId: 'rpt-linked',
    });

    expect(prismaMock.report.update).toHaveBeenCalledTimes(1);
    const updateCall = prismaMock.report.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('RESOLVED');
    expect(updateCall.data.resolvedById).toBe(MOD_ID);
  });

  it('targetUserId bulunamadi → NotFoundException', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      service.createAction(MOD_ID, {
        targetUserId: 'ghost-user',
        type: 'BAN',
        reason: 'Yok',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

// ── Test: ModerationService (shared) enforcement ──────────────────────────────

describe('ModerationService (shared) — enforcement helpers', () => {
  let service: ModerationService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ModerationService(prismaMock as any);
  });

  it('aktif BAN → hasActiveBan true doner', async () => {
    prismaMock.moderationAction.findFirst.mockResolvedValue({
      id: 'ban-1',
      type: 'BAN',
      scope: null,
      expiresAt: null,
    });

    const result = await service.hasActiveBan('banned-user');
    expect(result).toBe(true);
  });

  it('BAN yok → hasActiveBan false doner', async () => {
    prismaMock.moderationAction.findFirst.mockResolvedValue(null);

    const result = await service.hasActiveBan('clean-user');
    expect(result).toBe(false);
  });

  it('suresi dolmus BAN (findFirst null) → hasActiveBan false', async () => {
    // DB sorgsu expired BAN disar birakir → findFirst null doner
    prismaMock.moderationAction.findFirst.mockResolvedValue(null);

    const result = await service.hasActiveBan('user-with-expired-ban');
    expect(result).toBe(false);
  });

  it('aktif MUTE → hasActiveMute true doner', async () => {
    prismaMock.moderationAction.findFirst.mockResolvedValue({
      id: 'mute-1',
      type: 'MUTE',
      scope: 'guild-xyz',
      expiresAt: null,
    });

    const result = await service.hasActiveMute('muted-user', 'guild-xyz');
    expect(result).toBe(true);
  });

  it('MUTE yok → hasActiveMute false doner', async () => {
    prismaMock.moderationAction.findFirst.mockResolvedValue(null);

    const result = await service.hasActiveMute('clean-user', 'guild-xyz');
    expect(result).toBe(false);
  });
});

// ── Test: Enforcement — MessagesService + BAN/MUTE ────────────────────────────

import { ForbiddenException as FE } from '@nestjs/common';
import { MessagesService } from '../messages/messages.service';

describe('MessagesService enforcement — BAN/MUTE', () => {
  const membershipMock = {
    requireChannelAccess: jest.fn(),
    requireNoDmBlock: jest.fn(),
  };
  const automodMock = { check: jest.fn().mockReturnValue({ blocked: false }) };
  const configMock = { get: jest.fn().mockReturnValue(false) };
  const moderationMock = {
    hasActiveBan: jest.fn(),
    hasActiveMute: jest.fn(),
  };
  const msgPrisma = {
    message: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    channelMember: { findUnique: jest.fn() },
    attachment: { findMany: jest.fn(), updateMany: jest.fn() },
  };

  const GUILD_CHANNEL = { id: 'ch-g', guildId: 'guild-1' };
  const DM_CHANNEL = { id: 'ch-dm', guildId: null };

  const msgPermissionsMock = {
    hasGuildPermission: jest.fn().mockResolvedValue(true),
  };

  function makeService() {
    return new MessagesService(
      msgPrisma as any,
      membershipMock as any,
      msgPermissionsMock as any,
      automodMock as any,
      configMock as any,
      moderationMock as any,
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();
    automodMock.check.mockReturnValue({ blocked: false });
    configMock.get.mockReturnValue(false);
  });

  it("BAN'li kullanici guild kanalinda mesaj → ForbiddenException USER_BANNED", async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    moderationMock.hasActiveBan.mockResolvedValue(true);
    moderationMock.hasActiveMute.mockResolvedValue(false);

    const service = makeService();
    let thrown: FE | undefined;
    try {
      await service.create('banned-user', 'ch-g', { content: 'merhaba' });
    } catch (e) {
      thrown = e as FE;
    }

    expect(thrown).toBeInstanceOf(FE);
    const resp = thrown!.getResponse() as { error: string };
    expect(resp.error).toBe('USER_BANNED');
    expect(msgPrisma.message.create).not.toHaveBeenCalled();
  });

  it("MUTE'lu kullanici guild kanalinda mesaj → ForbiddenException USER_MUTED", async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    moderationMock.hasActiveBan.mockResolvedValue(false);
    moderationMock.hasActiveMute.mockResolvedValue(true);

    const service = makeService();
    let thrown: FE | undefined;
    try {
      await service.create('muted-user', 'ch-g', { content: 'merhaba' });
    } catch (e) {
      thrown = e as FE;
    }

    expect(thrown).toBeInstanceOf(FE);
    const resp = thrown!.getResponse() as { error: string };
    expect(resp.error).toBe('USER_MUTED');
    expect(msgPrisma.message.create).not.toHaveBeenCalled();
  });

  it('BAN/MUTE yok → mesaj olusturulur', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    moderationMock.hasActiveBan.mockResolvedValue(false);
    moderationMock.hasActiveMute.mockResolvedValue(false);
    msgPrisma.message.create.mockResolvedValue({
      id: 'msg-ok',
      channelId: 'ch-g',
      content: 'merhaba',
      replyToId: null,
      createdAt: new Date(),
      author: { id: 'u1', username: 'kanka', avatarUrl: null },
      attachments: [],
    });

    const service = makeService();
    const result = await service.create('clean-user', 'ch-g', { content: 'merhaba' });

    expect(result.id).toBe('msg-ok');
    expect(msgPrisma.message.create).toHaveBeenCalledTimes(1);
  });

  it("BAN'li kullanici DM kanalinda mesaj → ForbiddenException USER_BANNED", async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(DM_CHANNEL);
    moderationMock.hasActiveBan.mockResolvedValue(true);
    moderationMock.hasActiveMute.mockResolvedValue(false);

    const service = makeService();
    let thrown: FE | undefined;
    try {
      await service.create('banned-user', 'ch-dm', { content: 'dm gonder' });
    } catch (e) {
      thrown = e as FE;
    }

    expect(thrown).toBeInstanceOf(FE);
    const resp = thrown!.getResponse() as { error: string };
    expect(resp.error).toBe('USER_BANNED');
  });
});

// ── Test: Enforcement — DmPermissionService + BAN ─────────────────────────────

import { DmPermissionService } from '../../shared/dm-permission/dm-permission.service';

describe('DmPermissionService enforcement — BAN', () => {
  const dmPrisma = {
    user: { findUnique: jest.fn() },
    userBlock: { findFirst: jest.fn() },
    friendship: { findFirst: jest.fn() },
    guildMember: { findFirst: jest.fn() },
  };
  const dmConfig = { get: jest.fn().mockReturnValue(7) };
  const dmModeration = { hasActiveBan: jest.fn() };

  function makeService() {
    return new DmPermissionService(dmPrisma as any, dmConfig as any, dmModeration as any);
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("sender aktif BAN → canDm false (DM_NOT_ALLOWED)", async () => {
    dmModeration.hasActiveBan.mockResolvedValue(true);

    const service = makeService();
    const result = await service.canDm('banned-sender', 'target-1');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('DM_NOT_ALLOWED');
    // BAN early-return: user lookup cagrilmamali
    expect(dmPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('sender BAN yok → normal akis (user lookup yapilir)', async () => {
    dmModeration.hasActiveBan.mockResolvedValue(false);
    // Kullanicilar yok → DM_NOT_ALLOWED ama BAN'dan degil
    dmPrisma.user.findUnique.mockResolvedValue(null);

    const service = makeService();
    const result = await service.canDm('clean-sender', 'target-1');

    expect(result.allowed).toBe(false);
    // User lookup cagirildi (BAN erken-donus yapmadi)
    expect(dmPrisma.user.findUnique).toHaveBeenCalled();
  });
});

// ── Test: Enforcement — FriendPermissionService + BAN ─────────────────────────

import { FriendPermissionService } from '../../shared/friend-permission/friend-permission.service';

describe('FriendPermissionService enforcement — BAN', () => {
  const fpPrisma = {
    user: { findUnique: jest.fn() },
    userBlock: { findFirst: jest.fn() },
    friendship: { findFirst: jest.fn() },
    guildMember: { findFirst: jest.fn() },
  };
  const fpConfig = { get: jest.fn().mockReturnValue(24) };
  const fpModeration = { hasActiveBan: jest.fn() };

  function makeService() {
    return new FriendPermissionService(fpPrisma as any, fpConfig as any, fpModeration as any);
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("sender aktif BAN → canSendFriendRequest false (USER_NOT_FOUND jenerik)", async () => {
    fpModeration.hasActiveBan.mockResolvedValue(true);

    const service = makeService();
    const result = await service.canSendFriendRequest('banned-sender', 'target-1', 'CODE');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('USER_NOT_FOUND'); // jenerik — ban bilgisi sizdirilmaz
    // BAN early-return: user lookup cagrilmamali
    expect(fpPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('sender BAN yok → normal akis (user lookup yapilir)', async () => {
    fpModeration.hasActiveBan.mockResolvedValue(false);
    fpPrisma.user.findUnique.mockResolvedValue(null); // kullanici yok

    const service = makeService();
    const result = await service.canSendFriendRequest('clean-sender', 'target-1', 'CODE');

    expect(result.allowed).toBe(false);
    expect(fpPrisma.user.findUnique).toHaveBeenCalled();
  });
});
