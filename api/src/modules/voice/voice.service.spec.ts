import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { VoiceService } from './voice.service';

// ── LiveKit SDK mock ───────────────────────────────────────────────────────────
// jest.mock fabrikası yalnız `mock` önekli dış değişkene erişebilir.
const mockAddGrant = jest.fn();
const mockToJwt = jest.fn().mockResolvedValue('jwt-token');
const mockReceive = jest.fn();
const mockListParticipants = jest.fn();
const mockUpdateParticipant = jest.fn();
const mockRemoveParticipant = jest.fn();
// §2/§4 (Sprint R19) — forceMuteTracks + refreshChannelPermissions'ın kullandığı yeni RoomServiceClient çağrıları.
const mockGetParticipant = jest.fn();
const mockMutePublishedTrack = jest.fn();
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
    getParticipant: mockGetParticipant,
    mutePublishedTrack: mockMutePublishedTrack,
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
    findMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  report: { count: jest.fn() },
};

const membershipMock = { requireChannelAccess: jest.fn(), requireNoDmBlock: jest.fn() };
const permissionsMock = { hasGuildPermission: jest.fn() };
const realtimeMock = {
  emitToRoom: jest.fn(),
  emitToUsers: jest.fn(),
  emitToVoicePresence: jest.fn(),
};
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

function voiceChannel(
  overrides: { adultsOnly?: boolean; mediaEnabled?: boolean } & Record<string, unknown> = {},
) {
  const { adultsOnly, mediaEnabled, ...rest } = overrides;
  return {
    id: CHANNEL_ID,
    type: 'GUILD_VOICE',
    guildId: GUILD_ID,
    guild: adultsOnly !== undefined ? { adultsOnly } : { adultsOnly: false },
    mediaEnabled: mediaEnabled ?? false, // C7: default false (admin açmadan medya yok)
    ...rest,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  lastAccessTokenOpts = null;
  mockToJwt.mockResolvedValue('jwt-token');
  // isMinor: false → varsayılan yetişkin; video testleri override eder
  prismaMock.user.findUnique.mockResolvedValue({
    username: 'ali',
    avatarUrl: null,
    isMinor: false,
  });
  // video yokken voiceMute varsayılan null (server-mute yok)
  prismaMock.voiceMute.findUnique.mockResolvedValue(null);
  // R16 §2: listParticipants mutedUserIds varsayılan boş (susturma testleri override eder)
  prismaMock.voiceMute.findMany.mockResolvedValue([]);
  // guild varsayılan: adultsOnly=false (normal kanal)
  prismaMock.guild.findUnique.mockResolvedValue({ adultsOnly: false });
  // user.count varsayılan: minör yok (GROUP_DM testleri override eder)
  prismaMock.user.count.mockResolvedValue(0);
  // channelMember.findMany varsayılan: boş (GROUP_DM testleri override eder)
  prismaMock.channelMember.findMany.mockResolvedValue([]);
  // auditLog varsayılan: başarılı (R11B audit testleri)
  prismaMock.auditLog.create.mockResolvedValue({});
  // §2/§4 (Sprint R19) — forceMuteTracks varsayılan: katılımcı bağlı ama track'i yok (no-op).
  // Zorla-susturma testleri override eder (tracks dolu döner).
  mockGetParticipant.mockResolvedValue({ tracks: [] });
  mockMutePublishedTrack.mockResolvedValue({});
});

// ── VOICE_DISABLED ───────────────────────────────────────────────────────────
describe('VoiceService — env eksik', () => {
  it('LiveKit env yoksa mintToken 503 VOICE_DISABLED', async () => {
    const svc = makeService(
      makeConfig({
        'livekit.apiKey': undefined,
        'livekit.apiSecret': undefined,
        'livekit.url': undefined,
      }),
    );
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'VOICE_DISABLED' },
    });
  });
});

// ── mintToken kapıları ───────────────────────────────────────────────────────
describe('VoiceService.mintToken', () => {
  it('kanal GUILD_VOICE değilse → NOT_VOICE_CHANNEL', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ type: 'GUILD_TEXT' }));
    const svc = makeService();
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'NOT_VOICE_CHANNEL' },
    });
  });

  it('erişim kapısı hatası sapmadan yayılır (AGE_RESTRICTED)', async () => {
    membershipMock.requireChannelAccess.mockRejectedValue(
      Object.assign(new Error('age'), { response: { error: 'AGE_RESTRICTED' } }),
    );
    const svc = makeService();
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'AGE_RESTRICTED' },
    });
  });

  it('yerleşik üye → canPublish=true, audio-only grant (yalnız mikrofon), token+url döner; bayraklar false → canPublishCamera/Screen=false', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel());
    // joinedAt 48 saat önce → cutoff'tan önce → yerleşik
    prismaMock.guildMember.findUnique.mockResolvedValue({
      joinedAt: new Date(Date.now() - 48 * 3600 * 1000),
    });

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
    expect(mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({ canPublish: true, canSubscribe: true }),
    );
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
    membershipMock.requireChannelAccess.mockResolvedValue(
      voiceChannel({ type: 'DM', guildId: null }),
    );
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
    membershipMock.requireChannelAccess.mockResolvedValue(
      voiceChannel({ type: 'DM', guildId: null }),
    );
    membershipMock.requireNoDmBlock.mockResolvedValue(undefined);
    prismaMock.channelMember.findFirst.mockResolvedValue({ userId: 'other-1' });
    dmPermissionMock.canDm.mockResolvedValue({ allowed: false, reason: 'DM_NOT_ALLOWED' });

    const svc = makeService();
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'DM_NOT_ALLOWED' },
    });
  });

  it('1-1 DM, block (requireNoDmBlock fırlatır) → yayılır, canDm çağrılmaz', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(
      voiceChannel({ type: 'DM', guildId: null }),
    );
    membershipMock.requireNoDmBlock.mockRejectedValue(
      Object.assign(new Error('block'), { response: { error: 'DM_NOT_ALLOWED' } }),
    );

    const svc = makeService();
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'DM_NOT_ALLOWED' },
    });
    expect(dmPermissionMock.canDm).not.toHaveBeenCalled();
  });

  it('GROUP_DM → block kontrolü yeter, per-pair canDm YOK → canPublish=true', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(
      voiceChannel({ type: 'GROUP_DM', guildId: null }),
    );
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

  // C7.1: 18+ kanal + admin medya açmış → video var (ageGated tek başına yetmez; mediaEnabled şart)
  it('GUILD_VOICE ageGated=true + mediaEnabled=true, yetişkin → canPublishCamera+Screen=true', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(
      voiceChannel({ ageGated: true, mediaEnabled: true }),
    );
    prismaMock.guildMember.findUnique.mockResolvedValue(settledMember());

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublishCamera).toBe(true);
    expect(res.canPublishScreen).toBe(true);
    expect(mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        canPublishSources: expect.arrayContaining([
          'MICROPHONE',
          'CAMERA',
          'SCREEN_SHARE',
          'SCREEN_SHARE_AUDIO',
        ]),
      }),
    );
  });

  // C7.1: adultsOnly guild + admin medya açmış → video var (adultsOnly tek başına yetmez)
  it('GUILD_VOICE adultsOnly=true guild + mediaEnabled=true → video var', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(
      voiceChannel({ ageGated: false, adultsOnly: true, mediaEnabled: true }),
    );
    prismaMock.guildMember.findUnique.mockResolvedValue(settledMember());

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublishCamera).toBe(true);
    expect(res.canPublishScreen).toBe(true);
  });

  // C7: kapı 2 KALDIRILDI (GUILD_VOICE için). ageGated=true → kapı 5 geçer → video VAR.
  // Pratikte minör ageGated kanala giremez (requireChannelAccess → AGE_RESTRICTED).
  // Bu test "resolveVideoSources artık GUILD_VOICE'ta kendi başına minörü bloklamaz; koruma erişim kapısında"
  // gerçeğini belgeler. Savunma derinliği §D moveParticipant + requireChannelAccess'te.
  it("GUILD_VOICE mediaEnabled=true, minör → C7'de video VAR (kapı 2 kaldırıldı; erişim kapısı + §D invariant korur)", async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(
      voiceChannel({ ageGated: true, mediaEnabled: true }),
    );
    prismaMock.guildMember.findUnique.mockResolvedValue(settledMember());
    // mintToken metadata fetch → isMinor: true (resolveVideoSources'ta artık bu sorgu yok — GUILD_VOICE için kapı 2 kaldırıldı)
    prismaMock.user.findUnique.mockResolvedValue({
      username: 'ali',
      avatarUrl: null,
      isMinor: true,
    });

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    // C7: kapı 2 yok + mediaEnabled=true → kapı 5 geçer → video AÇILIR (production'da minör ageGated'a giremez — AGE_RESTRICTED erişim kapısı)
    expect(res.canPublishCamera).toBe(true);
    expect(res.canPublishScreen).toBe(true);
  });

  // §F: ses-mic karantinası kaldırıldı → YENİ üye de ageGated yetişkin bağlamında video açabilir
  it('GUILD_VOICE ageGated=true + mediaEnabled=true, YENİ üye (karantina yok) → canPublish=true + video açık', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(
      voiceChannel({ ageGated: true, mediaEnabled: true }),
    );
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
  it('GUILD_VOICE mediaEnabled=true, server-mute → video düşer', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(
      voiceChannel({ ageGated: true, mediaEnabled: true }),
    );
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
    membershipMock.requireChannelAccess.mockResolvedValue(
      voiceChannel({ type: 'DM', guildId: null }),
    );
    membershipMock.requireNoDmBlock.mockResolvedValue(undefined);
    prismaMock.channelMember.findFirst.mockResolvedValue({ userId: 'other-1' });
    dmPermissionMock.canDm.mockResolvedValue({ allowed: true });
    // Her user.findUnique çağrısı yetişkin döner (hem kendisi hem diğer)
    prismaMock.user.findUnique.mockResolvedValue({
      username: 'ali',
      avatarUrl: null,
      isMinor: false,
    });

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublishCamera).toBe(true);
    expect(res.canPublishScreen).toBe(true);
  });

  // §F / C7: DM minör↔yetişkin → audio var, video yok (değişmedi — DM reti KORUNUR)
  it('DM, karşı taraf minör → audio var, video [] (C7: DM minör reti kapı 5 DM dalında korundu)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(
      voiceChannel({ type: 'DM', guildId: null }),
    );
    membershipMock.requireNoDmBlock.mockResolvedValue(undefined);
    prismaMock.channelMember.findFirst.mockResolvedValue({ userId: 'other-1' });
    dmPermissionMock.canDm.mockResolvedValue({ allowed: true });
    // C7 sorgu sırası (DM, video etkin) — kapı 2 kaldırıldı, self-isMinor kapı 5 DM dalına taşındı:
    //  1. resolveVideoSources kapı 5 DM: self isMinor check → false (yetişkin) — kapı 2'den taşındı
    //  2. resolveVideoSources kapı 5 DM: other user isMinor → true (minör) → video kapısı kapanır
    //  3. mintToken: user metadata fetch → yetişkin
    // Mock sırası C4 ile AYNI (kapı değil konum değişti; sıra korunuyor)
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ isMinor: false }) // resolveVideoSources kapı5-DM self
      .mockResolvedValueOnce({ isMinor: true }) // resolveVideoSources kapı5-DM other
      .mockResolvedValueOnce({ username: 'ali', avatarUrl: null, isMinor: false }); // mintToken metadata

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublish).toBe(true); // audio var
    expect(res.canPublishCamera).toBe(false);
    expect(res.canPublishScreen).toBe(false);
  });

  // C7: DM self minör → video [] (self-minör kontrolü kapı 5 DM dalında)
  it('DM, self minör (karşı taraf yetişkin) → audio var, video [] (C7: DM self-minör reti korundu)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(
      voiceChannel({ type: 'DM', guildId: null }),
    );
    membershipMock.requireNoDmBlock.mockResolvedValue(undefined);
    prismaMock.channelMember.findFirst.mockResolvedValue({ userId: 'other-1' });
    dmPermissionMock.canDm.mockResolvedValue({ allowed: true });
    // Sorgu sırası:
    //  1. resolveVideoSources kapı5-DM: self isMinor → true → erken [] (other sorgusu yapılmaz)
    //  2. mintToken metadata: yetişkin-görünümlü (ama isMinor=true → audio token üretilir)
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ isMinor: true }) // resolveVideoSources kapı5-DM self → ret
      .mockResolvedValueOnce({ username: 'ali', avatarUrl: null, isMinor: true }); // mintToken metadata

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublish).toBe(true); // audio var (canPublish DM'de true)
    expect(res.canPublishCamera).toBe(false);
    expect(res.canPublishScreen).toBe(false);
  });

  // §F: GROUP_DM, bir minör üye → video []
  it('GROUP_DM, bir üye minör → video []', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(
      voiceChannel({ type: 'GROUP_DM', guildId: null }),
    );
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
    membershipMock.requireChannelAccess.mockResolvedValue(
      voiceChannel({ type: 'GROUP_DM', guildId: null }),
    );
    membershipMock.requireNoDmBlock.mockResolvedValue(undefined);
    prismaMock.channelMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
    prismaMock.user.count.mockResolvedValue(0); // minör yok

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublishCamera).toBe(true);
    expect(res.canPublishScreen).toBe(true);
  });

  // ── Sprint C7: yeni testler ───────────────────────────────────────────────────

  // C7 §G test matrisi — genel kanal mediaEnabled=false → video yok
  it('C7: GUILD_VOICE genel kanal mediaEnabled=false → video grant yok (admin açmadan kapalı)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(
      voiceChannel({ mediaEnabled: false, ageGated: false }),
    );
    prismaMock.guildMember.findUnique.mockResolvedValue(settledMember());

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublishCamera).toBe(false);
    expect(res.canPublishScreen).toBe(false);
    expect(mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({ canPublishSources: ['MICROPHONE'] }),
    );
  });

  // C7 §G test matrisi — genel kanal mediaEnabled=true, yetişkin → video var
  it('C7: GUILD_VOICE mediaEnabled=true, yetişkin → video var', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ mediaEnabled: true }));
    prismaMock.guildMember.findUnique.mockResolvedValue(settledMember());

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublishCamera).toBe(true);
    expect(res.canPublishScreen).toBe(true);
    expect(mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        canPublishSources: expect.arrayContaining([
          'MICROPHONE',
          'CAMERA',
          'SCREEN_SHARE',
          'SCREEN_SHARE_AUDIO',
        ]),
      }),
    );
  });

  // C7 §G test matrisi — mediaEnabled=true, MİNÖR → video var (kapı 2 kaldırıldı, erişim kapısı korur)
  it('C7: GUILD_VOICE mediaEnabled=true, MİNÖR → video VAR (temel C7 senaryo)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ mediaEnabled: true }));
    prismaMock.guildMember.findUnique.mockResolvedValue(settledMember());
    prismaMock.user.findUnique.mockResolvedValue({
      username: 'genç',
      avatarUrl: null,
      isMinor: true,
    });

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    // C7: kapı 2 yok → mediaEnabled=true kapı 5'i geçirir → minör dahil herkese video
    expect(res.canPublishCamera).toBe(true);
    expect(res.canPublishScreen).toBe(true);
    expect(mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        canPublishSources: expect.arrayContaining(['MICROPHONE', 'CAMERA', 'SCREEN_SHARE']),
      }),
    );
  });

  // C7.1 test matrisi — adultsOnly TEK BAŞINA medya açmaz (18+ ayrıştırması, sahip 2026-06-30)
  it('C7.1: GUILD_VOICE adultsOnly=true, mediaEnabled=false → video YOK (18+ tek başına medya açmaz)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(
      voiceChannel({ adultsOnly: true, mediaEnabled: false }),
    );
    prismaMock.guildMember.findUnique.mockResolvedValue(settledMember());

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublishCamera).toBe(false);
    expect(res.canPublishScreen).toBe(false);
  });

  // C7.1 test matrisi — ageGated TEK BAŞINA medya açmaz
  it('C7.1: GUILD_VOICE ageGated=true, mediaEnabled=false → video YOK (18+ tek başına medya açmaz)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(
      voiceChannel({ ageGated: true, mediaEnabled: false }),
    );
    prismaMock.guildMember.findUnique.mockResolvedValue(settledMember());

    const svc = makeService(videoConfig());
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);

    expect(res.canPublishCamera).toBe(false);
    expect(res.canPublishScreen).toBe(false);
  });

  // §F: kamera açık / ekran kapalı → yalnız CAMERA (SCREEN_SHARE yok)
  it('cameraEnabled=true, screenEnabled=false → yalnız CAMERA (ekran yok), mediaEnabled kanal', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel({ mediaEnabled: true }));
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
      participant: {
        identity: USER_ID,
        name: 'ali',
        metadata: JSON.stringify({ avatarUrl: 'a.png' }),
      },
    });
    prismaMock.voiceSession.findFirst.mockResolvedValue(null);

    const svc = makeService();
    await svc.handleWebhook('{}', 'auth');

    expect(prismaMock.voiceSession.create).toHaveBeenCalledWith({
      data: { channelId: CHANNEL_ID, userId: USER_ID },
    });
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
      expect.objectContaining({
        where: { id: 'vs-9' },
        data: expect.objectContaining({ leftAt: expect.any(Date) }),
      }),
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
    prismaMock.guildMember.findUnique.mockResolvedValue({
      joinedAt: new Date(Date.now() - 48 * 3600 * 1000),
    });
    prismaMock.voiceMute.findUnique.mockResolvedValue({ id: 'vm-1' });

    const svc = makeService();
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);
    expect(res.canPublish).toBe(false);
  });

  it('VoiceMute yoksa → resolveCanPublish ile karantinaya saygı', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel());
    prismaMock.guildMember.findUnique.mockResolvedValue({
      joinedAt: new Date(Date.now() - 48 * 3600 * 1000),
    });
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
    expect(permissionsMock.hasGuildPermission).toHaveBeenCalledWith(
      USER_ID,
      GUILD_ID,
      'MUTE_MEMBERS',
    );
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

// ── §2 (Sprint R19, §0 kusuru) — muteParticipant ZATEN YAYINDA olan track'leri zorla keser ───
// Kök neden: updateParticipant yalnız gelecekteki publish iznini keser, halihazırda yayınlanan
// track'e dokunmaz. Sahip cihaz turunda susturulan kullanıcı konuşmaya/kameraya devam etmişti.
describe('VoiceService.muteParticipant — §2 zorla susturma (forceMuteTracks)', () => {
  beforeEach(() => {
    prismaMock.channel.findFirst.mockResolvedValue(gvChannel());
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
  });

  it('hedef zaten ses+video+ekran yayınlıyor → sustur TÜM track sid’lerinde mutePublishedTrack(true) çağırır', async () => {
    mockGetParticipant.mockResolvedValue({
      tracks: [
        { sid: 'trk-mic', source: 'MICROPHONE' },
        { sid: 'trk-cam', source: 'CAMERA' },
        { sid: 'trk-scr', source: 'SCREEN_SHARE' },
      ],
    });
    const svc = makeService();
    await svc.muteParticipant(USER_ID, CHANNEL_ID, TARGET_ID);

    expect(mockGetParticipant).toHaveBeenCalledWith(CHANNEL_ID, TARGET_ID);
    expect(mockMutePublishedTrack).toHaveBeenCalledWith(CHANNEL_ID, TARGET_ID, 'trk-mic', true);
    expect(mockMutePublishedTrack).toHaveBeenCalledWith(CHANNEL_ID, TARGET_ID, 'trk-cam', true);
    expect(mockMutePublishedTrack).toHaveBeenCalledWith(CHANNEL_ID, TARGET_ID, 'trk-scr', true);
    expect(mockMutePublishedTrack).toHaveBeenCalledTimes(3);
  });

  it('hedef yayında değil (track yok) → mutePublishedTrack hiç çağrılmaz', async () => {
    mockGetParticipant.mockResolvedValue({ tracks: [] });
    const svc = makeService();
    await svc.muteParticipant(USER_ID, CHANNEL_ID, TARGET_ID);

    expect(mockMutePublishedTrack).not.toHaveBeenCalled();
  });

  it('hedef bağlı değil (getParticipant patlar) → best-effort sessiz geç, kayıt yine de yazılır', async () => {
    mockGetParticipant.mockRejectedValue(new Error('participant not found'));
    const svc = makeService();
    await expect(svc.muteParticipant(USER_ID, CHANNEL_ID, TARGET_ID)).resolves.toBeUndefined();
    expect(prismaMock.voiceMute.upsert).toHaveBeenCalled();
    expect(mockMutePublishedTrack).not.toHaveBeenCalled();
  });

  it('bir track’in mutePublishedTrack çağrısı patlarsa → diğer track yine denenir (best-effort)', async () => {
    mockGetParticipant.mockResolvedValue({
      tracks: [
        { sid: 'trk-cam', source: 'CAMERA' },
        { sid: 'trk-scr', source: 'SCREEN_SHARE' },
      ],
    });
    mockMutePublishedTrack.mockImplementation((_room: string, _id: string, sid: string) => {
      if (sid === 'trk-cam') return Promise.reject(new Error('mute failed'));
      return Promise.resolve({});
    });
    const svc = makeService();
    await expect(svc.muteParticipant(USER_ID, CHANNEL_ID, TARGET_ID)).resolves.toBeUndefined();
    expect(mockMutePublishedTrack).toHaveBeenCalledWith(CHANNEL_ID, TARGET_ID, 'trk-scr', true);
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

  // 🔴 §3 (Sprint R19) — kırmızı çizgi regresyonu: susturma kalkınca track ZORLA AÇILMAZ.
  // Hedef susturulmadan önce mikrofonunu kendi isteğiyle kapatmış olabilir; izin (canPublish)
  // geri vermek "mikrofonunu aç" demek DEĞİL. mutePublishedTrack(..., false) HİÇ çağrılmamalı —
  // bu çağrı "simetrik olsun" diye eklenirse kullanıcı iradesi ezilir.
  it('§3: track’i zorla AÇMAZ — mutePublishedTrack hiç çağrılmaz (yalnız izin geri verilir)', async () => {
    prismaMock.guildMember.findUnique.mockResolvedValue({ joinedAt: new Date(), role: 'MEMBER' });
    const svc = makeService();
    await svc.unmuteParticipant(USER_ID, CHANNEL_ID, TARGET_ID);

    expect(mockMutePublishedTrack).not.toHaveBeenCalled();
    expect(mockGetParticipant).not.toHaveBeenCalled();
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

// ── R17 §2: unmute sonrası canPublishSources — T&S sızıntı testleri ────────────
// §0 kusuru: unmuteParticipant canPublishSources HİÇ göndermiyordu → LiveKit boş/eksik diziyi
// "hepsi serbest" sayıyordu; susturulup açılan kullanıcı video izni olmayan kanalda bile kamera
// yayınlayabiliyordu. Bu blok contract §2'nin üç zorunlu testinden ikisini karşılar.
describe('VoiceService.unmuteParticipant — R17 §2 canPublishSources', () => {
  beforeEach(() => {
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
    // yerleşik üye → resolveCanPublish=true (karantina değil)
    prismaMock.guildMember.findUnique.mockResolvedValue({
      joinedAt: new Date(Date.now() - 48 * 3600 * 1000),
      role: 'MEMBER',
    });
  });

  it('video izni OLMAYAN kanalda (mediaEnabled=false) → susturması kalkan kullanıcı kamera kaynağı ALMAZ', async () => {
    prismaMock.channel.findFirst.mockResolvedValue(
      gvChannel({ ageGated: false, mediaEnabled: false, guild: { adultsOnly: false } }),
    );
    const svc = makeService(videoConfig()); // bayraklar açık — yalnız kanal kuralı kapalı

    await svc.unmuteParticipant(USER_ID, CHANNEL_ID, TARGET_ID);

    const call = mockUpdateParticipant.mock.calls[0][3] as { canPublishSources: string[] };
    expect(call.canPublishSources).toEqual(['MICROPHONE']);
    expect(call.canPublishSources).not.toContain('CAMERA');
    expect(call.canPublishSources).not.toContain('SCREEN_SHARE');
  });

  it('video izni OLAN kanalda (mediaEnabled=true) → susturması kalkan kullanıcı kamera+ekran kaynağını GERİ ALIR', async () => {
    prismaMock.channel.findFirst.mockResolvedValue(
      gvChannel({ ageGated: false, mediaEnabled: true, guild: { adultsOnly: false } }),
    );
    const svc = makeService(videoConfig());

    await svc.unmuteParticipant(USER_ID, CHANNEL_ID, TARGET_ID);

    const call = mockUpdateParticipant.mock.calls[0][3] as { canPublishSources: string[] };
    expect(call.canPublishSources).toEqual(
      expect.arrayContaining(['MICROPHONE', 'CAMERA', 'SCREEN_SHARE', 'SCREEN_SHARE_AUDIO']),
    );
  });

  // Regresyon (contract §2, 3. zorunlu test): mintToken ve unmuteParticipant AYNI paylaşılan hesabı
  // (resolveCanPublishSources) çağırıyor — aynı kanal/bayrak koşullarında ikisi de AYNI kaynak
  // setini üretmeli. Bu test gelecekte biri diğerinden kopyalanıp bağımsızlaşırsa (drift) kırılır.
  it('regresyon — mintToken ve unmuteParticipant aynı mediaEnabled=true kanalda AYNI canPublishSources üretir', async () => {
    const channel = gvChannel({ ageGated: false, mediaEnabled: true, guild: { adultsOnly: false } });
    prismaMock.channel.findFirst.mockResolvedValue(channel);
    membershipMock.requireChannelAccess.mockResolvedValue(channel);
    prismaMock.guildMember.findUnique.mockResolvedValue(settledMember());

    const svc = makeService(videoConfig());

    const mintRes = await svc.mintToken(USER_ID, CHANNEL_ID);
    const mintGrant = mockAddGrant.mock.calls[0][0] as { canPublishSources: string[] };

    await svc.unmuteParticipant(USER_ID, CHANNEL_ID, TARGET_ID);
    const unmuteCall = mockUpdateParticipant.mock.calls[0][3] as { canPublishSources: string[] };

    expect(new Set(unmuteCall.canPublishSources)).toEqual(new Set(mintGrant.canPublishSources));
    expect(mintRes.canPublishCamera).toBe(true);
    expect(mintRes.canPublishScreen).toBe(true);
  });
});

// ── R11: Taşı ───────────────────────────────────────────────────────────────────
const TARGET_CHANNEL_ID = 'chan-2';
describe('VoiceService.moveParticipant', () => {
  // C7 §D invariant: hedef kanal ageGated + guild.adultsOnly alanları eklendi
  function targetChannel(overrides: Record<string, unknown> = {}) {
    return {
      id: TARGET_CHANNEL_ID,
      type: 'GUILD_VOICE',
      guildId: GUILD_ID,
      userLimit: 0,
      ageGated: false, // C7: invariant için — default normal kanal
      guild: { adultsOnly: false }, // C7: invariant için — default normal guild
      ...overrides,
    };
  }
  beforeEach(() => {
    // 1. çağrı: kaynak (requireGuildVoiceChannel), 2. çağrı: hedef
    prismaMock.channel.findFirst
      .mockResolvedValueOnce(gvChannel())
      .mockResolvedValueOnce(targetChannel());
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
    // C7 §D: targetUser isMinor=false (varsayılan — invariant yalnız isMinor=true'da tetiklenir)
    prismaMock.user.findUnique.mockResolvedValue({
      username: 'ali',
      avatarUrl: null,
      isMinor: false,
    });
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
    mockListParticipants.mockResolvedValue([]);
  });

  it('yetki yoksa → 403 FORBIDDEN', async () => {
    permissionsMock.hasGuildPermission.mockResolvedValue(false);
    const svc = makeService();
    await expect(
      svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID),
    ).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
    expect(permissionsMock.hasGuildPermission).toHaveBeenCalledWith(
      USER_ID,
      GUILD_ID,
      'MOVE_MEMBERS',
    );
  });

  it('hedef = kaynak → SAME_CHANNEL', async () => {
    const svc = makeService();
    await expect(
      svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, CHANNEL_ID),
    ).rejects.toMatchObject({
      response: { error: 'SAME_CHANNEL' },
    });
  });

  it('hedef = actor → CANNOT_MOVE_SELF', async () => {
    const svc = makeService();
    await expect(
      svc.moveParticipant(USER_ID, CHANNEL_ID, USER_ID, TARGET_CHANNEL_ID),
    ).rejects.toMatchObject({
      response: { error: 'CANNOT_MOVE_SELF' },
    });
  });

  it('hedef kanal yok → CHANNEL_NOT_FOUND', async () => {
    prismaMock.channel.findFirst.mockReset();
    prismaMock.channel.findFirst.mockResolvedValueOnce(gvChannel()).mockResolvedValueOnce(null);
    const svc = makeService();
    await expect(
      svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID),
    ).rejects.toMatchObject({
      response: { error: 'CHANNEL_NOT_FOUND' },
    });
  });

  it('hedef başka guild → CHANNEL_NOT_FOUND (sızıntı yok)', async () => {
    prismaMock.channel.findFirst.mockReset();
    prismaMock.channel.findFirst
      .mockResolvedValueOnce(gvChannel())
      .mockResolvedValueOnce(targetChannel({ guildId: 'other-guild' }));
    const svc = makeService();
    await expect(
      svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID),
    ).rejects.toMatchObject({
      response: { error: 'CHANNEL_NOT_FOUND' },
    });
  });

  it('hedef GUILD_VOICE değil → NOT_VOICE_CHANNEL', async () => {
    prismaMock.channel.findFirst.mockReset();
    prismaMock.channel.findFirst
      .mockResolvedValueOnce(gvChannel())
      .mockResolvedValueOnce(targetChannel({ type: 'GUILD_TEXT' }));
    const svc = makeService();
    await expect(
      svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID),
    ).rejects.toMatchObject({
      response: { error: 'NOT_VOICE_CHANNEL' },
    });
  });

  it('hedef OWNER → CANNOT_MOVE_OWNER', async () => {
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'OWNER' });
    const svc = makeService();
    await expect(
      svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID),
    ).rejects.toMatchObject({
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
    await expect(
      svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID),
    ).rejects.toMatchObject({
      response: { error: 'CHANNEL_FULL' },
    });
  });

  // ── C7 §D: Yetki-baypas invariant — minör + 18+ hedef → ret ────────────────────
  it('C7 §D invariant: minör → ageGated hedef kanal → AGE_RESTRICTED (taşıma engellenir)', async () => {
    prismaMock.channel.findFirst.mockReset();
    prismaMock.channel.findFirst
      .mockResolvedValueOnce(gvChannel())
      .mockResolvedValueOnce(targetChannel({ ageGated: true }));
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: true }); // target user minör

    const svc = makeService();
    await expect(
      svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID),
    ).rejects.toMatchObject({
      response: { error: 'AGE_RESTRICTED' },
    });
    // Taşıma gerçekleşmemeli
    expect(mockRemoveParticipant).not.toHaveBeenCalled();
    expect(realtimeMock.emitToUsers).not.toHaveBeenCalled();
  });

  it('C7 §D invariant: minör → adultsOnly guild → AGE_RESTRICTED (taşıma engellenir)', async () => {
    prismaMock.channel.findFirst.mockReset();
    prismaMock.channel.findFirst
      .mockResolvedValueOnce(gvChannel())
      .mockResolvedValueOnce(targetChannel({ guild: { adultsOnly: true } }));
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: true }); // target user minör

    const svc = makeService();
    await expect(
      svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID),
    ).rejects.toMatchObject({
      response: { error: 'AGE_RESTRICTED' },
    });
    expect(mockRemoveParticipant).not.toHaveBeenCalled();
  });

  it('C7 §D invariant: yetişkin → ageGated hedef kanal → başarı (invariant yalnız minörü engeller)', async () => {
    prismaMock.channel.findFirst.mockReset();
    prismaMock.channel.findFirst
      .mockResolvedValueOnce(gvChannel())
      .mockResolvedValueOnce(targetChannel({ ageGated: true }));
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false }); // target user yetişkin
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'MEMBER' });

    const svc = makeService();
    await svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID);
    expect(realtimeMock.emitToUsers).toHaveBeenCalledWith(
      [TARGET_ID],
      'voice.moved',
      expect.any(Object),
    );
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
    await expect(
      svc.moveParticipant(USER_ID, CHANNEL_ID, TARGET_ID, TARGET_CHANNEL_ID),
    ).resolves.toBeUndefined();
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
      mediaEnabled: false, // C7: default false
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
    prismaMock.guildMember.findUnique.mockResolvedValue({
      joinedAt: new Date(Date.now() - 48 * 3600 * 1000),
      role: 'MEMBER',
    });

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

  // ── A4-7b — Platform güvenliği (isModerator) acil-yanıt teftiş-girişi ─────────
  it('NOT_CHANNEL_MEMBER + MUTE_MEMBERS YOK + platform isModerator + AÇIK EMERGENCY → bypass (voice.emergency_inspect)', async () => {
    mockNotChannelMember();
    mockRawChannel();
    permissionsMock.hasGuildPermission.mockResolvedValue(false); // guild rolü YOK
    prismaMock.user.findUnique.mockResolvedValue({
      username: 'mod',
      avatarUrl: null,
      isMinor: false,
      isModerator: true,
    });
    prismaMock.report.count.mockResolvedValue(1); // bu kanalda açık acil var
    prismaMock.guildMember.findUnique.mockResolvedValue({
      joinedAt: new Date(Date.now() - 48 * 3600 * 1000),
      role: 'MEMBER',
    });

    const svc = makeService();
    const res = await svc.mintToken(USER_ID, CHANNEL_ID);
    expect(res.token).toBe('jwt-token');
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: USER_ID,
          action: 'voice.emergency_inspect',
          entityId: CHANNEL_ID,
        }),
      }),
    );
  });

  it('NOT_CHANNEL_MEMBER + isModerator ama AÇIK EMERGENCY YOK → hata fırlatılır (yetki amaca bağlı)', async () => {
    mockNotChannelMember();
    mockRawChannel();
    permissionsMock.hasGuildPermission.mockResolvedValue(false);
    prismaMock.user.findUnique.mockResolvedValue({
      username: 'mod',
      avatarUrl: null,
      isMinor: false,
      isModerator: true,
    });
    prismaMock.report.count.mockResolvedValue(0); // acil YOK → mod rastgele kanala sızamaz

    const svc = makeService();
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'NOT_CHANNEL_MEMBER' },
    });
  });

  it('NOT_CHANNEL_MEMBER + AÇIK EMERGENCY ama isModerator DEĞİL → hata fırlatılır (yalnız platform mod)', async () => {
    mockNotChannelMember();
    mockRawChannel();
    permissionsMock.hasGuildPermission.mockResolvedValue(false);
    prismaMock.user.findUnique.mockResolvedValue({
      username: 'normal',
      avatarUrl: null,
      isMinor: false,
      isModerator: false,
    });
    prismaMock.report.count.mockResolvedValue(1);

    const svc = makeService();
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'NOT_CHANNEL_MEMBER' },
    });
  });

  it('NOT_CHANNEL_MEMBER + MUTE_MEMBERS VAR + kanal doluysa → enforceUserLimit MUTE_MEMBERS bypass ile aşılır', async () => {
    mockNotChannelMember();
    mockRawChannel({ userLimit: 2 });
    permissionsMock.hasGuildPermission.mockResolvedValue(true); // hem MUTE_MEMBERS hem MANAGE_CHANNELS bypass
    // Oda dolu (2 katılımcı, limit=2)
    mockListParticipants.mockResolvedValue([{ identity: 'a' }, { identity: 'b' }]);
    prismaMock.guildMember.findUnique.mockResolvedValue({
      joinedAt: new Date(Date.now() - 48 * 3600 * 1000),
      role: 'MEMBER',
    });

    const svc = makeService();
    // MUTE_MEMBERS bypass → dolu kanala girer (CHANNEL_FULL fırlamamalı)
    await expect(svc.mintToken(USER_ID, CHANNEL_ID)).resolves.toMatchObject({ token: 'jwt-token' });
  });

  it("normal giriş (NOT_CHANNEL_MEMBER YOK) → audit yazılmaz (sadece bypass-giriş audit'lenir)", async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(voiceChannel());
    prismaMock.guildMember.findUnique.mockResolvedValue({
      joinedAt: new Date(Date.now() - 48 * 3600 * 1000),
    });

    const svc = makeService();
    await svc.mintToken(USER_ID, CHANNEL_ID);
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('bypass-giriş → mod video AÇMAZ (normal kanal, resolveVideoSources [] döner)', async () => {
    mockNotChannelMember();
    // Mod sadece MUTE_MEMBERS, kanal normal (ageGated=false)
    mockRawChannel({ ageGated: false, guild: { adultsOnly: false } });
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
    prismaMock.guildMember.findUnique.mockResolvedValue({
      joinedAt: new Date(Date.now() - 48 * 3600 * 1000),
      role: 'MEMBER',
    });

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
    expect(permissionsMock.hasGuildPermission).toHaveBeenCalledWith(
      USER_ID,
      GUILD_ID,
      'MUTE_MEMBERS',
    );
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

  // §2 (Sprint R19, §0 kusuru) — yukarıdaki updateParticipant testi yalnız GELECEKTEKİ izni
  // doğrular; bu blok hedef ZATEN yayındaysa (kamera/ekran açık) o track'in de kesildiğini kanıtlar.
  it('§2: hedef zaten kamera+ekran yayınlıyor → yalnız o track’ler mutePublishedTrack(true) alır, mikrofon KESİLMEZ', async () => {
    mockGetParticipant.mockResolvedValue({
      tracks: [
        { sid: 'trk-mic', source: 'MICROPHONE' },
        { sid: 'trk-cam', source: 'CAMERA' },
        { sid: 'trk-scr', source: 'SCREEN_SHARE' },
      ],
    });
    const svc = makeService();
    await svc.stopBroadcast(USER_ID, CHANNEL_ID, TARGET_ID);

    expect(mockMutePublishedTrack).toHaveBeenCalledWith(CHANNEL_ID, TARGET_ID, 'trk-cam', true);
    expect(mockMutePublishedTrack).toHaveBeenCalledWith(CHANNEL_ID, TARGET_ID, 'trk-scr', true);
    // Kritik: mikrofon track'i force-mute edilmez (ses kalır — sustur'dan fark)
    expect(mockMutePublishedTrack).not.toHaveBeenCalledWith(
      CHANNEL_ID,
      TARGET_ID,
      'trk-mic',
      true,
    );
    expect(mockMutePublishedTrack).toHaveBeenCalledTimes(2);
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

  it("başarı → WS voice.broadcast_stopped room'a yayılır", async () => {
    const svc = makeService();
    await svc.stopBroadcast(USER_ID, CHANNEL_ID, TARGET_ID);

    expect(realtimeMock.emitToRoom).toHaveBeenCalledWith(CHANNEL_ID, 'voice.broadcast_stopped', {
      channelId: CHANNEL_ID,
      userId: TARGET_ID,
    });
  });

  it('LiveKit hatası yutulur (best-effort) — audit + WS yine çalışır', async () => {
    mockUpdateParticipant.mockRejectedValue(new Error('not connected'));
    const svc = makeService();
    await expect(svc.stopBroadcast(USER_ID, CHANNEL_ID, TARGET_ID)).resolves.toBeUndefined();
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
    expect(realtimeMock.emitToRoom).toHaveBeenCalled();
  });
});

// ── §4 D54 (Sprint R19) — refreshChannelPermissions ──────────────────────────
// Kanal ageGated/mediaEnabled değişince O AN bağlı katılımcıların LiveKit izinleri tazelenir.
// ChannelsService.update tetikler (yalnız GUILD_VOICE + ilgili alan fiilen değiştiyse) — burada
// VoiceService metodunun kendisi (koşulsuz tazeleme + best-effort + track zorla kesme) test edilir.
describe('VoiceService.refreshChannelPermissions (§4 D54)', () => {
  beforeEach(() => {
    // Önceki describe bloklarındaki `mockUpdateParticipant.mockRejectedValue(...)` çağrıları
    // (best-effort testleri) jest.clearAllMocks() ile TEMİZLENMEZ — yalnız çağrı geçmişi
    // sıfırlanır, implementasyon kalır (mockClear vs mockReset farkı). Bu blok updateParticipant'ın
    // başarıyla döndüğünü varsayan zincirleme etkileri (forceMuteTracks'in tetiklenmesi) test
    // ettiğinden, dosya-genelindeki sızıntıdan izole olmak için burada açıkça sıfırlanır.
    mockUpdateParticipant.mockResolvedValue({});
  });

  function refreshChannel(overrides: Record<string, unknown> = {}) {
    return {
      id: CHANNEL_ID,
      type: 'GUILD_VOICE',
      guildId: GUILD_ID,
      ageGated: false,
      mediaEnabled: false,
      guild: { adultsOnly: false },
      ...overrides,
    };
  }

  it('kanal yok / GUILD_VOICE değil → sessiz no-op (listParticipants hiç çağrılmaz)', async () => {
    prismaMock.channel.findFirst.mockResolvedValue(null);
    const svc = makeService();
    await expect(svc.refreshChannelPermissions(CHANNEL_ID)).resolves.toBeUndefined();
    expect(mockListParticipants).not.toHaveBeenCalled();
  });

  it('LiveKit env eksik (roomService yok) → sessiz no-op', async () => {
    const svc = makeService(
      makeConfig({
        'livekit.apiKey': undefined,
        'livekit.apiSecret': undefined,
        'livekit.url': undefined,
      }),
    );
    await expect(svc.refreshChannelPermissions(CHANNEL_ID)).resolves.toBeUndefined();
    expect(mockListParticipants).not.toHaveBeenCalled();
  });

  it('oda henüz açılmadı (listParticipants patlar) → sessiz no-op', async () => {
    prismaMock.channel.findFirst.mockResolvedValue(refreshChannel());
    mockListParticipants.mockRejectedValue(new Error('room not found'));
    const svc = makeService();
    await expect(svc.refreshChannelPermissions(CHANNEL_ID)).resolves.toBeUndefined();
    expect(mockUpdateParticipant).not.toHaveBeenCalled();
  });

  it('mediaEnabled=true (gevşetildi) → susturulmamış katılımcının izni kamera+ekran içerecek şekilde tazelenir', async () => {
    prismaMock.channel.findFirst.mockResolvedValue(refreshChannel({ mediaEnabled: true }));
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
    prismaMock.voiceMute.findUnique.mockResolvedValue(null); // susturulmamış
    mockListParticipants.mockResolvedValue([{ identity: TARGET_ID }]);
    mockGetParticipant.mockResolvedValue({ tracks: [] });

    const svc = makeService(videoConfig());
    await svc.refreshChannelPermissions(CHANNEL_ID);

    expect(mockUpdateParticipant).toHaveBeenCalledWith(
      CHANNEL_ID,
      TARGET_ID,
      undefined,
      expect.objectContaining({
        canPublish: true,
        canPublishSources: expect.arrayContaining(['MICROPHONE', 'CAMERA', 'SCREEN_SHARE']),
      }),
    );
  });

  it('mediaEnabled=false (sıkılaştırıldı) → zaten yayında olan kamera track’i zorla kesilir, mikrofon dokunulmaz', async () => {
    prismaMock.channel.findFirst.mockResolvedValue(refreshChannel({ mediaEnabled: false }));
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
    prismaMock.voiceMute.findUnique.mockResolvedValue(null);
    mockListParticipants.mockResolvedValue([{ identity: TARGET_ID }]);
    mockGetParticipant.mockResolvedValue({
      tracks: [
        { sid: 'trk-mic', source: 'MICROPHONE' },
        { sid: 'trk-cam', source: 'CAMERA' },
      ],
    });

    const svc = makeService(videoConfig());
    await svc.refreshChannelPermissions(CHANNEL_ID);

    expect(mockUpdateParticipant).toHaveBeenCalledWith(
      CHANNEL_ID,
      TARGET_ID,
      undefined,
      expect.objectContaining({ canPublishSources: ['MICROPHONE'] }),
    );
    // asıl kazanç: izin güncellemesi tek başına canlı kamera track'ini kesmez — zorla kes
    expect(mockMutePublishedTrack).toHaveBeenCalledWith(CHANNEL_ID, TARGET_ID, 'trk-cam', true);
    expect(mockMutePublishedTrack).not.toHaveBeenCalledWith(
      CHANNEL_ID,
      TARGET_ID,
      'trk-mic',
      true,
    );
  });

  it('zaten sunucu-susturulmuş katılımcı → yalnız canPublish:false yeniden yazılır, track’lerine dokunulmaz', async () => {
    prismaMock.channel.findFirst.mockResolvedValue(refreshChannel({ mediaEnabled: true }));
    mockListParticipants.mockResolvedValue([{ identity: TARGET_ID }]);
    prismaMock.voiceMute.findUnique.mockResolvedValue({ id: 'vm-1' }); // susturulmuş

    const svc = makeService(videoConfig());
    await svc.refreshChannelPermissions(CHANNEL_ID);

    expect(mockUpdateParticipant).toHaveBeenCalledWith(CHANNEL_ID, TARGET_ID, undefined, {
      canPublish: false,
      canSubscribe: true,
      canPublishData: false,
    });
    // muteParticipant'ta zaten kesilmişti — burada tekrar dokunulmaz
    expect(mockGetParticipant).not.toHaveBeenCalled();
    expect(mockMutePublishedTrack).not.toHaveBeenCalled();
  });

  it('bir katılımcının hatası diğerini düşürmez (N katılımcı = N bağımsız deneme, contract §4)', async () => {
    prismaMock.channel.findFirst.mockResolvedValue(refreshChannel({ mediaEnabled: true }));
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
    prismaMock.voiceMute.findUnique.mockResolvedValue(null);
    mockListParticipants.mockResolvedValue([{ identity: 'ok-1' }, { identity: 'fail-1' }]);
    mockUpdateParticipant.mockImplementation((_room: string, identity: string) => {
      if (identity === 'fail-1') return Promise.reject(new Error('boom'));
      return Promise.resolve({});
    });

    const svc = makeService(videoConfig());
    await expect(svc.refreshChannelPermissions(CHANNEL_ID)).resolves.toBeUndefined();
    expect(mockUpdateParticipant).toHaveBeenCalledWith(
      CHANNEL_ID,
      'ok-1',
      undefined,
      expect.any(Object),
    );
    expect(mockUpdateParticipant).toHaveBeenCalledWith(
      CHANNEL_ID,
      'fail-1',
      undefined,
      expect.any(Object),
    );
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
    expect(permissionsMock.hasGuildPermission).toHaveBeenCalledWith(
      USER_ID,
      GUILD_ID,
      'MOVE_MEMBERS',
    );
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

  it("başarı → WS voice.kicked room'a yayılır", async () => {
    const svc = makeService();
    await svc.disconnectParticipant(USER_ID, CHANNEL_ID, TARGET_ID);

    expect(realtimeMock.emitToRoom).toHaveBeenCalledWith(CHANNEL_ID, 'voice.kicked', {
      channelId: CHANNEL_ID,
      userId: TARGET_ID,
    });
  });

  it('LiveKit hatası yutulur (best-effort) — audit + WS yine çalışır', async () => {
    mockRemoveParticipant.mockRejectedValue(new Error('not connected'));
    const svc = makeService();
    await expect(
      svc.disconnectParticipant(USER_ID, CHANNEL_ID, TARGET_ID),
    ).resolves.toBeUndefined();
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

// ── R16 §2: listParticipants — mutedUserIds ──────────────────────────────────
describe('VoiceService.listParticipants — R16 §2 mutedUserIds', () => {
  beforeEach(() => {
    mockListParticipants.mockResolvedValue([
      { identity: TARGET_ID, name: 'hedef', metadata: undefined, joinedAt: 1000 },
    ]);
  });

  it('GUILD_VOICE, susturulmuş kullanıcı varsa → mutedUserIds listede geliyor', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(gvChannel());
    prismaMock.voiceMute.findMany.mockResolvedValue([{ userId: TARGET_ID }]);

    const svc = makeService();
    const res = await svc.listParticipants(USER_ID, CHANNEL_ID);

    expect(res.mutedUserIds).toEqual([TARGET_ID]);
    // var olan alanların şekli korunuyor
    expect(res.participants).toEqual([
      { userId: TARGET_ID, username: 'hedef', avatarUrl: null },
    ]);
    expect(prismaMock.voiceMute.findMany).toHaveBeenCalledWith({
      where: { channelId: CHANNEL_ID },
      select: { userId: true },
    });
  });

  it('GUILD_VOICE, susturma kalkınca → mutedUserIds listeden düşüyor', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(gvChannel());
    prismaMock.voiceMute.findMany.mockResolvedValue([]); // unmute sonrası kayıt silinmiş

    const svc = makeService();
    const res = await svc.listParticipants(USER_ID, CHANNEL_ID);

    expect(res.mutedUserIds).toEqual([]);
  });

  it('DM kanalında mutedUserIds her zaman boş dönüyor (VoiceMute yok)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue({
      id: CHANNEL_ID,
      type: 'DM',
      guildId: null,
    });

    const svc = makeService();
    const res = await svc.listParticipants(USER_ID, CHANNEL_ID);

    expect(res.mutedUserIds).toEqual([]);
    expect(prismaMock.voiceMute.findMany).not.toHaveBeenCalled();
  });

  it('GROUP_DM kanalında mutedUserIds her zaman boş dönüyor (VoiceMute yok)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue({
      id: CHANNEL_ID,
      type: 'GROUP_DM',
      guildId: null,
    });

    const svc = makeService();
    const res = await svc.listParticipants(USER_ID, CHANNEL_ID);

    expect(res.mutedUserIds).toEqual([]);
  });

  it('LiveKit oda erişilemez (catch dalı) → mutedUserIds yine de kalıcı kayıttan döner', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(gvChannel());
    prismaMock.voiceMute.findMany.mockResolvedValue([{ userId: TARGET_ID }]);
    mockListParticipants.mockRejectedValue(new Error('room not found'));

    const svc = makeService();
    const res = await svc.listParticipants(USER_ID, CHANNEL_ID);

    expect(res).toEqual({ startedAt: null, participants: [], mutedUserIds: [TARGET_ID] });
  });
});
