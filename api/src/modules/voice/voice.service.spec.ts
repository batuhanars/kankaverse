import { BadRequestException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { VoiceService } from './voice.service';

// ── LiveKit SDK mock ───────────────────────────────────────────────────────────
// jest.mock fabrikası yalnız `mock` önekli dış değişkene erişebilir.
const mockAddGrant = jest.fn();
const mockToJwt = jest.fn().mockResolvedValue('jwt-token');
const mockReceive = jest.fn();
const mockListParticipants = jest.fn();
let lastAccessTokenOpts: any = null;

jest.mock('livekit-server-sdk', () => ({
  AccessToken: jest.fn().mockImplementation((_k: string, _s: string, opts: any) => {
    lastAccessTokenOpts = opts;
    return { addGrant: mockAddGrant, toJwt: mockToJwt };
  }),
  WebhookReceiver: jest.fn().mockImplementation(() => ({ receive: mockReceive })),
  RoomServiceClient: jest.fn().mockImplementation(() => ({ listParticipants: mockListParticipants })),
  TrackSource: { MICROPHONE: 'MICROPHONE' },
}));

// ── Diğer mock'lar ───────────────────────────────────────────────────────────
const prismaMock = {
  user: { findUnique: jest.fn() },
  guildMember: { findUnique: jest.fn() },
  channelMember: { findFirst: jest.fn() },
  voiceSession: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const membershipMock = { requireChannelAccess: jest.fn(), requireNoDmBlock: jest.fn() };
const permissionsMock = { hasGuildPermission: jest.fn() };
const realtimeMock = { emitToRoom: jest.fn() };
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

    expect(res).toEqual({ token: 'jwt-token', url: 'wss://test.livekit.cloud', canPublish: true });
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
