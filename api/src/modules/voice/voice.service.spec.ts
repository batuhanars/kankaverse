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
  TrackSource: {
    MICROPHONE: 'MICROPHONE',
    CAMERA: 'CAMERA',
    SCREEN_SHARE: 'SCREEN_SHARE',
    SCREEN_SHARE_AUDIO: 'SCREEN_SHARE_AUDIO',
  },
}));

// ── Diğer mock'lar ───────────────────────────────────────────────────────────
const prismaMock = {
  user: { findUnique: jest.fn(), count: jest.fn() },
  guildMember: { findUnique: jest.fn() },
  guild: { findUnique: jest.fn() },
  channel: { findFirst: jest.fn(), findUnique: jest.fn() },
  channelMember: { findFirst: jest.fn(), findMany: jest.fn() },
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
  auditLog: { create: jest.fn() },
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
    // Sprint C4: BUILD-DARK — testlerde varsayılan kapalı; video testi için override gerekir
    cameraEnabled: false,
    screenEnabled: false,
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

function voiceChannel(overrides: { adultsOnly?: boolean } & Record<string, unknown> = {}) {
  const { adultsOnly, ...rest } = overrides;
  return {
    id: CHANNEL_ID,
    type: 'GUILD_VOICE',
    guildId: GUILD_ID,
    guild: adultsOnly !== undefined ? { adultsOnly } : { adultsOnly: false },
    ...rest,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  lastAccessTokenOpts = null;
  mockToJwt.mockResolvedValue('jwt-token');
  // isMinor: false → varsayılan yetişkin; video testleri override eder
  prismaMock.user.findUnique.mockResolvedValue({ username: 'ali', avatarUrl: null, isMinor: false });
  // video yokken voiceMute varsayılan null (server-mute yok)
  prismaMock.voiceMute.findUnique.mockResolvedValue(null);
  // guild varsayılan: adultsOnly=false (normal kanal)
  prismaMock.guild.findUnique.mockResolvedValue({ adultsOnly: false });
  // user.count varsayılan: minör yok (GROUP_DM testleri override eder)
  prismaMock.user.count.mockResolvedValue(0);
  // channelMember.findMany varsayılan: boş (GROUP_DM testleri override eder)
  prismaMock.channelMember.findMany.mockResolvedValue([]);
  // auditLog varsayılan: başarılı (R11B audit testleri)
  prismaMock.auditLog.create.mockResolvedValue({});
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

  it('yerleşik üye → canPublish=true, audio-only grant (yalnız mikrofon), token+url döner; bayraklar false → canPublishCamera/Screen=false', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel());
    // joinedAt 48 saat önce → cutoff'tan önce → yerleşik
    prismaMock.guildMember.findUnique.mockResolvedValue({ joinedAt: new Date(Date.now() - 48 * 3600 * 1000) });

    const svc = makeService(); // cameraEnabled/screenEnabled=false (BUILD-DARK varsayılan)
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    // Sprint C4: canPublishCamera/Screen eklendi (bayraklar false → false)
    expect(res).toEqual({
      token: 'jwt-token',
      url: 'wss://test.livekit.cloud',
      canPublish: true,
      bitrate: 64,
      canPublishCamera: false,
      canPublishScreen: false,
    });
    expect(mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        roomJoin: true,
        room: CHANNEL_ID,
        canSubscribe: true,
        canPublish: true,
        canPublishData: false,
        // BUILD-DARK: bayraklar false → yalnız MICROPHONE (audio-only birebir)
        canPublishSources: ['MICROPHONE'],
      }),
    );
    expect(lastAccessTokenOpts).toMatchObject({ identity: USER_ID, name: 'ali' });
  });

  it('yeni katılan üye → ses-mic karantinası KALDIRILDI → canPublish=true', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel());
    prismaMock.guildMember.findUnique.mockResolvedValue({ joinedAt: new Date() }); // az önce katıldı

    const svc = makeService();
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublish).toBe(true);
    expect(mockAddGrant).toHaveBeenCalledWith(expect.objectContaining({ canPublish: true, canSubscribe: true }));
  });

  it('üyelik yoksa (guildMember null) → canPublish=false (güvenli taraf)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel());
    prismaMock.guildMember.findUnique.mockResolvedValue(null);

    const svc = makeService();
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);
    expect(res.canPublish).toBe(false);
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

// ── Sprint C4: resolveVideoSources + mintToken video entegrasyonu ─────────────
// §F: contract'ın tüm test senaryoları.

/** Video etkin config (her iki bayrak açık) */
function videoConfig(overrides: Record<string, unknown> = {}) {
  return makeConfig({ cameraEnabled: true, screenEnabled: true, ...overrides });
}

/** Yerleşik GUILD_VOICE — ageGated, adultsOnly verilene kadar video YOK */
function settledMember() {
  return { joinedAt: new Date(Date.now() - 48 * 3600 * 1000), role: 'MEMBER' };
}

describe('VoiceService — resolveVideoSources (Sprint C4, §F)', () => {
  // §F: bayraklar false → canPublishSources yalnız [MICROPHONE] (audio-only birebir, en kritik regresyon)
  it('bayraklar false (BUILD-DARK) → canPublishSources yalnız [MICROPHONE], canPublishCamera/Screen=false', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ ageGated: true }));
    prismaMock.guildMember.findUnique.mockResolvedValue(settledMember());

    const svc = makeService(); // cameraEnabled=false, screenEnabled=false (varsayılan)
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublishCamera).toBe(false);
    expect(res.canPublishScreen).toBe(false);
    expect(mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({ canPublishSources: ['MICROPHONE'] }),
    );
  });

  // §F: normal kanal (ageGated=false, adultsOnly=false) → video yok
  it('GUILD_VOICE normal kanal (ageGated=false, adultsOnly=false) → video grant yok', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ ageGated: false }));
    prismaMock.guildMember.findUnique.mockResolvedValue(settledMember());
    prismaMock.guild.findUnique.mockResolvedValue({ adultsOnly: false });

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublishCamera).toBe(false);
    expect(res.canPublishScreen).toBe(false);
    expect(mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({ canPublishSources: ['MICROPHONE'] }),
    );
  });

  // §F: ageGated kanal, yetişkin → video var
  it('GUILD_VOICE ageGated=true, yetişkin → canPublishCamera+Screen=true', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ ageGated: true }));
    prismaMock.guildMember.findUnique.mockResolvedValue(settledMember());

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublishCamera).toBe(true);
    expect(res.canPublishScreen).toBe(true);
    expect(mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        canPublishSources: expect.arrayContaining(['MICROPHONE', 'CAMERA', 'SCREEN_SHARE', 'SCREEN_SHARE_AUDIO']),
      }),
    );
  });

  // §F: adultsOnly guild, normal kanal (ageGated=false) → video var (guild-seviyesi kapı)
  it('GUILD_VOICE adultsOnly=true guild, ageGated=false kanal → video var', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ ageGated: false, adultsOnly: true }));
    prismaMock.guildMember.findUnique.mockResolvedValue(settledMember());

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublishCamera).toBe(true);
    expect(res.canPublishScreen).toBe(true);
  });

  // §F: ageGated kanal, minör → video [] (mutlak ret)
  it('GUILD_VOICE ageGated=true, minör → video [] (isMinor mutlak ret)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ ageGated: true }));
    prismaMock.guildMember.findUnique.mockResolvedValue(settledMember());
    // Her iki user.findUnique çağrısı (mintToken + resolveVideoSources) minör döner
    prismaMock.user.findUnique.mockResolvedValue({ username: 'ali', avatarUrl: null, isMinor: true });

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublishCamera).toBe(false);
    expect(res.canPublishScreen).toBe(false);
    expect(mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({ canPublishSources: ['MICROPHONE'] }),
    );
  });

  // §F: ses-mic karantinası kaldırıldı → YENİ üye de ageGated yetişkin bağlamında video açabilir
  it('GUILD_VOICE ageGated=true, YENİ üye (karantina yok) → canPublish=true + video açık', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ ageGated: true }));
    prismaMock.guildMember.findUnique.mockResolvedValue({ joinedAt: new Date(), role: 'MEMBER' }); // az önce katıldı

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublish).toBe(true);
    expect(res.canPublishCamera).toBe(true);
    expect(res.canPublishScreen).toBe(true);
    expect(mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        canPublishSources: expect.arrayContaining(['MICROPHONE', 'CAMERA', 'SCREEN_SHARE']),
      }),
    );
  });

  // §F: server-mute → video düşer
  it('GUILD_VOICE ageGated=true, server-mute → video düşer', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ ageGated: true }));
    prismaMock.guildMember.findUnique.mockResolvedValue(settledMember());
    prismaMock.voiceMute.findUnique.mockResolvedValue({ id: 'vm-1' }); // mute var

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublish).toBe(false); // mintToken mute kontrolü
    expect(res.canPublishCamera).toBe(false);
    expect(res.canPublishScreen).toBe(false);
    expect(mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({ canPublishSources: ['MICROPHONE'] }),
    );
  });

  // §F: DM iki-taraf-yetişkin → video var
  it('DM, iki taraf yetişkin → video var', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ type: 'DM', guildId: null }));
    membershipMock.requireNoDmBlock.mockResolvedValue(undefined);
    prismaMock.channelMember.findFirst.mockResolvedValue({ userId: 'other-1' });
    dmPermissionMock.canDm.mockResolvedValue({ allowed: true });
    // Her user.findUnique çağrısı yetişkin döner (hem kendisi hem diğer)
    prismaMock.user.findUnique.mockResolvedValue({ username: 'ali', avatarUrl: null, isMinor: false });

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublishCamera).toBe(true);
    expect(res.canPublishScreen).toBe(true);
  });

  // §F: DM minör↔yetişkin → audio var, video yok
  it('DM, karşı taraf minör → audio var, video []', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ type: 'DM', guildId: null }));
    membershipMock.requireNoDmBlock.mockResolvedValue(undefined);
    prismaMock.channelMember.findFirst.mockResolvedValue({ userId: 'other-1' });
    dmPermissionMock.canDm.mockResolvedValue({ allowed: true });
    // Sorgu sırası (DM, video etkin):
    //  1. resolveVideoSources: self isMinor check → false (yetişkin)
    //  2. resolveVideoSources: other user isMinor → true (minör) → video kapısı kapanır
    //  3. mintToken: user metadata fetch → yetişkin
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ isMinor: false })                             // resolveVideoSources self
      .mockResolvedValueOnce({ isMinor: true })                              // resolveVideoSources other
      .mockResolvedValueOnce({ username: 'ali', avatarUrl: null, isMinor: false }); // mintToken metadata

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublish).toBe(true); // audio var
    expect(res.canPublishCamera).toBe(false);
    expect(res.canPublishScreen).toBe(false);
  });

  // §F: GROUP_DM, bir minör üye → video []
  it('GROUP_DM, bir üye minör → video []', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ type: 'GROUP_DM', guildId: null }));
    membershipMock.requireNoDmBlock.mockResolvedValue(undefined);
    prismaMock.channelMember.findMany.mockResolvedValue([
      { userId: 'u1' },
      { userId: 'u2' },
      { userId: 'u3-minor' },
    ]);
    prismaMock.user.count.mockResolvedValue(1); // 1 minör var

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublish).toBe(true); // audio var
    expect(res.canPublishCamera).toBe(false);
    expect(res.canPublishScreen).toBe(false);
  });

  // §F: GROUP_DM, tüm üyeler yetişkin → video var
  it('GROUP_DM, tüm üyeler yetişkin → video var', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ type: 'GROUP_DM', guildId: null }));
    membershipMock.requireNoDmBlock.mockResolvedValue(undefined);
    prismaMock.channelMember.findMany.mockResolvedValue([
      { userId: 'u1' },
      { userId: 'u2' },
    ]);
    prismaMock.user.count.mockResolvedValue(0); // minör yok

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublishCamera).toBe(true);
    expect(res.canPublishScreen).toBe(true);
  });

  // §F: kamera açık / ekran kapalı → yalnız CAMERA (SCREEN_SHARE yok)
  it('cameraEnabled=true, screenEnabled=false → yalnız CAMERA (ekran yok), ageGated kanal', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ ageGated: true }));
    prismaMock.guildMember.findUnique.mockResolvedValue(settledMember());

    const svc = makeService(makeConfig({ cameraEnabled: true, screenEnabled: false }));
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublishCamera).toBe(true);
    expect(res.canPublishScreen).toBe(false);

    // canPublishSources: MICROPHONE + CAMERA, SCREEN_SHARE yok
    const grantCall = mockAddGrant.mock.calls[0][0] as { canPublishSources: string[] };
    expect(grantCall.canPublishSources).toContain('MICROPHONE');
    expect(grantCall.canPublishSources).toContain('CAMERA');
    expect(grantCall.canPublishSources).not.toContain('SCREEN_SHARE');
    expect(grantCall.canPublishSources).not.toContain('SCREEN_SHARE_AUDIO');
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

  it('başarı → kayıt silinir + canPublish=resolveCanPublish (üyelik var → true)', async () => {
    // Karantina kaldırıldı: üye (yeni de olsa) → resolveCanPublish true → unmute sonrası konuşabilir
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
      expect.objectContaining({ canPublish: true, canSubscribe: true }),
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

// ── R11B: B1 Teftiş-girişi (mintToken bypass matrisi) ────────────────────────
describe('VoiceService.mintToken — B1 teftiş-girişi bypass matrisi (R7)', () => {
  // Özel kanalda NOT_CHANNEL_MEMBER fırlatan requireChannelAccess mock yardımcısı
  function mockNotChannelMember() {
    membershipMock.requireChannelAccess.mockRejectedValue(
      Object.assign(new Error('not member'), { response: { error: 'NOT_CHANNEL_MEMBER' } }),
    );
  }

  // Özel kanalı doğrudan çeken channel.findFirst mock'u (bypass path'i için)
  function mockRawChannel(overrides: Record<string, unknown> = {}) {
    prismaMock.channel.findFirst.mockResolvedValue({
      id: CHANNEL_ID,
      type: 'GUILD_VOICE',
      guildId: GUILD_ID,
      isPrivate: true,
      userLimit: 0,
      bitrate: 64,
      ageGated: false,
      guild: { adultsOnly: false },
      deletedAt: null,
      ...overrides,
    });
  }

  it('AGE_RESTRICTED → ASLA bypass edilmez, mod da giremez (yaş kapısı invariantı)', async () => {
    membershipMock.requireChannelAccess.mockRejectedValue(
      Object.assign(new Error('age'), { response: { error: 'AGE_RESTRICTED' } }),
    );
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
    const svc = makeService();
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'AGE_RESTRICTED' },
    });
    // channel.findFirst veya hasGuildPermission çağrılmamış olmalı (erken ret)
    expect(prismaMock.channel.findFirst).not.toHaveBeenCalled();
  });

  it('NOT_CHANNEL_MEMBER + MUTE_MEMBERS YOK → hata aynen fırlatılır (yetkisiz giremez)', async () => {
    mockNotChannelMember();
    mockRawChannel();
    permissionsMock.hasGuildPermission.mockResolvedValue(false);
    const svc = makeService();
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'NOT_CHANNEL_MEMBER' },
    });
  });

  it('NOT_CHANNEL_MEMBER + MUTE_MEMBERS VAR → bypass ile giriş (token üretilir)', async () => {
    mockNotChannelMember();
    mockRawChannel();
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
    // Yerleşik üye gibi davranması için (resolveCanPublish → OWNER/ADMIN bypass veya karantina geçmiş)
    prismaMock.guildMember.findUnique.mockResolvedValue({ joinedAt: new Date(Date.now() - 48 * 3600 * 1000), role: 'MEMBER' });

    const svc = makeService();
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);
    expect(res.token).toBe('jwt-token');
    // AuditLog yazılmış olmalı (voice.inspect)
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: USER_ID,
          action: 'voice.inspect',
          entityType: 'channel',
          entityId: CHANNEL_ID,
          metadata: expect.objectContaining({ guildId: GUILD_ID }),
        }),
      }),
    );
  });

  it('NOT_CHANNEL_MEMBER + MUTE_MEMBERS VAR + kanal doluysa → enforceUserLimit MUTE_MEMBERS bypass ile aşılır', async () => {
    mockNotChannelMember();
    mockRawChannel({ userLimit: 2 });
    permissionsMock.hasGuildPermission.mockResolvedValue(true); // hem MUTE_MEMBERS hem MANAGE_CHANNELS bypass
    // Oda dolu (2 katılımcı, limit=2)
    mockListParticipants.mockResolvedValue([{ identity: 'a' }, { identity: 'b' }]);
    prismaMock.guildMember.findUnique.mockResolvedValue({ joinedAt: new Date(Date.now() - 48 * 3600 * 1000), role: 'MEMBER' });

    const svc = makeService();
    // MUTE_MEMBERS bypass → dolu kanala girer (CHANNEL_FULL fırlamamalı)
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).resolves.toMatchObject({ token: 'jwt-token' });
  });

  it('normal giriş (NOT_CHANNEL_MEMBER YOK) → audit yazılmaz (sadece bypass-giriş audit\'lenir)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel());
    prismaMock.guildMember.findUnique.mockResolvedValue({ joinedAt: new Date(Date.now() - 48 * 3600 * 1000) });

    const svc = makeService();
    await svc.mintToken(USER_ID, CHANNEL_ID);
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('bypass-giriş → mod video AÇMAZ (normal kanal, resolveVideoSources [] döner)', async () => {
    mockNotChannelMember();
    // Mod sadece MUTE_MEMBERS, kanal normal (ageGated=false)
    mockRawChannel({ ageGated: false, guild: { adultsOnly: false } });
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
    prismaMock.guildMember.findUnique.mockResolvedValue({ joinedAt: new Date(Date.now() - 48 * 3600 * 1000), role: 'MEMBER' });

    const svc = makeService(makeConfig({ cameraEnabled: true, screenEnabled: true }));
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);
    // Normal kanal → video yok (ageGated=false, adultsOnly=false)
    expect(res.canPublishCamera).toBe(false);
    expect(res.canPublishScreen).toBe(false);
  });
});

// ── R11B: B2 Yayın-durdur ────────────────────────────────────────────────────
describe('VoiceService.stopBroadcast (R11B B2, R7)', () => {
  beforeEach(() => {
    prismaMock.channel.findFirst.mockResolvedValue(gvChannel());
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
  });

  it('yetki yoksa → 403 FORBIDDEN (MUTE_MEMBERS gerekli)', async () => {
    permissionsMock.hasGuildPermission.mockResolvedValue(false);
    const svc = makeService();
    await expect(svc.stopBroadcast(USER_ID, CHANNEL_ID, TARGET_ID)).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
    expect(permissionsMock.hasGuildPermission).toHaveBeenCalledWith(USER_ID, GUILD_ID, 'MUTE_MEMBERS');
  });

  it('hedef = actor → CANNOT_STOP_SELF', async () => {
    const svc = makeService();
    await expect(svc.stopBroadcast(USER_ID, CHANNEL_ID, USER_ID)).rejects.toMatchObject({
      response: { error: 'CANNOT_STOP_SELF' },
    });
  });

  it('hedef OWNER → CANNOT_STOP_OWNER', async () => {
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'OWNER' });
    const svc = makeService();
    await expect(svc.stopBroadcast(USER_ID, CHANNEL_ID, TARGET_ID)).rejects.toMatchObject({
      response: { error: 'CANNOT_STOP_OWNER' },
    });
  });

  it('başarı → updateParticipant canPublishSources=[microphone] (ses kalır, video düşer)', async () => {
    const svc = makeService();
    await svc.stopBroadcast(USER_ID, CHANNEL_ID, TARGET_ID);

    // Kritik: canPublish false YAPILMAMALI — sustur'dan farkı bu.
    expect(mockUpdateParticipant).toHaveBeenCalledWith(
      CHANNEL_ID,
      TARGET_ID,
      undefined,
      expect.objectContaining({
        canPublishSources: ['MICROPHONE'], // TrackSource.MICROPHONE mock değeri
        canSubscribe: true,
        canPublishData: false,
      }),
    );
    // canPublish alanı geçilmemiş olmalı (false değil — ses korunur)
    const callArg = mockUpdateParticipant.mock.calls[0][3] as Record<string, unknown>;
    expect(callArg).not.toHaveProperty('canPublish');
  });

  it('başarı → AuditLog voice.stop_broadcast yazılır', async () => {
    const svc = makeService();
    await svc.stopBroadcast(USER_ID, CHANNEL_ID, TARGET_ID);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: USER_ID,
          action: 'voice.stop_broadcast',
          entityType: 'channel',
          entityId: CHANNEL_ID,
          metadata: expect.objectContaining({ targetUserId: TARGET_ID }),
        }),
      }),
    );
  });

  it('başarı → WS voice.broadcast_stopped room\'a yayılır', async () => {
    const svc = makeService();
    await svc.stopBroadcast(USER_ID, CHANNEL_ID, TARGET_ID);

    expect(realtimeMock.emitToRoom).toHaveBeenCalledWith(
      CHANNEL_ID,
      'voice.broadcast_stopped',
      { channelId: CHANNEL_ID, userId: TARGET_ID },
    );
  });

  it('LiveKit hatası yutulur (best-effort) — audit + WS yine çalışır', async () => {
    mockUpdateParticipant.mockRejectedValue(new Error('not connected'));
    const svc = makeService();
    await expect(svc.stopBroadcast(USER_ID, CHANNEL_ID, TARGET_ID)).resolves.toBeUndefined();
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
    expect(realtimeMock.emitToRoom).toHaveBeenCalled();
  });
});

// ── R11B: B3 Odadan-çıkar ────────────────────────────────────────────────────
describe('VoiceService.disconnectParticipant (R11B B3, R7)', () => {
  beforeEach(() => {
    prismaMock.channel.findFirst.mockResolvedValue(gvChannel());
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
  });

  it('yetki yoksa → 403 FORBIDDEN (MOVE_MEMBERS gerekli)', async () => {
    permissionsMock.hasGuildPermission.mockResolvedValue(false);
    const svc = makeService();
    await expect(svc.disconnectParticipant(USER_ID, CHANNEL_ID, TARGET_ID)).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
    expect(permissionsMock.hasGuildPermission).toHaveBeenCalledWith(USER_ID, GUILD_ID, 'MOVE_MEMBERS');
  });

  it('hedef = actor → CANNOT_DISCONNECT_SELF', async () => {
    const svc = makeService();
    await expect(svc.disconnectParticipant(USER_ID, CHANNEL_ID, USER_ID)).rejects.toMatchObject({
      response: { error: 'CANNOT_DISCONNECT_SELF' },
    });
  });

  it('hedef OWNER → CANNOT_DISCONNECT_OWNER', async () => {
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'OWNER' });
    const svc = makeService();
    await expect(svc.disconnectParticipant(USER_ID, CHANNEL_ID, TARGET_ID)).rejects.toMatchObject({
      response: { error: 'CANNOT_DISCONNECT_OWNER' },
    });
  });

  it('başarı → removeParticipant çağrılır', async () => {
    const svc = makeService();
    await svc.disconnectParticipant(USER_ID, CHANNEL_ID, TARGET_ID);
    expect(mockRemoveParticipant).toHaveBeenCalledWith(CHANNEL_ID, TARGET_ID);
  });

  it('başarı → AuditLog voice.disconnect yazılır', async () => {
    const svc = makeService();
    await svc.disconnectParticipant(USER_ID, CHANNEL_ID, TARGET_ID);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: USER_ID,
          action: 'voice.disconnect',
          entityType: 'channel',
          entityId: CHANNEL_ID,
          metadata: expect.objectContaining({ targetUserId: TARGET_ID }),
        }),
      }),
    );
  });

  it('başarı → WS voice.kicked room\'a yayılır', async () => {
    const svc = makeService();
    await svc.disconnectParticipant(USER_ID, CHANNEL_ID, TARGET_ID);

    expect(realtimeMock.emitToRoom).toHaveBeenCalledWith(
      CHANNEL_ID,
      'voice.kicked',
      { channelId: CHANNEL_ID, userId: TARGET_ID },
    );
  });

  it('LiveKit hatası yutulur (best-effort) — audit + WS yine çalışır', async () => {
    mockRemoveParticipant.mockRejectedValue(new Error('not connected'));
    const svc = makeService();
    await expect(svc.disconnectParticipant(USER_ID, CHANNEL_ID, TARGET_ID)).resolves.toBeUndefined();
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
    expect(realtimeMock.emitToRoom).toHaveBeenCalled();
  });

  it('guild üyeliği dokunulmaz (removeParticipant yalnız ses oturumu, guildMember yok)', async () => {
    // disconnectParticipant guildMember sil veya update ÇAĞIRMAMALI
    const svc = makeService();
    await svc.disconnectParticipant(USER_ID, CHANNEL_ID, TARGET_ID);
    // prismaMock'ta guildMember.delete/update yok — mock çağrısı yoksa test geçer
    expect(prismaMock.guildMember.findUnique).toHaveBeenCalledTimes(1); // yalnız requireTargetNotOwner
  });
});
