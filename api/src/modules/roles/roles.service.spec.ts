import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GuildRole } from '@prisma/client';
import { RolesService } from './roles.service';

// ── Mock fabrikaları ──────────────────────────────────────────────────────────

const prismaMock = {
  role: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    aggregate: jest.fn(),
  },
  guildMember: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  guildMemberRole: {
    count: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const membershipMock = {
  requireGuildMembership: jest.fn(),
};

const realtimeMock = {
  emitToUsers: jest.fn(),
  emitToUser: jest.fn(),
  emitToRoom: jest.fn(),
};

const permissionsMock = {
  hasGuildPermission: jest.fn().mockResolvedValue(true),
  effectivePermissions: jest.fn().mockResolvedValue({ all: true, flags: new Set() }),
  requireMemberHierarchy: jest.fn().mockResolvedValue(undefined),
  requireRoleHierarchy: jest.fn().mockResolvedValue(undefined),
};

function makeService() {
  return new RolesService(
    prismaMock as any,
    membershipMock as any,
    permissionsMock as any,
    realtimeMock as any,
  );
}

function resetMocks() {
  jest.resetAllMocks();
  permissionsMock.hasGuildPermission.mockResolvedValue(true);
  permissionsMock.effectivePermissions.mockResolvedValue({ all: true, flags: new Set() });
  permissionsMock.requireMemberHierarchy.mockResolvedValue(undefined);
  permissionsMock.requireRoleHierarchy.mockResolvedValue(undefined);
}

// ── Sabit fixture'lar ─────────────────────────────────────────────────────────

const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const MEMBER_ID = 'user-member';
const GUILD_ID = 'guild-abc';
const ROLE_ID = 'role-xyz';

const GUILD_FIXTURE = {
  id: GUILD_ID,
  name: 'Test Ortamı',
  ownerId: OWNER_ID,
  adultsOnly: false,
  iconUrl: null,
  description: null,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const OWNER_MEMBERSHIP = { guildId: GUILD_ID, userId: OWNER_ID, role: GuildRole.OWNER };
const ADMIN_MEMBERSHIP = { guildId: GUILD_ID, userId: ADMIN_ID, role: GuildRole.ADMIN };
const MEMBER_MEMBERSHIP = { guildId: GUILD_ID, userId: MEMBER_ID, role: GuildRole.MEMBER };

const ROLE_FIXTURE = {
  id: ROLE_ID,
  guildId: GUILD_ID,
  name: 'Moderatör',
  color: '#FF5733',
  position: 1,
  hoist: false,
  mentionable: false,
  permissions: ['VIEW_CHANNELS'],
  iconUrl: null,
  isEveryone: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const EVERYONE_ROLE_FIXTURE = {
  ...ROLE_FIXTURE,
  id: 'role-everyone',
  name: '@everyone',
  position: 0,
  isEveryone: true,
  permissions: ['VIEW_CHANNELS', 'CREATE_INVITE', 'CHANGE_NICKNAME'],
};

// ── RolesService.createRole ───────────────────────────────────────────────────

describe('RolesService.createRole', () => {
  let service: RolesService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.guildMember.findMany.mockResolvedValue([]); // guildMemberIds
  });

  it('OWNER → rol oluşturulur, RoleDto döner', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.role.aggregate.mockResolvedValue({ _max: { position: 0 } });
    prismaMock.role.create.mockResolvedValue({ ...ROLE_FIXTURE, position: 1 });
    prismaMock.guildMemberRole.count.mockResolvedValue(0);

    const result = await service.createRole(OWNER_ID, GUILD_ID, { name: 'Moderatör' });

    expect(result).toMatchObject({ name: 'Moderatör', guildId: GUILD_ID, position: 1, memberCount: 0 });
    expect(prismaMock.role.create).toHaveBeenCalledTimes(1);
  });

  it('ADMIN → rol oluşturabilir', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: ADMIN_MEMBERSHIP,
    });
    prismaMock.role.aggregate.mockResolvedValue({ _max: { position: 1 } });
    prismaMock.role.create.mockResolvedValue({ ...ROLE_FIXTURE, position: 2 });
    prismaMock.guildMemberRole.count.mockResolvedValue(0);

    const result = await service.createRole(ADMIN_ID, GUILD_ID, { name: 'Yardımcı' });
    expect(result.position).toBe(2);
  });

  it('MEMBER → ForbiddenException FORBIDDEN', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: MEMBER_MEMBERSHIP,
    });
    permissionsMock.hasGuildPermission.mockResolvedValue(false);

    await expect(service.createRole(MEMBER_ID, GUILD_ID, { name: 'Deneme' })).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'FORBIDDEN' }),
    });
    expect(prismaMock.role.create).not.toHaveBeenCalled();
  });

  // ── F1 (R7): "sahip olmadığın izni veremezsin" (Discord kuralı) ──────────────
  it('MANAGE_ROLES olan MEMBER sahip olmadığı ADMINISTRATOR\'ı veremez → 403 CANNOT_GRANT_PERMISSION', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: MEMBER_MEMBERSHIP,
    });
    permissionsMock.hasGuildPermission.mockResolvedValue(true); // MANAGE_ROLES var
    permissionsMock.effectivePermissions.mockResolvedValue({
      all: false,
      flags: new Set(['MANAGE_ROLES', 'KICK_MEMBERS']),
    });
    prismaMock.role.aggregate.mockResolvedValue({ _max: { position: 1 } });

    await expect(
      service.createRole(MEMBER_ID, GUILD_ID, { name: 'Sahte Admin', permissions: ['ADMINISTRATOR'] }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ error: 'CANNOT_GRANT_PERMISSION' }) });
    expect(prismaMock.role.create).not.toHaveBeenCalled();
  });

  it('MANAGE_ROLES olan MEMBER yalnız KENDİ sahip olduğu bayrağı verebilir → geçer', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: MEMBER_MEMBERSHIP,
    });
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
    permissionsMock.effectivePermissions.mockResolvedValue({
      all: false,
      flags: new Set(['MANAGE_ROLES', 'KICK_MEMBERS']),
    });
    prismaMock.role.aggregate.mockResolvedValue({ _max: { position: 1 } });
    prismaMock.role.create.mockResolvedValue({ ...ROLE_FIXTURE, position: 2, permissions: ['KICK_MEMBERS'] });
    prismaMock.guildMemberRole.count.mockResolvedValue(0);

    const result = await service.createRole(MEMBER_ID, GUILD_ID, { name: 'Atıcı', permissions: ['KICK_MEMBERS'] });
    expect(result.position).toBe(2);
    expect(prismaMock.role.create).toHaveBeenCalledTimes(1);
  });

  it('bilinmeyen permissions bayrakları filtrelenir', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.role.aggregate.mockResolvedValue({ _max: { position: 0 } });
    prismaMock.guildMemberRole.count.mockResolvedValue(0);

    const capturedData: Record<string, unknown>[] = [];
    prismaMock.role.create.mockImplementation((args: { data: Record<string, unknown> }) => {
      capturedData.push(args.data);
      return Promise.resolve({ ...ROLE_FIXTURE, permissions: args.data.permissions });
    });

    await service.createRole(OWNER_ID, GUILD_ID, {
      name: 'Test',
      permissions: ['VIEW_CHANNELS', 'UNKNOWN_FLAG', 'CREATE_INVITE'],
    });

    expect(capturedData[0].permissions).toEqual(['VIEW_CHANNELS', 'CREATE_INVITE']);
  });

  it('position = mevcut max + 1', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.role.aggregate.mockResolvedValue({ _max: { position: 5 } });
    prismaMock.guildMemberRole.count.mockResolvedValue(0);
    prismaMock.role.create.mockResolvedValue({ ...ROLE_FIXTURE, position: 6 });

    const result = await service.createRole(OWNER_ID, GUILD_ID, { name: 'Yeni' });
    expect(result.position).toBe(6);

    const createCall = prismaMock.role.create.mock.calls[0][0];
    expect(createCall.data.position).toBe(6);
  });

  it('rol oluşturulunca guild.role_created realtime eventi yayılır', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.role.aggregate.mockResolvedValue({ _max: { position: 0 } });
    prismaMock.role.create.mockResolvedValue(ROLE_FIXTURE);
    prismaMock.guildMember.findMany.mockResolvedValue([{ userId: OWNER_ID }, { userId: MEMBER_ID }]);
    prismaMock.guildMemberRole.count.mockResolvedValue(0);

    await service.createRole(OWNER_ID, GUILD_ID, { name: 'Moderatör' });

    expect(realtimeMock.emitToUsers).toHaveBeenCalledWith(
      [OWNER_ID, MEMBER_ID],
      'guild.role_created',
      expect.objectContaining({ id: ROLE_ID }),
    );
  });
});

// ── RolesService.deleteRole ───────────────────────────────────────────────────

describe('RolesService.deleteRole', () => {
  let service: RolesService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.guildMember.findMany.mockResolvedValue([]);
  });

  it('@everyone rolü silinemez → BadRequestException CANNOT_DELETE_EVERYONE', async () => {
    prismaMock.role.findUnique.mockResolvedValue(EVERYONE_ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });

    await expect(service.deleteRole(OWNER_ID, 'role-everyone')).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'CANNOT_DELETE_EVERYONE' }),
    });
    expect(prismaMock.role.delete).not.toHaveBeenCalled();
  });

  it('OWNER → normal rolü siler; null döner', async () => {
    prismaMock.role.findUnique.mockResolvedValue(ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.role.delete.mockResolvedValue({});

    const result = await service.deleteRole(OWNER_ID, ROLE_ID);
    expect(result).toBeNull();
    expect(prismaMock.role.delete).toHaveBeenCalledWith({ where: { id: ROLE_ID } });
  });

  it('MEMBER → ForbiddenException FORBIDDEN', async () => {
    prismaMock.role.findUnique.mockResolvedValue(ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: MEMBER_MEMBERSHIP,
    });
    permissionsMock.hasGuildPermission.mockResolvedValue(false);

    await expect(service.deleteRole(MEMBER_ID, ROLE_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'FORBIDDEN' }),
    });
  });

  it('rol bulunamadı → NotFoundException ROLE_NOT_FOUND', async () => {
    prismaMock.role.findUnique.mockResolvedValue(null);

    await expect(service.deleteRole(OWNER_ID, 'nonexistent')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('silme başarılı → guild.role_deleted realtime eventi yayılır', async () => {
    prismaMock.role.findUnique.mockResolvedValue(ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.guildMember.findMany.mockResolvedValue([{ userId: OWNER_ID }]);
    prismaMock.role.delete.mockResolvedValue({});

    await service.deleteRole(OWNER_ID, ROLE_ID);

    expect(realtimeMock.emitToUsers).toHaveBeenCalledWith(
      [OWNER_ID],
      'guild.role_deleted',
      { roleId: ROLE_ID },
    );
  });
});

// ── RolesService.assignRole ───────────────────────────────────────────────────

describe('RolesService.assignRole', () => {
  let service: RolesService;

  const MEMBER_GM = {
    id: 'gm-member',
    guildId: GUILD_ID,
    userId: MEMBER_ID,
    role: GuildRole.MEMBER,
    user: { id: MEMBER_ID, username: 'kanka42', avatarUrl: null },
    roleLinks: [],
  };

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.guildMember.findMany.mockResolvedValue([]);
  });

  it('OWNER → üyeye rol atar; güncel üye DTO döner (roles dahil)', async () => {
    prismaMock.role.findUnique.mockResolvedValue(ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce(MEMBER_GM)
      .mockResolvedValueOnce({
        ...MEMBER_GM,
        roleLinks: [{ role: ROLE_FIXTURE }],
      });
    prismaMock.guildMemberRole.upsert.mockResolvedValue({});

    const result = await service.assignRole(OWNER_ID, ROLE_ID, MEMBER_ID);

    expect(result.userId).toBe(MEMBER_ID);
    expect(result.roles).toHaveLength(1);
    expect(result.roles[0].id).toBe(ROLE_ID);
  });

  it('@everyone rolü atanırsa → BadRequestException CANNOT_ASSIGN_EVERYONE', async () => {
    prismaMock.role.findUnique.mockResolvedValue(EVERYONE_ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });

    await expect(service.assignRole(OWNER_ID, 'role-everyone', MEMBER_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'CANNOT_ASSIGN_EVERYONE' }),
    });
    expect(prismaMock.guildMemberRole.upsert).not.toHaveBeenCalled();
  });

  it('hedef guild üyesi değil → NotFoundException NOT_GUILD_MEMBER', async () => {
    prismaMock.role.findUnique.mockResolvedValue(ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.guildMember.findUnique.mockResolvedValue(null);

    await expect(service.assignRole(OWNER_ID, ROLE_ID, 'ghost')).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'NOT_GUILD_MEMBER' }),
    });
  });

  it('upsert idempotent — zaten atanmış → hata fırlatılmaz', async () => {
    prismaMock.role.findUnique.mockResolvedValue(ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce(MEMBER_GM)
      .mockResolvedValueOnce({ ...MEMBER_GM, roleLinks: [{ role: ROLE_FIXTURE }] });
    prismaMock.guildMemberRole.upsert.mockResolvedValue({});

    await expect(service.assignRole(OWNER_ID, ROLE_ID, MEMBER_ID)).resolves.toBeDefined();
    expect(prismaMock.guildMemberRole.upsert).toHaveBeenCalledTimes(1);
  });

  it('atama başarılı → guild.member_updated realtime eventi yayılır', async () => {
    prismaMock.role.findUnique.mockResolvedValue(ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce(MEMBER_GM)
      .mockResolvedValueOnce({ ...MEMBER_GM, roleLinks: [{ role: ROLE_FIXTURE }] });
    prismaMock.guildMemberRole.upsert.mockResolvedValue({});
    prismaMock.guildMember.findMany.mockResolvedValue([{ userId: OWNER_ID }, { userId: MEMBER_ID }]);

    await service.assignRole(OWNER_ID, ROLE_ID, MEMBER_ID);

    expect(realtimeMock.emitToUsers).toHaveBeenCalledWith(
      expect.arrayContaining([OWNER_ID, MEMBER_ID]),
      'guild.member_updated',
      expect.objectContaining({ guildId: GUILD_ID }),
    );
  });

  it('üye hiyerarşisi ihlali → 403 MEMBER_HIERARCHY (aktör hedeften düşük)', async () => {
    prismaMock.role.findUnique.mockResolvedValue(ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: ADMIN_MEMBERSHIP,
    });
    // roleHierarchy geçer, memberHierarchy ihlal eder
    permissionsMock.requireRoleHierarchy.mockResolvedValue(undefined);
    permissionsMock.requireMemberHierarchy.mockRejectedValueOnce(
      new ForbiddenException({ message: 'Üye hiyerarşisi ihlali.', error: 'MEMBER_HIERARCHY' }),
    );
    prismaMock.guildMember.findUnique.mockResolvedValueOnce(MEMBER_GM);

    await expect(service.assignRole(ADMIN_ID, ROLE_ID, MEMBER_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'MEMBER_HIERARCHY' }),
    });
    expect(prismaMock.guildMemberRole.upsert).not.toHaveBeenCalled();
  });
});

// ── RolesService.removeRole ───────────────────────────────────────────────────

describe('RolesService.removeRole', () => {
  let service: RolesService;

  const MEMBER_GM = {
    id: 'gm-member',
    guildId: GUILD_ID,
    userId: MEMBER_ID,
    role: GuildRole.MEMBER,
    user: { id: MEMBER_ID, username: 'kanka42', avatarUrl: null },
    roleLinks: [{ role: ROLE_FIXTURE }],
  };

  const MEMBER_GM_AFTER_REMOVE = {
    ...MEMBER_GM,
    roleLinks: [],
  };

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.guildMember.findMany.mockResolvedValue([]);
  });

  it('OWNER → rolü çıkarır; güncel üye DTO döner (roles boş)', async () => {
    prismaMock.role.findUnique.mockResolvedValue(ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce({ id: MEMBER_GM.id, guildId: GUILD_ID, userId: MEMBER_ID, role: GuildRole.MEMBER })
      .mockResolvedValueOnce(MEMBER_GM_AFTER_REMOVE);
    prismaMock.guildMemberRole.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.removeRole(OWNER_ID, ROLE_ID, MEMBER_ID);

    expect(result.userId).toBe(MEMBER_ID);
    expect(result.username).toBe('kanka42');
    expect(result.roles).toHaveLength(0);
  });

  it('realtime guild.member_updated — tam DTO (username dahil) yayılır', async () => {
    prismaMock.role.findUnique.mockResolvedValue(ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce({ id: MEMBER_GM.id, guildId: GUILD_ID, userId: MEMBER_ID, role: GuildRole.MEMBER })
      .mockResolvedValueOnce(MEMBER_GM_AFTER_REMOVE);
    prismaMock.guildMemberRole.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.guildMember.findMany.mockResolvedValue([{ userId: OWNER_ID }, { userId: MEMBER_ID }]);

    await service.removeRole(OWNER_ID, ROLE_ID, MEMBER_ID);

    expect(realtimeMock.emitToUsers).toHaveBeenCalledWith(
      expect.arrayContaining([OWNER_ID, MEMBER_ID]),
      'guild.member_updated',
      expect.objectContaining({
        guildId: GUILD_ID,
        member: expect.objectContaining({ username: 'kanka42' }),
      }),
    );
  });

  it('@everyone rolü çıkarılamaz → BadRequestException CANNOT_ASSIGN_EVERYONE', async () => {
    prismaMock.role.findUnique.mockResolvedValue(EVERYONE_ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });

    await expect(service.removeRole(OWNER_ID, 'role-everyone', MEMBER_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'CANNOT_ASSIGN_EVERYONE' }),
    });
    expect(prismaMock.guildMemberRole.deleteMany).not.toHaveBeenCalled();
  });

  it('hedef guild üyesi değil → NotFoundException NOT_GUILD_MEMBER', async () => {
    prismaMock.role.findUnique.mockResolvedValue(ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.guildMember.findUnique.mockResolvedValue(null);

    await expect(service.removeRole(OWNER_ID, ROLE_ID, 'ghost')).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'NOT_GUILD_MEMBER' }),
    });
  });

  it('deleteMany idempotent — kayıt yoksa hata fırlatılmaz', async () => {
    prismaMock.role.findUnique.mockResolvedValue(ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce({ id: MEMBER_GM.id, guildId: GUILD_ID, userId: MEMBER_ID, role: GuildRole.MEMBER })
      .mockResolvedValueOnce(MEMBER_GM_AFTER_REMOVE);
    prismaMock.guildMemberRole.deleteMany.mockResolvedValue({ count: 0 }); // zaten yoktu

    await expect(service.removeRole(OWNER_ID, ROLE_ID, MEMBER_ID)).resolves.toBeDefined();
    expect(prismaMock.guildMemberRole.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('MEMBER aktör → ForbiddenException FORBIDDEN', async () => {
    prismaMock.role.findUnique.mockResolvedValue(ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: MEMBER_MEMBERSHIP,
    });
    permissionsMock.hasGuildPermission.mockResolvedValue(false);

    await expect(service.removeRole(MEMBER_ID, ROLE_ID, OWNER_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'FORBIDDEN' }),
    });
  });

  it('üye hiyerarşisi ihlali → 403 MEMBER_HIERARCHY (aktör hedeften düşük)', async () => {
    prismaMock.role.findUnique.mockResolvedValue(ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: ADMIN_MEMBERSHIP,
    });
    // roleHierarchy geçer, memberHierarchy ihlal eder
    permissionsMock.requireRoleHierarchy.mockResolvedValue(undefined);
    permissionsMock.requireMemberHierarchy.mockRejectedValueOnce(
      new ForbiddenException({ message: 'Üye hiyerarşisi ihlali.', error: 'MEMBER_HIERARCHY' }),
    );
    prismaMock.guildMember.findUnique.mockResolvedValueOnce({
      id: MEMBER_GM.id,
      guildId: GUILD_ID,
      userId: MEMBER_ID,
      role: GuildRole.MEMBER,
    });

    await expect(service.removeRole(ADMIN_ID, ROLE_ID, MEMBER_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'MEMBER_HIERARCHY' }),
    });
    expect(prismaMock.guildMemberRole.deleteMany).not.toHaveBeenCalled();
  });
});

// ── RolesService.listRoles — getMembers roles[] entegrasyon ──────────────────

describe('RolesService.listRoles', () => {
  let service: RolesService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('üye → rolleri listeler; position DESC sırasında döner', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: MEMBER_MEMBERSHIP,
    });
    prismaMock.role.findMany.mockResolvedValue([ROLE_FIXTURE, EVERYONE_ROLE_FIXTURE]);
    prismaMock.guildMemberRole.count.mockResolvedValue(3);

    const result = await service.listRoles(MEMBER_ID, GUILD_ID);

    expect(result).toHaveLength(2);
    expect(result[0].memberCount).toBe(3);
  });

  it('guild üyesi değil → ForbiddenException (membership service fırlatır)', async () => {
    membershipMock.requireGuildMembership.mockRejectedValue(
      new ForbiddenException({ message: 'Erişim yok.', error: 'FORBIDDEN' }),
    );

    await expect(service.listRoles('stranger', GUILD_ID)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prismaMock.role.findMany).not.toHaveBeenCalled();
  });
});

// ── RolesService.updateRole — @everyone kısıtlamaları ───────────────────────

describe('RolesService.updateRole — @everyone kısıtlamaları', () => {
  let service: RolesService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.guildMember.findMany.mockResolvedValue([]);
    prismaMock.guildMemberRole.count.mockResolvedValue(0);
  });

  it('@everyone rolünün adı değiştirilemez → CANNOT_EDIT_EVERYONE_NAME', async () => {
    prismaMock.role.findUnique.mockResolvedValue(EVERYONE_ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });

    await expect(
      service.updateRole(OWNER_ID, 'role-everyone', { name: 'Yeni Ad' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'CANNOT_EDIT_EVERYONE_NAME' }),
    });
    expect(prismaMock.role.update).not.toHaveBeenCalled();
  });

  it('@everyone rolünün hoist değiştirilemez → CANNOT_EDIT_EVERYONE_HOIST', async () => {
    prismaMock.role.findUnique.mockResolvedValue(EVERYONE_ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });

    await expect(
      service.updateRole(OWNER_ID, 'role-everyone', { hoist: true }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'CANNOT_EDIT_EVERYONE_HOIST' }),
    });
  });

  it('@everyone rolünün color ve permissions güncellenebilir', async () => {
    prismaMock.role.findUnique.mockResolvedValue(EVERYONE_ROLE_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.role.update.mockResolvedValue({
      ...EVERYONE_ROLE_FIXTURE,
      color: '#FFFFFF',
      permissions: ['VIEW_CHANNELS'],
    });

    const result = await service.updateRole(OWNER_ID, 'role-everyone', {
      color: '#FFFFFF',
      permissions: ['VIEW_CHANNELS'],
    });

    expect(result.color).toBe('#FFFFFF');
    expect(prismaMock.role.update).toHaveBeenCalledTimes(1);
  });
});

// ── RolesService.reorderRoles ────────────────────────────────────────────────

describe('RolesService.reorderRoles', () => {
  let service: RolesService;

  const ROLE_FIXTURE_2 = {
    ...ROLE_FIXTURE,
    id: 'role-two',
    name: 'Yardımcı',
    position: 2,
  };

  beforeEach(() => {
    resetMocks();
    service = makeService();
    // guildMemberIds için varsayılan
    prismaMock.guildMember.findMany.mockResolvedValue([{ userId: OWNER_ID }, { userId: MEMBER_ID }]);
    // $transaction: gelen array'deki promise'leri çalıştırır
    prismaMock.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
    // role.update: güncel role fixture döndür
    prismaMock.role.update.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === ROLE_ID) return Promise.resolve(ROLE_FIXTURE);
      return Promise.resolve(ROLE_FIXTURE_2);
    });
    prismaMock.guildMemberRole.count.mockResolvedValue(0);
  });

  it('(a) OWNER → pozisyonlar güncellenir, null döner', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });
    // findMany (geçerli roller — isEveryone: false)
    prismaMock.role.findMany
      .mockResolvedValueOnce([{ id: ROLE_ID }, { id: ROLE_FIXTURE_2.id }]) // validRoles (select: { id })
      .mockResolvedValueOnce([ROLE_FIXTURE, ROLE_FIXTURE_2]); // re-fetch for realtime

    const items = [
      { id: ROLE_ID, position: 0 },
      { id: ROLE_FIXTURE_2.id, position: 1 },
    ];

    const result = await service.reorderRoles(OWNER_ID, GUILD_ID, items);

    expect(result).toBeNull();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.role.update).toHaveBeenCalledTimes(2);
    expect(realtimeMock.emitToUsers).toHaveBeenCalledWith(
      expect.arrayContaining([OWNER_ID, MEMBER_ID]),
      'guild.role_updated',
      expect.objectContaining({ id: ROLE_ID }),
    );
  });

  it('(b) @everyone item geçilse bile filtrelenir — pozisyonu DEĞİŞMEZ', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: OWNER_MEMBERSHIP,
    });
    // findMany ile geçerli roller — @everyone hariç yalnız ROLE_ID döndü
    prismaMock.role.findMany
      .mockResolvedValueOnce([{ id: ROLE_ID }]) // validRoles: @everyone ID yok
      .mockResolvedValueOnce([ROLE_FIXTURE]); // re-fetch

    const items = [
      { id: ROLE_ID, position: 3 },
      { id: EVERYONE_ROLE_FIXTURE.id, position: 0 }, // @everyone — filtrelenmeli
    ];

    const result = await service.reorderRoles(OWNER_ID, GUILD_ID, items);

    expect(result).toBeNull();
    // Yalnız ROLE_ID güncellendi, @everyone için update çağrılmadı
    expect(prismaMock.role.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.role.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ROLE_ID }, data: { position: 3 } }),
    );
    expect(prismaMock.role.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: EVERYONE_ROLE_FIXTURE.id } }),
    );
  });

  it('(c) MEMBER aktör → ForbiddenException FORBIDDEN fırlatır', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: MEMBER_MEMBERSHIP,
    });
    permissionsMock.hasGuildPermission.mockResolvedValue(false);

    await expect(
      service.reorderRoles(MEMBER_ID, GUILD_ID, [{ id: ROLE_ID, position: 1 }]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'FORBIDDEN' }),
    });

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.role.update).not.toHaveBeenCalled();
  });
});
