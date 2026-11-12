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
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
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
    findMany: jest.fn(),
    update: jest.fn(),
  },
  guildMember: {
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  message: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  guild: {
    update: jest.fn(),
  },
};

// ── Test: ReportsService ───────────────────────────────────────────────────────

describe('ReportsService', () => {
  let service: ReportsService;
  // E4: kanıt üretimi ayrı serviste (report-evidence.service.spec.ts); burada yalnız önceliklendirme/snapshot.
  const evidenceMock = { build: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    evidenceMock.build.mockResolvedValue([]);
    service = new ReportsService(prismaMock as any, evidenceMock as any);
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

  // E4: icerik/kanit contextSnapshot'ta DEGIL, ReportEvidence satirlarinda tutulur
  it('contextSnapshot yalniz minimal referans icerir — icerik/kanit ReportEvidence tablosunda (E4)', async () => {
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

    // ICERIK OLMAMALI — kanit ReportEvidence'ta
    expect(snapshot.content).toBeUndefined();
    expect(snapshot.messageContent).toBeUndefined();
    expect(snapshot.userProfile).toBeUndefined();
    expect(snapshot.evidence).toBeUndefined();

    // Tam olarak 4 alan (targetType, targetId, reason, reportedAt)
    const keys = Object.keys(snapshot);
    expect(keys).toHaveLength(4);
    expect(keys).toEqual(
      expect.arrayContaining(['targetType', 'targetId', 'reason', 'reportedAt']),
    );
  });

  it('E4: MESSAGE hedefinde kanit uretilir ve rapor ile ic ice (tek yazim) olusturulur', async () => {
    const rows = [{ messageId: 'm1', isTarget: true }];
    evidenceMock.build.mockResolvedValue(rows);
    prismaMock.report.create.mockResolvedValue({ id: 'rpt-ev' });

    await service.create('reporter-1', { targetType: 'MESSAGE', targetId: 'm1', reason: 'SPAM' });

    expect(evidenceMock.build).toHaveBeenCalledWith('reporter-1', 'm1', undefined);
    expect(prismaMock.report.create.mock.calls[0][0].data.evidence).toEqual({ create: rows });
  });

  it('E4: MESSAGE disi hedefte kanit sorgusu acilmaz', async () => {
    prismaMock.report.create.mockResolvedValue({ id: 'rpt-u' });
    await service.create('reporter-1', { targetType: 'USER', targetId: 'u1', reason: 'SPAM' });
    expect(evidenceMock.build).not.toHaveBeenCalled();
    expect(prismaMock.report.create.mock.calls[0][0].data.evidence).toBeUndefined();
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
        findUnique: jest.fn().mockResolvedValue(isModerator === null ? null : { isModerator }),
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

describe('ModerationModuleService kuyruk (iceriksiz) + getReport (E4 Rev.1)', () => {
  let service: ModerationModuleService;
  const baseReport = {
    targetType: 'MESSAGE',
    targetId: 'm1',
    reason: 'SPAM',
    description: null,
    status: 'OPEN',
    priority: 0,
    contextSnapshot: {},
    reporterId: 'r1',
    createdAt: new Date('2026-11-11T10:00:00Z'),
  };
  const ev = {
    id: 'e1',
    messageId: 'm1',
    authorId: 'a1',
    channelId: 'c1',
    content: 'x',
    attachments: [],
    messageAt: new Date('2026-11-11T09:59:00Z'),
    source: 'server',
    verified: true,
    isTarget: true,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.message.findMany.mockResolvedValue([]);
    service = new ModerationModuleService(prismaMock as any);
  });

  it('kuyruk icerik SECMEZ/DONMEZ: yalniz evidenceCount + hasUnverified; denetim yazmaz', async () => {
    prismaMock.report.findMany.mockResolvedValue([
      { ...baseReport, id: 'a', evidence: [{ verified: true }, { verified: false }] },
      { ...baseReport, id: 'b', evidence: [{ verified: true }] },
      { ...baseReport, id: 'c', evidence: [] },
    ]);

    const result = await service.getQueue();

    // İçerik alanı (content/attachments) SEÇİLMEZ; yalnız doğrulama, hedef bayrağı ve yazar kimliği.
    expect(prismaMock.report.findMany.mock.calls[0][0].select.evidence).toEqual({
      select: { verified: true, isTarget: true, authorId: true },
    });
    expect(result.map((r) => [r.evidenceCount, r.hasUnverified])).toEqual([
      [2, true],
      [1, false],
      [0, false],
    ]);
    expect(result[0]).not.toHaveProperty('evidence');
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('getReport: kanit hedef-once/zaman sirasi istenir, report.evidence_view yazilir, icerik doner', async () => {
    prismaMock.report.findUnique.mockResolvedValue({
      ...baseReport,
      id: 'rpt-a',
      resolvedAt: null,
      evidencePurgeAt: null,
      evidence: [ev, { ...ev, id: 'e2', isTarget: false }],
    });
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.user.findMany.mockResolvedValue([{ id: 'a1', username: 'ayse' }]);

    const r = await service.getReport('mod-1', 'rpt-a');

    expect(prismaMock.report.findUnique.mock.calls[0][0].select.evidence.orderBy).toEqual([
      { isTarget: 'desc' },
      { messageAt: 'asc' },
    ]);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'mod-1',
        action: 'report.evidence_view',
        entityType: 'Report',
        entityId: 'rpt-a',
        metadata: { evidenceCount: 2 },
      },
    });
    expect(r.evidence).toHaveLength(2);
    expect(r.evidence[0].messageAt).toBe('2026-11-11T09:59:00.000Z');
    expect(r.evidence[0].content).toBe('x');
    // yazar adi tek sorguyla (ayni yazar tekrar etse de), bilinmeyen yazar null
    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['a1'] } },
      select: { id: true, username: true },
    });
    expect(r.evidence[0].authorUsername).toBe('ayse');
  });

  it('getReport: yazari olmayan/silinmis kanit authorUsername null, yazar sorgusu atlanir', async () => {
    prismaMock.report.findUnique.mockResolvedValue({
      ...baseReport,
      id: 'rpt-a',
      resolvedAt: null,
      evidencePurgeAt: null,
      evidence: [{ ...ev, authorId: null }],
    });
    prismaMock.auditLog.create.mockResolvedValue({});
    const r = await service.getReport('mod-1', 'rpt-a');
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    expect(r.evidence[0].authorUsername).toBeNull();
  });

  it('getReport: denetim yazilamazsa yanit donmez', async () => {
    prismaMock.report.findUnique.mockResolvedValue({
      ...baseReport,
      id: 'rpt-a',
      resolvedAt: null,
      evidencePurgeAt: null,
      evidence: [ev],
    });
    prismaMock.auditLog.create.mockRejectedValue(new Error('db'));
    await expect(service.getReport('mod-1', 'rpt-a')).rejects.toThrow('db');
  });

  it('getReport: rapor yoksa 404 REPORT_NOT_FOUND, denetim yazilmaz', async () => {
    prismaMock.report.findUnique.mockResolvedValue(null);
    await expect(service.getReport('mod-1', 'yok')).rejects.toThrow(NotFoundException);
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});

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

  it('E4: kapanista evidencePurgeAt = resolvedAt + 90 gun', async () => {
    prismaMock.report.findUnique.mockResolvedValue({ id: 'rpt-linked', status: 'OPEN' });
    prismaMock.user.findUnique.mockResolvedValue({ id: TARGET_ID, deletedAt: null });
    prismaMock.moderationAction.create.mockResolvedValue({ id: 'action-9', type: 'WARN' });
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.report.update.mockResolvedValue({});

    await service.createAction(MOD_ID, {
      targetUserId: TARGET_ID,
      type: 'WARN',
      reason: 'Uyari',
      relatedReportId: 'rpt-linked',
    });

    const { resolvedAt, evidencePurgeAt } = prismaMock.report.update.mock.calls[0][0].data;
    expect(evidencePurgeAt.getTime() - resolvedAt.getTime()).toBe(90 * 24 * 60 * 60 * 1000);
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

// ── Test: ModerationModuleService.createAction — MEDIA_REMOVE (C8/R7) ────────

describe('ModerationModuleService.createAction — MEDIA_REMOVE (C8/R7)', () => {
  let service: ModerationModuleService;
  const MOD_ID = 'mod-user-1';
  const TARGET_ID = 'target-user-1';
  const GUILD_ID = 'guild-abc';

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ModerationModuleService(prismaMock as any);
    prismaMock.user.findUnique.mockResolvedValue({ id: TARGET_ID, deletedAt: null });
    prismaMock.moderationAction.create.mockResolvedValue({
      id: 'action-media',
      type: 'MEDIA_REMOVE',
    });
    prismaMock.auditLog.create.mockResolvedValue({});
  });

  it('mediaTarget verilmeden MEDIA_REMOVE → BadRequestException MEDIA_TARGET_REQUIRED (action/audit kaydı OLUŞMAZ)', async () => {
    await expect(
      service.createAction(MOD_ID, {
        targetUserId: TARGET_ID,
        type: 'MEDIA_REMOVE',
        reason: 'Uygunsuz avatar',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'MEDIA_TARGET_REQUIRED' }),
    });

    // Erken red — ModerationAction/AuditLog kaydı hiç oluşturulmamalı (orphan kayıt yok)
    expect(prismaMock.moderationAction.create).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('mediaTarget=USER_AVATAR → hedef kullanıcının avatarUrl alanı null yapılır (S3 objesi silinmez)', async () => {
    await service.createAction(MOD_ID, {
      targetUserId: TARGET_ID,
      type: 'MEDIA_REMOVE',
      mediaTarget: 'USER_AVATAR' as any,
      reason: 'Uygunsuz avatar',
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: { avatarUrl: null, avatarAnimatedUrl: null },
    });
    expect(prismaMock.guild.update).not.toHaveBeenCalled();
  });

  it('mediaTarget=USER_BANNER → hedef kullanıcının bannerUrl alanı null yapılır', async () => {
    await service.createAction(MOD_ID, {
      targetUserId: TARGET_ID,
      type: 'MEDIA_REMOVE',
      mediaTarget: 'USER_BANNER' as any,
      reason: 'Uygunsuz afiş',
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: { bannerUrl: null, bannerAnimatedUrl: null },
    });
  });

  it('mediaTarget=GUILD_BANNER → dto.scope=guildId; guild.bannerUrl null yapılır (targetUser alanı DOKUNULMAZ)', async () => {
    await service.createAction(MOD_ID, {
      targetUserId: TARGET_ID,
      type: 'MEDIA_REMOVE',
      mediaTarget: 'GUILD_BANNER' as any,
      scope: GUILD_ID,
      reason: 'Uygunsuz ortam afişi',
    });

    expect(prismaMock.guild.update).toHaveBeenCalledWith({
      where: { id: GUILD_ID },
      data: { bannerUrl: null, bannerAnimatedUrl: null }, // C19: hareketli alan da düşer
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('mediaTarget=GUILD_ICON → dto.scope=guildId; guild.iconUrl null yapılır (ikon takedown da bu yoldan)', async () => {
    await service.createAction(MOD_ID, {
      targetUserId: TARGET_ID,
      type: 'MEDIA_REMOVE',
      mediaTarget: 'GUILD_ICON' as any,
      scope: GUILD_ID,
      reason: 'Uygunsuz ortam ikonu',
    });

    expect(prismaMock.guild.update).toHaveBeenCalledWith({
      where: { id: GUILD_ID },
      data: { iconUrl: null, iconAnimatedUrl: null }, // C19: hareketli alan da düşer
    });
  });

  it('GUILD_BANNER için scope verilmezse → BadRequestException SCOPE_REQUIRED', async () => {
    await expect(
      service.createAction(MOD_ID, {
        targetUserId: TARGET_ID,
        type: 'MEDIA_REMOVE',
        mediaTarget: 'GUILD_BANNER' as any,
        reason: 'scope yok',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'SCOPE_REQUIRED' }),
    });
  });

  it('MEDIA_REMOVE → AuditLog yazılır (diğer aksiyonlar gibi; mesaj CONTENT_REMOVE yolu etkilenmez)', async () => {
    await service.createAction(MOD_ID, {
      targetUserId: TARGET_ID,
      type: 'MEDIA_REMOVE',
      mediaTarget: 'USER_AVATAR' as any,
      reason: 'Uygunsuz avatar',
    });

    expect(prismaMock.moderationAction.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = prismaMock.auditLog.create.mock.calls[0][0];
    expect(auditCall.data.action).toBe('moderation.media_remove');
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
    guildMemberRole: { findMany: jest.fn() },
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
      { planSend: jest.fn().mockResolvedValue({ encrypted: false }), planEdit: jest.fn() } as any,
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
    msgPrisma.guildMemberRole.findMany.mockResolvedValue([]);
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

  it('sender aktif BAN → canDm false (DM_NOT_ALLOWED)', async () => {
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

  it('sender aktif BAN → canSendFriendRequest false (USER_NOT_FOUND jenerik)', async () => {
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

describe('ModerationModuleService aksiyon hedefi + yaptirimsiz kapatma (2026-11-12)', () => {
  let service: ModerationModuleService;
  const base = {
    reason: 'SPAM',
    description: null,
    status: 'OPEN',
    priority: 0,
    contextSnapshot: {},
    reporterId: 'r1',
    createdAt: new Date('2026-11-12T10:00:00Z'),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prismaMock));
    service = new ModerationModuleService(prismaMock as any);
  });

  it('kuyruk targetUserId: USER → hedef, MESSAGE → kanit yazari ya da mesaj yazari, CHANNEL → null', async () => {
    prismaMock.report.findMany.mockResolvedValue([
      { ...base, id: 'u', targetType: 'USER', targetId: 'user-9', evidence: [] },
      {
        ...base,
        id: 'm-ev',
        targetType: 'MESSAGE',
        targetId: 'msg-1',
        evidence: [
          { verified: true, isTarget: false, authorId: 'baglam-yazari' },
          { verified: true, isTarget: true, authorId: 'yazar-1' },
        ],
      },
      { ...base, id: 'm-eski', targetType: 'MESSAGE', targetId: 'msg-2', evidence: [] },
      { ...base, id: 'm-yok', targetType: 'MESSAGE', targetId: 'msg-3', evidence: [] },
      { ...base, id: 'k', targetType: 'CHANNEL', targetId: 'ch-1', evidence: [] },
    ]);
    prismaMock.message.findMany.mockResolvedValue([{ id: 'msg-2', authorId: 'yazar-2' }]);

    const result = await service.getQueue();

    // Kanıtta yazar olan mesaj için ek sorgu yok; yalnız kanıtsız mesajlar sorulur.
    expect(prismaMock.message.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['msg-2', 'msg-3'] },
    });
    expect(result.map((r) => [r.id, r.targetUserId])).toEqual([
      ['u', 'user-9'],
      ['m-ev', 'yazar-1'],
      ['m-eski', 'yazar-2'],
      ['m-yok', null],
      ['k', null],
    ]);
  });

  it('dismiss: yalniz acik sikayet DISMISSED olur, kanit 90 gun sonra silinir, denetim yazilir', async () => {
    prismaMock.report.updateMany.mockResolvedValue({ count: 1 });
    const before = Date.now();

    const result = await service.dismissReport('mod-1', 'rep-1');

    expect(result).toEqual({ id: 'rep-1', status: 'DISMISSED' });
    const call = prismaMock.report.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'rep-1', status: { in: ['OPEN', 'TRIAGED'] } });
    expect(call.data.status).toBe('DISMISSED');
    expect(call.data.resolvedById).toBe('mod-1');
    const days =
      (call.data.evidencePurgeAt.getTime() - call.data.resolvedAt.getTime()) / 86_400_000;
    expect(days).toBe(90);
    expect(call.data.resolvedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(prismaMock.auditLog.create.mock.calls[0][0].data).toMatchObject({
      actorId: 'mod-1',
      action: 'report.dismiss',
      entityType: 'Report',
      entityId: 'rep-1',
    });
  });

  it('dismiss: kapali sikayet 409, olmayan sikayet 404; ikisinde de denetim yazilmaz', async () => {
    prismaMock.report.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.report.findUnique.mockResolvedValueOnce({ id: 'rep-1' });
    await expect(service.dismissReport('mod-1', 'rep-1')).rejects.toMatchObject({ status: 409 });

    prismaMock.report.findUnique.mockResolvedValueOnce(null);
    await expect(service.dismissReport('mod-1', 'yok')).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});
