import { BadRequestException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { VoiceService } from './voice.service';

// ── LiveKit SDK mock ───────────────────────────────────────────────────────────
// jest.mock fabrikası yalnız `mock` önekli dış değişkene erişebilir.
const mockAddGrant = jest.fn();
const mockToJwt = jest.fn().mockResolvedValue('jwt-token');
const mockReceive = jest.fn();
const mockListParticipants = jest.fn();
const mockUpdateParticipant = jest.fn();
const mockRemoveParticipant = jest.fn();
let lastAccessTokenOpts: any = null;

jest.mock('livekit-server-sdk', () => ({
  AccessToken: jest.fn().mockImplementation((_k: string, _s: string, opts: any) => {
    lastAccessTokenOpts = opts;
    return { addGrant: mockAddGrant, toJwt: mockToJwt };
  }),
  WebhookReceiver: jest.fn().mockImplementation(() => ({ receive: mockReceive })),
  RoomServiceClient: jest.fn().mockImplementation(() => ({
    listParticipants: mockListParticipants,
    updateParticipant: mockUpdateParticipant,
    removeParticipant: mockRemoveParticipant,
  })),
  TrackSource: { MICROPHONE: 'MICROPHONE' },
}));

// ── Diğer mock'lar ───────────────────────────────────────────────────────────
const prismaMock = {
  user: { findUnique: jest.fn() },
  guildMember: { findUnique: jest.fn() },
  channel: { findFirst: jest.fn() },
  channelMember: { findFirst: jest.fn() },
  voiceSession: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  voiceMute: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const membershipMock = { requireChannelAccess: jest.fn(), requireNoDmBlock: jest.fn() };
const permissionsMock = { hasGuildPermission: jest.fn() };
const realtimeMock = { emitToRoom: jest.fn(), emitToUsers: jest.fn(), emitToVoicePresence: jest.fn() };
const dmPermissionMock = { canDm: jest.fn() };

function makeConfig(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    'livekit.apiKey': 'KEY',
    'livekit.apiSecret': 'SECRET',
    'livekit.url': 'wss://test.livekit.cloud',
    quarantineHours: 24,
    ...overrides,
  };
  return { get: (k: string) => values[k] };
}

function makeService(config = makeConfig()) {
  return new VoiceService(
    config as any,
    prismaMock as any,
    membershipMock as any,
    permissionsMock as any,
    realtimeMock as any,
    dmPermissionMock as any,
  );
}

const USER_ID = 'user-1';
const CHANNEL_ID = 'chan-1';
const GUILD_ID = 'guild-1';

function voiceChannel(overrides: Record<string, unknown> = {}) {
  return { id: CHANNEL_ID, type: 'GUILD_VOICE', guildId: GUILD_ID, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  lastAccessTokenOpts = null;
  mockToJwt.mockResolvedValue('jwt-token');
  prismaMock.user.findUnique.mockResolvedValue({ username: 'ali', avatarUrl: null });
});

// ── VOICE_DISABLED ───────────────────────────────────────────────────────────
describe('VoiceService — env eksik', () => {
  it('LiveKit env yoksa mintToken 503 VOICE_DISABLED', async () => {
    const svc = makeService(makeConfig({ 'livekit.apiKey': undefined, 'livekit.apiSecret': undefined, 'livekit.url': undefined }));
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toMatchObject({ response: { error: 'VOICE_DISABLED' } });
  });
});

// ── mintToken kapıları ───────────────────────────────────────────────────────
describe('VoiceService.mintToken', () => {
  it('kanal GUILD_VOICE değilse → NOT_VOICE_CHANNEL', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ type: 'GUILD_TEXT' }));
    const svc = makeService();
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toMatchObject({ response: { error: 'NOT_VOICE_CHANNEL' } });
  });

  it('erişim kapısı hatası sapmadan yayılır (AGE_RESTRICTED)', async () => {
    membershipMock.requireChannelAccess.mockRejectedValue(
      Object.assign(new Error('age'), { response: { error: 'AGE_RESTRICTED' } }),
    );
    const svc = makeService();
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toMatchObject({ response: { error: 'AGE_RESTRICTED' } });
  });

  it('yerleşik üye → canPublish=true, audio-only grant (yalnız mikrofon), token+url döner', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel());
    // joinedAt 48 saat önce → cutoff'tan önce → yerleşik
    prismaMock.guildMember.findUnique.mockResolvedValue({ joinedAt: new Date(Date.now() - 48 * 3600 * 1000) });

    const svc = makeService();
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res).toEqual({ token: 'jwt-token', url: 'wss://test.livekit.cloud', canPublish: true, bitrate: 64 });
    expect(mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        roomJoin: true,
        room: CHANNEL_ID,
        canSubscribe: true,
        canPublish: true,
        canPublishData: false,
        canPublishSources: ['MICROPHONE'],
      }),
    );
    expect(lastAccessTokenOpts).toMatchObject({ identity: USER_ID, name: 'ali' });
  });

  it('karantinadaki üye (yeni katıldı) → canPublish=false', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel());
    prismaMock.guildMember.findUnique.mockResolvedValue({ joinedAt: new Date(Date.now() - 1 * 3600 * 1000) }); // 1 saat önce

    const svc = makeService();
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublish).toBe(false);
    expect(mockAddGrant).toHaveBeenCalledWith(expect.objectContaining({ canPublish: false, canSubscribe: true }));
  });

  it('quarantineHours=0 → karantina kapalı → yeni üye bile canPublish=true', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel());
    prismaMock.guildMember.findUnique.mockResolvedValue({ joinedAt: new Date() });

    const svc = makeService(makeConfig({ quarantineHours: 0 }));
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);
    expect(res.canPublish).toBe(true);
  });
});

// ── DM/grup sesli arama kapısı (Sprint V2 DM call) ────────────────────────────
describe('VoiceService.mintToken — DM/grup', () => {
  it('1-1 DM, arkadaş (canDm allowed) → token + canPublish=true', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ type: 'DM', guildId: null }));
    membershipMock.requireNoDmBlock.mockResolvedValue(undefined);
    prismaMock.channelMember.findFirst.mockResolvedValue({ userId: 'other-1' });
    dmPermissionMock.canDm.mockResolvedValue({ allowed: true });

    const svc = makeService();
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(dmPermissionMock.canDm).toHaveBeenCalledWith(USER_ID, 'other-1');
    expect(res.canPublish).toBe(true);
    expect(res.token).toBe('jwt-token');
  });

  it('1-1 DM, canDm reddederse → DM_NOT_ALLOWED (token üretilmez)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ type: 'DM', guildId: null }));
    membershipMock.requireNoDmBlock.mockResolvedValue(undefined);
    prismaMock.channelMember.findFirst.mockResolvedValue({ userId: 'other-1' });
    dmPermissionMock.canDm.mockResolvedValue({ allowed: false, reason: 'DM_NOT_ALLOWED' });

    const svc = makeService();
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toMatchObject({ response: { error: 'DM_NOT_ALLOWED' } });
  });

  it('1-1 DM, block (requireNoDmBlock fırlatır) → yayılır, canDm çağrılmaz', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ type: 'DM', guildId: null }));
    membershipMock.requireNoDmBlock.mockRejectedValue(
      Object.assign(new Error('block'), { response: { error: 'DM_NOT_ALLOWED' } }),
    );

    const svc = makeService();
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toMatchObject({ response: { error: 'DM_NOT_ALLOWED' } });
    expect(dmPermissionMock.canDm).not.toHaveBeenCalled();
  });

  it('GROUP_DM → block kontrolü yeter, per-pair canDm YOK → canPublish=true', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ type: 'GROUP_DM', guildId: null }));
    membershipMock.requireNoDmBlock.mockResolvedValue(undefined);

    const svc = makeService();
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(dmPermissionMock.canDm).not.toHaveBeenCalled();
    expect(res.canPublish).toBe(true);
  });
});

// ── Webhook ──────────────────────────────────────────────────────────────────
describe('VoiceService.handleWebhook', () => {
  it('geçersiz imza → UnauthorizedException', async () => {
    mockReceive.mockRejectedValue(new Error('bad sig'));
    const svc = makeService();
    await expect(svc.handleWebhook('{}', 'bad')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('participant_joined → açık session yoksa oluşturur + WS yayar', async () => {
    mockReceive.mockResolvedValue({
      event: 'participant_joined',
      room: { name: CHANNEL_ID },
      participant: { identity: USER_ID, name: 'ali', metadata: JSON.stringify({ avatarUrl: 'a.png' }) },
    });
    prismaMock.voiceSession.findFirst.mockResolvedValue(null);

    const svc = makeService();
    await svc.handleWebhook('{}', 'auth');

    expect(prismaMock.voiceSession.create).toHaveBeenCalledWith({ data: { channelId: CHANNEL_ID, userId: USER_ID } });
    expect(realtimeMock.emitToRoom).toHaveBeenCalledWith(CHANNEL_ID, 'voice.participant_joined', {
      channelId: CHANNEL_ID,
      participant: { userId: USER_ID, username: 'ali', avatarUrl: 'a.png' },
    });
  });

  it('participant_joined idempotent → açık session varsa create ETMEZ', async () => {
    mockReceive.mockResolvedValue({
      event: 'participant_joined',
      room: { name: CHANNEL_ID },
      participant: { identity: USER_ID, name: 'ali', metadata: undefined },
    });
    prismaMock.voiceSession.findFirst.mockResolvedValue({ id: 'vs-1' });

    const svc = makeService();
    await svc.handleWebhook('{}', 'auth');

    expect(prismaMock.voiceSession.create).not.toHaveBeenCalled();
    expect(realtimeMock.emitToRoom).toHaveBeenCalled(); // yayın yine de gider
  });

  it('participant_left → en son açık session kapanır + WS yayar', async () => {
    mockReceive.mockResolvedValue({
      event: 'participant_left',
      room: { name: CHANNEL_ID },
      participant: { identity: USER_ID },
    });
    prismaMock.voiceSession.findFirst.mockResolvedValue({ id: 'vs-9' });

    const svc = makeService();
    await svc.handleWebhook('{}', 'auth');

    expect(prismaMock.voiceSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'vs-9' }, data: expect.objectContaining({ leftAt: expect.any(Date) }) }),
    );
    expect(realtimeMock.emitToRoom).toHaveBeenCalledWith(CHANNEL_ID, 'voice.participant_left', {
      channelId: CHANNEL_ID,
      userId: USER_ID,
    });
  });

  it('room_finished → odanin tum acik sessionlar kapanir', async () => {
    mockReceive.mockResolvedValue({ event: 'room_finished', room: { name: CHANNEL_ID } });

    const svc = makeService();
    await svc.handleWebhook('{}', 'auth');

    expect(prismaMock.voiceSession.updateMany).toHaveBeenCalledWith({
      where: { channelId: CHANNEL_ID, leftAt: null },
      data: expect.objectContaining({ leftAt: expect.any(Date) }),
    });
  });

  it('işleme hatası yutulur (fırlatmaz) — LiveKit retry fırtınası olmasın', async () => {
    mockReceive.mockResolvedValue({
      event: 'participant_joined',
      room: { name: CHANNEL_ID },
      participant: { identity: USER_ID, name: 'ali' },
    });
    prismaMock.voiceSession.findFirst.mockResolvedValue(null);
    prismaMock.voiceSession.create.mockRejectedValue(new Error('db down'));

    const svc = makeService();
    await expect(svc.handleWebhook('{}', 'auth')).resolves.toBeUndefined();
  });
});

// ── R11: mintToken mute-check ─────────────────────────────────────────────────
describe('VoiceService.mintToken — R11 server-mute', () => {
  it('VoiceMute kaydı varsa → canPublish=false (karantina değil, kalıcı mute)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel());
    // Yerleşik üye (yoksa zaten false dönerdi) ama mute var → false
    prismaMock.guildMember.findUnique.mockResolvedValue({ joinedAt: new Date(Date.now() - 48 * 3600 * 1000) });
    prismaMock.voiceMute.findUnique.mockResolvedValue({ id: 'vm-1' });

    const svc = makeService();
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);
    expect(res.canPublish).toBe(false);
  });

  it('VoiceMute yoksa → resolveCanPublish ile karantinaya saygı', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel());
    prismaMock.guildMember.findUnique.mockResolvedValue({ joinedAt: new Date(Date.now() - 48 * 3600 * 1000) });
    prismaMock.voiceMute.findUnique.mockResolvedValue(null);

    const svc = makeService();
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);
    expect(res.canPublish).toBe(true);
  });
});

// ── R11: Sustur ───────────────────────────────────────────────────────────────
const TARGET_ID = 'target-9';
function gvChannel(overrides: Record<string, unknown> = {}) {
  return { id: CHANNEL_ID, type: 'GUILD_VOICE', guildId: GUILD_ID, ...overrides };
}

describe('VoiceService.muteParticipant', () => {
  beforeEach(() => {
    prismaMock.channel.findFirst.mockResolvedValue(gvChannel());
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
  });

  it('GUILD_VOICE değilse → NOT_VOICE_CHANNEL', async () => {
    prismaMock.channel.findFirst.mockResolvedValue(gvChannel({ type: 'GUILD_TEXT' }));
    const svc = makeService();
    await expect(svc.muteParticipant(USER_ID, CHANNEL_ID, TARGET_ID)).rejects.toMatchObject({
      response: { error: 'NOT_VOICE_CHANNEL' },
    });
  });

  it('kanal yoksa → CHANNEL_NOT_FOUND', async () => {
    prismaMock.channel.findFirst.mockResolvedValue(null);
    const svc = makeService();
    await expect(svc.muteParticipant(USER_ID, CHANNEL_ID, TARGET_ID)).rejects.toMatchObject({
      response: { error: 'CHANNEL_NOT_FOUND' },
    });
  });

  it('yetki yoksa → 403 FORBIDDEN', async () => {
    permissionsMock.hasGuildPermission.mockResolvedValue(false);
    const svc = makeService();
    await expect(svc.muteParticipant(USER_ID, CHANNEL_ID, TARGET_ID)).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
    expect(permissionsMock.hasGuildPermission).toHaveBeenCalledWith(USER_ID, GUILD_ID, 'MUTE_MEMBERS');
  });

  it('hedef = actor → CANNOT_MUTE_SELF', async () => {
    const svc = makeService();
    await expect(svc.muteParticipant(USER_ID, CHANNEL_ID, USER_ID)).rejects.toMatchObject({
      response: { error: 'CANNOT_MUTE_SELF' },
    });
  });

  it('hedef OWNER → CANNOT_MUTE_OWNER', async () => {
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'OWNER' });
    const svc = makeService();
    await expect(svc.muteParticipant(USER_ID, CHANNEL_ID, TARGET_ID)).rejects.toMatchObject({
      response: { error: 'CANNOT_MUTE_OWNER' },
    });
  });

  it('başarı → upsert + LiveKit canPublish=false + socket voice.participant_muted', async () => {
    const svc = makeService();
    await svc.muteParticipant(USER_ID, CHANNEL_ID, TARGET_ID);

    expect(prismaMock.voiceMute.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { channelId_userId: { channelId: CHANNEL_ID, userId: TARGET_ID } },
        create: { channelId: CHANNEL_ID, userId: TARGET_ID, guildId: GUILD_ID, mutedById: USER_ID },
      }),
    );
    expect(mockUpdateParticipant).toHaveBeenCalledWith(
      CHANNEL_ID,
      TARGET_ID,
      undefined,
      expect.objectContaining({ canPublish: false, canSubscribe: true, canPublishData: false }),
    );
    expect(realtimeMock.emitToRoom).toHaveBeenCalledWith(CHANNEL_ID, 'voice.participant_muted', {
      channelId: CHANNEL_ID,
      userId: TARGET_ID,
    });
  });

  it('LiveKit updateParticipant hatası yutulur (best-effort) — kayıt yine de yazılır', async () => {
    mockUpdateParticipant.mockRejectedValue(new Error('not connected'));
    const svc = makeService();
    await expect(svc.muteParticipant(USER_ID, CHANNEL_ID, TARGET_ID)).resolves.toBeUndefined();
    expect(prismaMock.voiceMute.upsert).toHaveBeenCalled();
    expect(realtimeMock.emitToRoom).toHaveBeenCalled();
  });
});

// ── R11: Susturmayı kaldır ──────────────────────────────────────────────────────
describe('VoiceService.unmuteParticipant', () => {
  beforeEach(() => {
    prismaMock.channel.findFirst.mockResolvedValue(gvChannel());
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
  });

  it('yetki yoksa → 403 FORBIDDEN, kayıt silinmez', async () => {
    permissionsMock.hasGuildPermission.mockResolvedValue(false);
    const svc = makeService();
    await expect(svc.unmuteParticipant(USER_ID, CHANNEL_ID, TARGET_ID)).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
    expect(prismaMock.voiceMute.deleteMany).not.toHaveBeenCalled();
  });

  it('başarı → kayıt silinir + canPublish=resolveCanPublish (karantinaya saygı, kör true DEĞİL)', async () => {
    // Hedef yeni katılmış (karantinada) → resolveCanPublish false döner
    prismaMock.guildMember.findUnique.mockResolvedValue({ joinedAt: new Date(), role: 'MEMBER' });
    const svc = makeService();
    await svc.unmuteParticipant(USER_ID, CHANNEL_ID, TARGET_ID);

    expect(prismaMock.voiceMute.deleteMany).toHaveBeenCalledWith({
      where: { channelId: CHANNEL_ID, userId: TARGET_ID },
    });
    expect(mockUpdateParticipant).toHaveBeenCalledWith(
      CHANNEL_ID,
      TARGET_ID,
      undefined,
      expect.objectContaining({ canPublish: false, canSubscribe: true }),
    );
    expect(realtimeMock.emitToRoom).toHaveBeenCalledWith(CHANNEL_ID, 'voice.participant_unmuted', {
      channelId: CHANNEL_ID,
      userId: TARGET_ID,
    });
  });

  it('yerleşik üye → unmute sonrası canPublish=true', async () => {
    prismaMock.guildMember.findUnique.mockResolvedValue({
      joinedAt: new Date(Date.now() - 48 * 3600 * 1000),
      role: 'MEMBER',
    });
    const svc = makeService();
    await svc.unmuteParticipant(USER_ID, CHANNEL_ID, TARGET_ID);
    expect(mockUpdateParticipant).toHaveBeenCalledWith(
      CHANNEL_ID,
      TARGET_ID,
      undefined,
      expect.objectContaining({ canPublish: true }),
    );
  });
});

// ── R11: Taşı ───────────────────────────────────────────────────────────────────
const TARGET_CHANNEL_ID = 'chan-2';
describe('VoiceService.moveParticipant', () => {
  function targetChannel(overrides: Record<string, unknown> = {}) {
    return { id: TARGET_CHANNEL_ID, type: 'GUILD_VOICE', guildId: GUILD_ID, userLimit: 0, ...overrides };
  }
  beforeEach(() => {
    // 1. çağrı: kaynak (requireGuildVoiceChannel), 2. çağrı: hedef
    prismaMock.channel.findFirst
      .mockResolvedValueOnce(gvChannel())
      .mockResolvedValueOnce(targetChannel());
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
    mockListParticipants.mockResolvedValue([]);
  });

  it('yetki yoksa → 403 FORBIDDEN', async () => {
    permissionsMock.hasGuildPermission.mockResolvedValue(false);
    const svc = makeService();
    await expect(svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
    expect(permissionsMock.hasGuildPermission).toHaveBeenCalledWith(USER_ID, GUILD_ID, 'MOVE_MEMBERS');
  });

  it('hedef = kaynak → SAME_CHANNEL', async () => {
    const svc = makeService();
    await expect(svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'SAME_CHANNEL' },
    });
  });

  it('hedef = actor → CANNOT_MOVE_SELF', async () => {
    const svc = makeService();
    await expect(svc.moveParticipant(USER_ID, CHANNEL_ID, USER_ID, TARGET_CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'CANNOT_MOVE_SELF' },
    });
  });

  it('hedef kanal yok → CHANNEL_NOT_FOUND', async () => {
    prismaMock.channel.findFirst.mockReset();
    prismaMock.channel.findFirst.mockResolvedValueOnce(gvChannel()).mockResolvedValueOnce(null);
    const svc = makeService();
    await expect(svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'CHANNEL_NOT_FOUND' },
    });
  });

  it('hedef başka guild → CHANNEL_NOT_FOUND (sızıntı yok)', async () => {
    prismaMock.channel.findFirst.mockReset();
    prismaMock.channel.findFirst
      .mockResolvedValueOnce(gvChannel())
      .mockResolvedValueOnce(targetChannel({ guildId: 'other-guild' }));
    const svc = makeService();
    await expect(svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'CHANNEL_NOT_FOUND' },
    });
  });

  it('hedef GUILD_VOICE değil → NOT_VOICE_CHANNEL', async () => {
    prismaMock.channel.findFirst.mockReset();
    prismaMock.channel.findFirst
      .mockResolvedValueOnce(gvChannel())
      .mockResolvedValueOnce(targetChannel({ type: 'GUILD_TEXT' }));
    const svc = makeService();
    await expect(svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'NOT_VOICE_CHANNEL' },
    });
  });

  it('hedef OWNER → CANNOT_MOVE_OWNER', async () => {
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'OWNER' });
    const svc = makeService();
    await expect(svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'CANNOT_MOVE_OWNER' },
    });
  });

  it('hedef dolu (userLimit) → CHANNEL_FULL', async () => {
    prismaMock.channel.findFirst.mockReset();
    prismaMock.channel.findFirst
      .mockResolvedValueOnce(gvChannel())
      .mockResolvedValueOnce(targetChannel({ userLimit: 2 }));
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
    mockListParticipants.mockResolvedValue([{ identity: 'a' }, { identity: 'b' }]);
    const svc = makeService();
    await expect(svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'CHANNEL_FULL' },
    });
  });

  it('başarı → removeParticipant(kaynak) + socket voice.moved YALNIZ taşınan kullanıcıya', async () => {
    const svc = makeService();
    await svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID);

    expect(mockRemoveParticipant).toHaveBeenCalledWith(CHANNEL_ID, TARGET_ID);
    expect(realtimeMock.emitToUsers).toHaveBeenCalledWith([TARGET_ID], 'voice.moved', {
      fromChannelId: CHANNEL_ID,
      toChannelId: TARGET_CHANNEL_ID,
    });
    // kitleye gitmez
    expect(realtimeMock.emitToRoom).not.toHaveBeenCalled();
  });

  it('removeParticipant hatası yutulur (best-effort) — yönlendirme event yine gider', async () => {
    mockRemoveParticipant.mockRejectedValue(new Error('not connected'));
    const svc = makeService();
    await expect(svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID)).resolves.toBeUndefined();
    expect(realtimeMock.emitToUsers).toHaveBeenCalled();
  });
});
