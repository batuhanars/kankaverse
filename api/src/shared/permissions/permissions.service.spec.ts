import { ForbiddenException } from '@nestjs/common';
import { PermissionsService } from './permissions.service';

// ── Mock PrismaService ───────────────────────────────────────────────────────
const prismaMock = {
  guild: { findUnique: jest.fn() },
  guildMember: { findUnique: jest.fn() },
  role: { findFirst: jest.fn() },
};

function makeService() {
  return new PermissionsService(prismaMock as any);
}

function resetMocks() {
  jest.resetAllMocks();
}

// ── Sabit fixture'lar ────────────────────────────────────────────────────────
const GUILD_ID = 'guild-abc';
const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const MEMBER_ID = 'user-member';
const STRANGER_ID = 'user-stranger';

const GUILD = { id: GUILD_ID, ownerId: OWNER_ID, deletedAt: null };

const OWNER_MEMBERSHIP = {
  role: 'OWNER',
  roleLinks: [],
};
const ADMIN_MEMBERSHIP = {
  role: 'ADMIN',
  roleLinks: [],
};
const MEMBER_MEMBERSHIP = {
  role: 'MEMBER',
  roleLinks: [],
};

const EVERYONE_ROLE = {
  permissions: ['VIEW_CHANNELS', 'CREATE_INVITE', 'CHANGE_NICKNAME'],
};

const MANAGE_CHANNELS_ROLE_LINK = {
  role: { permissions: ['MANAGE_CHANNELS'] },
};

const ADMINISTRATOR_ROLE_LINK = {
  role: { permissions: ['ADMINISTRATOR'] },
};

// ── hasGuildPermission ───────────────────────────────────────────────────────
describe('PermissionsService.hasGuildPermission', () => {
  let service: PermissionsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('guild yok → false (fail-closed)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(null);
    expect(await service.hasGuildPermission(MEMBER_ID, GUILD_ID, 'MANAGE_CHANNELS')).toBe(false);
  });

  it('üye değil → false (fail-closed)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD);
    prismaMock.guildMember.findUnique.mockResolvedValue(null);
    expect(await service.hasGuildPermission(STRANGER_ID, GUILD_ID, 'MANAGE_CHANNELS')).toBe(false);
  });

  it('guild.ownerId === userId → true (her bayrak)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);
    expect(await service.hasGuildPermission(OWNER_ID, GUILD_ID, 'MANAGE_CHANNELS')).toBe(true);
    expect(await service.hasGuildPermission(OWNER_ID, GUILD_ID, 'BAN_MEMBERS')).toBe(true);
  });

  it('membership.role === OWNER → true', async () => {
    prismaMock.guild.findUnique.mockResolvedValue({ ...GUILD, ownerId: 'someone-else' });
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);
    expect(await service.hasGuildPermission(OWNER_ID, GUILD_ID, 'MANAGE_GUILD')).toBe(true);
  });

  it('membership.role === ADMIN (geçiş-uyum) → true (her bayrak)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD);
    prismaMock.guildMember.findUnique.mockResolvedValue(ADMIN_MEMBERSHIP);
    expect(await service.hasGuildPermission(ADMIN_ID, GUILD_ID, 'MANAGE_CHANNELS')).toBe(true);
    expect(await service.hasGuildPermission(ADMIN_ID, GUILD_ID, 'BAN_MEMBERS')).toBe(true);
  });

  it('ADMINISTRATOR bayrağı atanmış rol → true (her bayrak)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD);
    prismaMock.guildMember.findUnique.mockResolvedValue({
      role: 'MEMBER',
      roleLinks: [ADMINISTRATOR_ROLE_LINK],
    });
    prismaMock.role.findFirst.mockResolvedValue(EVERYONE_ROLE);
    expect(await service.hasGuildPermission(MEMBER_ID, GUILD_ID, 'MANAGE_CHANNELS')).toBe(true);
    expect(await service.hasGuildPermission(MEMBER_ID, GUILD_ID, 'BAN_MEMBERS')).toBe(true);
    expect(await service.hasGuildPermission(MEMBER_ID, GUILD_ID, 'KICK_MEMBERS')).toBe(true);
  });

  it('@everyone izni → üye erişir', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD);
    prismaMock.guildMember.findUnique.mockResolvedValue({
      role: 'MEMBER',
      roleLinks: [],
    });
    prismaMock.role.findFirst.mockResolvedValue({ permissions: ['VIEW_CHANNELS', 'CREATE_INVITE'] });
    expect(await service.hasGuildPermission(MEMBER_ID, GUILD_ID, 'CREATE_INVITE')).toBe(true);
  });

  it('@everyone + atanmış rol birleşimi → efektif izin doğru hesaplanır', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD);
    prismaMock.guildMember.findUnique.mockResolvedValue({
      role: 'MEMBER',
      roleLinks: [MANAGE_CHANNELS_ROLE_LINK],
    });
    prismaMock.role.findFirst.mockResolvedValue(EVERYONE_ROLE);
    expect(await service.hasGuildPermission(MEMBER_ID, GUILD_ID, 'MANAGE_CHANNELS')).toBe(true);
    expect(await service.hasGuildPermission(MEMBER_ID, GUILD_ID, 'CREATE_INVITE')).toBe(true);
    // Sahip olmadığı izin → false
    prismaMock.guild.findUnique.mockResolvedValue(GUILD);
    prismaMock.guildMember.findUnique.mockResolvedValue({
      role: 'MEMBER',
      roleLinks: [MANAGE_CHANNELS_ROLE_LINK],
    });
    prismaMock.role.findFirst.mockResolvedValue(EVERYONE_ROLE);
    expect(await service.hasGuildPermission(MEMBER_ID, GUILD_ID, 'BAN_MEMBERS')).toBe(false);
  });

  it('bilinmeyen bayrak (forward-compat) → filterKnownPermissions filtreler, fail-closed', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD);
    prismaMock.guildMember.findUnique.mockResolvedValue({
      role: 'MEMBER',
      roleLinks: [{ role: { permissions: ['UNKNOWN_FUTURE_FLAG'] } }],
    });
    prismaMock.role.findFirst.mockResolvedValue({ permissions: [] });
    // PermissionFlag tipinde olmayan bayraklar silinmeli → false
    expect(await service.hasGuildPermission(MEMBER_ID, GUILD_ID, 'MANAGE_CHANNELS')).toBe(false);
  });

  it('izni olmayan MEMBER → false', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD);
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBER_MEMBERSHIP);
    prismaMock.role.findFirst.mockResolvedValue(EVERYONE_ROLE);
    expect(await service.hasGuildPermission(MEMBER_ID, GUILD_ID, 'MANAGE_CHANNELS')).toBe(false);
    expect(await service.hasGuildPermission(MEMBER_ID, GUILD_ID, 'BAN_MEMBERS')).toBe(false);
  });
});

// ── actorHighestPosition ─────────────────────────────────────────────────────
describe('PermissionsService.actorHighestPosition', () => {
  let service: PermissionsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('OWNER → Infinity', async () => {
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'OWNER', roleLinks: [] });
    expect(await service.actorHighestPosition(OWNER_ID, GUILD_ID)).toBe(Infinity);
  });

  it('enum-ADMIN → MAX_SAFE_INTEGER (F2 geriye-uyum muafiyeti)', async () => {
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'ADMIN', roleLinks: [] });
    expect(await service.actorHighestPosition(ADMIN_ID, GUILD_ID)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('Atanmış rol yok → 0 (@everyone seviyesi)', async () => {
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'MEMBER', roleLinks: [] });
    expect(await service.actorHighestPosition(MEMBER_ID, GUILD_ID)).toBe(0);
  });

  it('Atanmış birden fazla rol → max position döner', async () => {
    prismaMock.guildMember.findUnique.mockResolvedValue({
      role: 'MEMBER',
      roleLinks: [
        { role: { position: 3 } },
        { role: { position: 7 } },
        { role: { position: 2 } },
      ],
    });
    expect(await service.actorHighestPosition(MEMBER_ID, GUILD_ID)).toBe(7);
  });

  it('Üye değil → -1', async () => {
    prismaMock.guildMember.findUnique.mockResolvedValue(null);
    expect(await service.actorHighestPosition(STRANGER_ID, GUILD_ID)).toBe(-1);
  });
});

// ── requireRoleHierarchy ─────────────────────────────────────────────────────
describe('PermissionsService.requireRoleHierarchy', () => {
  let service: PermissionsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('OWNER → muaf, exception fırlatmaz', async () => {
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'OWNER', roleLinks: [] });
    await expect(service.requireRoleHierarchy(OWNER_ID, GUILD_ID, 100)).resolves.toBeUndefined();
  });

  it('Hedef rol position < aktör en yüksek → geçer', async () => {
    prismaMock.guildMember.findUnique.mockResolvedValue({
      role: 'MEMBER',
      roleLinks: [{ role: { position: 5 } }],
    });
    await expect(service.requireRoleHierarchy(MEMBER_ID, GUILD_ID, 3)).resolves.toBeUndefined();
  });

  it('Hedef rol position === aktör en yüksek → 403 ROLE_HIERARCHY', async () => {
    prismaMock.guildMember.findUnique.mockResolvedValue({
      role: 'MEMBER',
      roleLinks: [{ role: { position: 5 } }],
    });
    await expect(service.requireRoleHierarchy(MEMBER_ID, GUILD_ID, 5)).rejects.toThrow(ForbiddenException);
    await expect(service.requireRoleHierarchy(MEMBER_ID, GUILD_ID, 5)).rejects.toMatchObject({
      response: { error: 'ROLE_HIERARCHY' },
    });
  });

  it('Hedef rol position > aktör en yüksek → 403 ROLE_HIERARCHY', async () => {
    prismaMock.guildMember.findUnique.mockResolvedValue({
      role: 'MEMBER',
      roleLinks: [{ role: { position: 3 } }],
    });
    await expect(service.requireRoleHierarchy(MEMBER_ID, GUILD_ID, 7)).rejects.toThrow(ForbiddenException);
    await expect(service.requireRoleHierarchy(MEMBER_ID, GUILD_ID, 7)).rejects.toMatchObject({
      response: { error: 'ROLE_HIERARCHY' },
    });
  });

  it('Atanmış rol yok (position=0) + hedef position=0 → 403 ROLE_HIERARCHY', async () => {
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'MEMBER', roleLinks: [] });
    await expect(service.requireRoleHierarchy(MEMBER_ID, GUILD_ID, 0)).rejects.toMatchObject({
      response: { error: 'ROLE_HIERARCHY' },
    });
  });
});

// ── requireMemberHierarchy ───────────────────────────────────────────────────
describe('PermissionsService.requireMemberHierarchy', () => {
  let service: PermissionsService;

  const TARGET_ID = 'user-target';

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('aktör OWNER → muaf, exception fırlatmaz', async () => {
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce({ role: 'MEMBER', roleLinks: [{ role: { position: 2 } }] }) // target
      .mockResolvedValueOnce({ role: 'OWNER', roleLinks: [] }); // actor
    await expect(service.requireMemberHierarchy(OWNER_ID, GUILD_ID, TARGET_ID)).resolves.toBeUndefined();
  });

  it('hedef OWNER → 403 MEMBER_HIERARCHY (asla hedef alınamaz)', async () => {
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce({ role: 'OWNER', roleLinks: [] }) // target
      .mockResolvedValueOnce({ role: 'MEMBER', roleLinks: [{ role: { position: 5 } }] }); // actor
    await expect(service.requireMemberHierarchy(MEMBER_ID, GUILD_ID, TARGET_ID)).rejects.toMatchObject({
      response: { error: 'MEMBER_HIERARCHY' },
    });
  });

  it('hedef position < aktör position → geçer', async () => {
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce({ role: 'MEMBER', roleLinks: [{ role: { position: 2 } }] }) // target
      .mockResolvedValueOnce({ role: 'MEMBER', roleLinks: [{ role: { position: 5 } }] }); // actor
    await expect(service.requireMemberHierarchy(MEMBER_ID, GUILD_ID, TARGET_ID)).resolves.toBeUndefined();
  });

  it('hedef position === aktör position → 403 MEMBER_HIERARCHY', async () => {
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce({ role: 'MEMBER', roleLinks: [{ role: { position: 5 } }] }) // target
      .mockResolvedValueOnce({ role: 'MEMBER', roleLinks: [{ role: { position: 5 } }] }); // actor
    await expect(service.requireMemberHierarchy(MEMBER_ID, GUILD_ID, TARGET_ID)).rejects.toMatchObject({
      response: { error: 'MEMBER_HIERARCHY' },
    });
  });

  it('hedef position > aktör position → 403 MEMBER_HIERARCHY', async () => {
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce({ role: 'MEMBER', roleLinks: [{ role: { position: 8 } }] }) // target
      .mockResolvedValueOnce({ role: 'MEMBER', roleLinks: [{ role: { position: 3 } }] }); // actor
    await expect(service.requireMemberHierarchy(MEMBER_ID, GUILD_ID, TARGET_ID)).rejects.toMatchObject({
      response: { error: 'MEMBER_HIERARCHY' },
    });
  });

  // ── F2: enum-ADMIN geriye-uyum (geçiş-dönemi muafiyeti) ──────────────────────
  it('enum-ADMIN aktör → rolsüz MEMBER hedefi yönetebilir (F2 geriye-uyum)', async () => {
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce({ role: 'MEMBER', roleLinks: [] }) // target (pos 0)
      .mockResolvedValueOnce({ role: 'ADMIN', roleLinks: [] }); // actor (MAX_SAFE_INTEGER)
    await expect(service.requireMemberHierarchy(ADMIN_ID, GUILD_ID, TARGET_ID)).resolves.toBeUndefined();
  });

  it('enum-ADMIN aktör → başka enum-ADMIN hedefi → 403 (eski "yönetici yöneticiyi yönetemez" korunur)', async () => {
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce({ role: 'ADMIN', roleLinks: [] }) // target (MAX)
      .mockResolvedValueOnce({ role: 'ADMIN', roleLinks: [] }); // actor (MAX) → beraberlik bloklanır
    await expect(service.requireMemberHierarchy(ADMIN_ID, GUILD_ID, TARGET_ID)).rejects.toMatchObject({
      response: { error: 'MEMBER_HIERARCHY' },
    });
  });
});

// ── effectivePermissions (F1 dayanağı) ───────────────────────────────────────
describe('PermissionsService.effectivePermissions', () => {
  let service: PermissionsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('OWNER/ADMIN/ADMINISTRATOR → all:true', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);
    expect((await service.effectivePermissions(OWNER_ID, GUILD_ID)).all).toBe(true);

    prismaMock.guildMember.findUnique.mockResolvedValue(ADMIN_MEMBERSHIP);
    expect((await service.effectivePermissions(ADMIN_ID, GUILD_ID)).all).toBe(true);

    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'MEMBER', roleLinks: [ADMINISTRATOR_ROLE_LINK] });
    prismaMock.role.findFirst.mockResolvedValue({ permissions: [] });
    expect((await service.effectivePermissions(MEMBER_ID, GUILD_ID)).all).toBe(true);
  });

  it('izinli MEMBER → all:false + flags efektif bayrakları içerir', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD);
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'MEMBER', roleLinks: [MANAGE_CHANNELS_ROLE_LINK] });
    prismaMock.role.findFirst.mockResolvedValue(EVERYONE_ROLE);
    const result = await service.effectivePermissions(MEMBER_ID, GUILD_ID);
    expect(result.all).toBe(false);
    expect(result.flags.has('MANAGE_CHANNELS')).toBe(true);
    expect(result.flags.has('CREATE_INVITE')).toBe(true);
    expect(result.flags.has('BAN_MEMBERS')).toBe(false);
  });

  it('üye değil → all:false + boş flags (fail-closed)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD);
    prismaMock.guildMember.findUnique.mockResolvedValue(null);
    const result = await service.effectivePermissions(STRANGER_ID, GUILD_ID);
    expect(result.all).toBe(false);
    expect(result.flags.size).toBe(0);
  });
});
