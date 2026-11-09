/**
 * MessagesGateway — notifyChannelActivity birim testleri
 *
 * Sadece notifyChannelActivity test edilir; diğer gateway metodlarının
 * (broadcastMessage, notifyDmActivity vb.) integration testi E2E kapsamında.
 */

import { MessagesGateway } from './messages.gateway';

// ── Mock fabrikaları ──────────────────────────────────────────────────────────

const prismaMock = {
  channel: {
    findUnique: jest.fn(),
  },
  guildMember: {
    findMany: jest.fn(),
  },
  session: { findFirst: jest.fn() },
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  channelMember: { findMany: jest.fn(), findUnique: jest.fn() },
  notificationPref: { findMany: jest.fn(), findUnique: jest.fn() },
  // R15 — rol bahsetmesi: preview'da rol adı çözümü + alıcı kümesi rol genişlemesi
  role: { findMany: jest.fn() },
  guildMemberRole: { findMany: jest.fn() },
  // M5a §4 — voice:group_call_ring: çağıran↔hedef doğrudan blok sorgusu
  userBlock: { findFirst: jest.fn() },
};

const jwtMock = { verify: jest.fn() };
const configMock = { get: jest.fn() };
const membershipMock = {
  requireChannelAccess: jest.fn(),
  requireGuildMembership: jest.fn(),
  // M4z §F — grup çağrısı başlatma/iptal kapısı (start ile cancel AYNI ikiliyi kullanır)
  requireNoDmBlock: jest.fn(),
};

// R20 — özel kanalda "yönetici mi" sorusu artık PermissionsService.guildPrivilegedUserIds'e
// devredilir (eskiden guildMember.role IN ['OWNER','ADMIN'] sorgusuydu — enum-ADMIN kaldırıldı).
const guildPrivilegedUserIdsMock = jest.fn();
const permissionsMock = {
  guildPrivilegedUserIds: guildPrivilegedUserIdsMock,
};

const emitToUserMock = jest.fn();
const realtimeMock = {
  setServer: jest.fn(),
  emitToUser: emitToUserMock,
};

const presenceMock = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  audienceFor: jest.fn().mockResolvedValue([]),
  visibleOnlineFor: jest.fn().mockResolvedValue([]),
  setStatus: jest.fn(),
  // C31b
  activeGameId: jest.fn(),
  setGame: jest.fn(),
  gameActivityEnabled: jest.fn(),
  broadcastActivity: jest.fn(),
};

const dmPermissionMock = { canDm: jest.fn() };

// C31b — oyun çözümleme (activity:set)
const gamesMock = { resolve: jest.fn() };

const notificationsCreateMock = jest.fn();
const notificationsShouldNotifyMock = jest.fn();
const notificationsMock = {
  create: notificationsCreateMock,
  shouldNotifyChannel: notificationsShouldNotifyMock,
  snapshot: jest.fn().mockResolvedValue({ notifications: [], unreadCount: 0 }),
};

// M3 §2.6 — DM push
const pushSendToUsersMock = jest.fn();
const pushMock = { sendToUsers: pushSendToUsersMock };

// M5a §4.4 — voice:group_call_ring hedefin ODADA olup olmadığını burada sorar
const voiceGetLiveParticipationMock = jest.fn();
const voiceMock = { getLiveParticipation: voiceGetLiveParticipationMock };

function makeGateway() {
  return new MessagesGateway(
    jwtMock as any,
    configMock as any,
    prismaMock as any,
    membershipMock as any,
    permissionsMock as any,
    realtimeMock as any,
    presenceMock as any,
    dmPermissionMock as any,
    notificationsMock as any,
    pushMock as any,
    voiceMock as any,
    gamesMock as any,
  );
}

function resetMocks() {
  jest.resetAllMocks();
  presenceMock.audienceFor.mockResolvedValue([]);
  presenceMock.visibleOnlineFor.mockResolvedValue([]);
  notificationsMock.snapshot.mockResolvedValue({ notifications: [], unreadCount: 0 });
  // R12 — varsayılan: suppression yok (bildirim üretilir); süzme testleri override eder.
  notificationsShouldNotifyMock.mockResolvedValue(true);
  // R14 — varsayılan: @everyone bastırma kaydı yok
  prismaMock.notificationPref.findMany.mockResolvedValue([]);
  // M4a-3 §9.1 — varsayılan: susturma kaydı yok (arama normal gider)
  prismaMock.notificationPref.findUnique.mockResolvedValue(null);
  // R15 — varsayılan: içerikte rol token'ı yok / rol üyesi yok
  prismaMock.role.findMany.mockResolvedValue([]);
  prismaMock.guildMemberRole.findMany.mockResolvedValue([]);
  // KUSUR 3 — resolveMentionPreview varsayılanı: içerikte kullanıcı token'ı yoksa hiç çağrılmaz,
  // varsa da (mock override etmemişse) boş sonuç → @bilinmeyen fallback'i (throw yerine).
  prismaMock.user.findMany.mockResolvedValue([]);
  // M3 §2.6 — varsayılan: push başarıyla "gönderildi" (fire-and-forget, hata yutulur)
  pushSendToUsersMock.mockResolvedValue(undefined);
  // M5a §4 — varsayılan: blok yok, hedef odada değil (ring testleri override eder)
  prismaMock.userBlock.findFirst.mockResolvedValue(null);
  voiceGetLiveParticipationMock.mockResolvedValue({
    present: false,
    streaming: false,
    video: false,
  });
  // R20 — varsayılan: tam yetkili (OWNER/ADMINISTRATOR) kimse yok; özel kanal testleri override eder.
  guildPrivilegedUserIdsMock.mockResolvedValue(new Set());
}

// ── Sabit fixture'lar ─────────────────────────────────────────────────────────

const GUILD_ID = 'guild-1';
const CHANNEL_ID = 'ch-guild-1';
const DM_CHANNEL_ID = 'ch-dm-1';
const AUTHOR_ID = 'user-author';
const MEMBER_1_ID = 'user-member-1';
const MEMBER_2_ID = 'user-member-2';

function makeMessageDto(authorId = AUTHOR_ID) {
  return {
    id: 'msg-1',
    content: 'Merhaba!',
    createdAt: new Date().toISOString(),
    author: { id: authorId, username: 'author' },
    channelId: CHANNEL_ID,
  } as Record<string, unknown>;
}

// ── notifyChannelActivity ─────────────────────────────────────────────────────

describe('MessagesGateway.notifyChannelActivity', () => {
  let gateway: MessagesGateway;

  beforeEach(() => {
    resetMocks();
    gateway = makeGateway();
  });

  it('DM kanalı (guildId=null) → hiçbir şey yapılmaz', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: null });

    await gateway.notifyChannelActivity(DM_CHANNEL_ID, makeMessageDto());

    expect(prismaMock.guildMember.findMany).not.toHaveBeenCalled();
    expect(emitToUserMock).not.toHaveBeenCalled();
  });

  it('kanal bulunamazsa (null) → hiçbir şey yapılmaz', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(null);

    await gateway.notifyChannelActivity(CHANNEL_ID, makeMessageDto());

    expect(prismaMock.guildMember.findMany).not.toHaveBeenCalled();
    expect(emitToUserMock).not.toHaveBeenCalled();
  });

  it('guild kanalı → guild üyelerine channel.activity yayar', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.guildMember.findMany.mockResolvedValue([
      { userId: AUTHOR_ID },
      { userId: MEMBER_1_ID },
      { userId: MEMBER_2_ID },
    ]);

    await gateway.notifyChannelActivity(CHANNEL_ID, makeMessageDto());

    // Yaş kapısı yok → okuyabilen üyeye zengin payload (yazar adı + önizleme).
    const richPayload = {
      channelId: CHANNEL_ID,
      guildId: GUILD_ID,
      authorId: AUTHOR_ID,
      author: { id: AUTHOR_ID, username: 'author' },
      preview: 'Merhaba!',
    };
    expect(emitToUserMock).toHaveBeenCalledWith(MEMBER_1_ID, 'channel.activity', richPayload);
    expect(emitToUserMock).toHaveBeenCalledWith(MEMBER_2_ID, 'channel.activity', richPayload);
  });

  it('yaş-kapılı kanal → minör üye önizleme/içerik almaz (yalnız çıplak rozet)', async () => {
    // T&S: ageGated kanalda minör okuyamaz → basePayload (preview + author SIZMAZ); yetişkin richPayload alır.
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID, ageGated: true });
    prismaMock.guildMember.findMany.mockResolvedValue([
      { userId: AUTHOR_ID, user: { isMinor: false } },
      { userId: MEMBER_1_ID, user: { isMinor: false } }, // yetişkin → zengin
      { userId: MEMBER_2_ID, user: { isMinor: true } }, // minör → çıplak
    ]);

    await gateway.notifyChannelActivity(CHANNEL_ID, makeMessageDto());

    // Yetişkin: önizleme + yazar adı
    expect(emitToUserMock).toHaveBeenCalledWith(MEMBER_1_ID, 'channel.activity', {
      channelId: CHANNEL_ID,
      guildId: GUILD_ID,
      authorId: AUTHOR_ID,
      author: { id: AUTHOR_ID, username: 'author' },
      preview: 'Merhaba!',
    });
    // Minör: çıplak — preview/author ANAHTARLARI bulunmamalı (içerik sızıntısı yok)
    expect(emitToUserMock).toHaveBeenCalledWith(MEMBER_2_ID, 'channel.activity', {
      channelId: CHANNEL_ID,
      guildId: GUILD_ID,
      authorId: AUTHOR_ID,
    });
  });

  it('yazar kendine channel.activity almaz', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.guildMember.findMany.mockResolvedValue([
      { userId: AUTHOR_ID },
      { userId: MEMBER_1_ID },
    ]);

    await gateway.notifyChannelActivity(CHANNEL_ID, makeMessageDto());

    // AUTHOR_ID'ye emit edilmemeli
    expect(emitToUserMock).not.toHaveBeenCalledWith(
      AUTHOR_ID,
      expect.anything(),
      expect.anything(),
    );
    // MEMBER_1'e emit edilmeli
    expect(emitToUserMock).toHaveBeenCalledTimes(1);
    expect(emitToUserMock).toHaveBeenCalledWith(MEMBER_1_ID, 'channel.activity', expect.anything());
  });

  it('guild üyesi yok (sadece yazar) → hiçbir emit yapılmaz', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.guildMember.findMany.mockResolvedValue([{ userId: AUTHOR_ID }]);

    await gateway.notifyChannelActivity(CHANNEL_ID, makeMessageDto());

    expect(emitToUserMock).not.toHaveBeenCalled();
  });

  // ── 2026-11-08: ortam kanalı düz mesaj push'u (seviye ALL) ──
  describe('düz mesaj push', () => {
    beforeEach(() => {
      prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID, name: 'genel' });
      prismaMock.guildMember.findMany.mockResolvedValue([
        { userId: AUTHOR_ID, user: { isMinor: false } },
        { userId: MEMBER_1_ID, user: { isMinor: false } },
        { userId: MEMBER_2_ID, user: { isMinor: false } },
      ]);
    });

    it('tercih kaydı yok → varsayılan ALL, yazar hariç herkese CHANNEL_MESSAGE push', async () => {
      await gateway.notifyChannelActivity(CHANNEL_ID, makeMessageDto());

      expect(pushSendToUsersMock).toHaveBeenCalledTimes(1);
      const [recipients, payload] = pushSendToUsersMock.mock.calls[0];
      expect(recipients.sort()).toEqual([MEMBER_1_ID, MEMBER_2_ID].sort());
      expect(payload).toMatchObject({
        title: '#genel',
        body: 'author: Merhaba!',
        data: { type: 'CHANNEL_MESSAGE', guildId: GUILD_ID, channelId: CHANNEL_ID },
        tag: CHANNEL_ID,
        androidChannelId: 'messages_v6',
      });
    });

    // ── C50 §1: ortam mesajı v2 alanları ──
    describe('C50 v2', () => {
      afterEach(() => {
        delete (pushMock as any).v2Enabled;
      });

      it('bayrak kapalı → payload.v2 yok', async () => {
        await gateway.notifyChannelActivity(CHANNEL_ID, makeMessageDto());
        expect(pushSendToUsersMock.mock.calls[0][1].v2).toBeUndefined();
      });

      it('bayrak açık → "#kanal · Ortam" başlığı, ortam simgesi, yalnız önizleme (ad öneki yok)', async () => {
        (pushMock as any).v2Enabled = true;
        prismaMock.channel.findUnique.mockResolvedValue({
          guildId: GUILD_ID,
          name: 'genel',
          guild: { name: 'Ortam', iconUrl: 'https://cdn/g.png' },
        });
        const dto = makeMessageDto();
        (dto['author'] as Record<string, unknown>)['avatarUrl'] = 'https://cdn/a.png';

        await gateway.notifyChannelActivity(CHANNEL_ID, dto);

        const payload = pushSendToUsersMock.mock.calls[0][1];
        expect(payload.v2).toEqual({
          v: 2,
          kind: 'message',
          type: 'CHANNEL_MESSAGE',
          conversationId: CHANNEL_ID,
          guildId: GUILD_ID,
          messageId: 'msg-1',
          senderId: AUTHOR_ID,
          senderName: 'author',
          senderAvatarUrl: 'https://cdn/a.png',
          isGroup: true,
          conversationTitle: '#genel · Ortam',
          conversationIconUrl: 'https://cdn/g.png',
          text: 'Merhaba!',
          timestamp: new Date(dto['createdAt'] as string).getTime(),
        });
        // v1 alanları yerinde ve aynı
        expect(payload.title).toBe('#genel · Ortam');
        expect(payload.body).toBe('author: Merhaba!');
      });
    });

    it('MENTIONS / NONE / susturulmuş → push yok; kanal kaydı ortam kaydını ezer', async () => {
      prismaMock.notificationPref.findMany.mockResolvedValue([
        // MEMBER_1: ortam ALL ama kanal MENTIONS → kanal kazanır, push yok
        { userId: MEMBER_1_ID, targetType: 'GUILD', muted: false, mutedUntil: null, level: 'ALL' },
        {
          userId: MEMBER_1_ID,
          targetType: 'CHANNEL',
          muted: false,
          mutedUntil: null,
          level: 'MENTIONS',
        },
        // MEMBER_2: ortam susturulmuş, kanal ALL olsa da push yok
        { userId: MEMBER_2_ID, targetType: 'GUILD', muted: true, mutedUntil: null, level: 'ALL' },
        {
          userId: MEMBER_2_ID,
          targetType: 'CHANNEL',
          muted: false,
          mutedUntil: null,
          level: 'ALL',
        },
      ]);

      await gateway.notifyChannelActivity(CHANNEL_ID, makeMessageDto());

      expect(pushSendToUsersMock).not.toHaveBeenCalled();
    });

    it('süresi geçmiş susturma → push gider', async () => {
      prismaMock.notificationPref.findMany.mockResolvedValue([
        {
          userId: MEMBER_1_ID,
          targetType: 'GUILD',
          muted: true,
          mutedUntil: new Date(Date.now() - 60_000),
          level: 'ALL',
        },
      ]);

      await gateway.notifyChannelActivity(CHANNEL_ID, makeMessageDto());

      expect(pushSendToUsersMock.mock.calls[0][0]).toContain(MEMBER_1_ID);
    });

    it('ortam simgesi görsel, ortam adı başlıkta gider', async () => {
      prismaMock.channel.findUnique.mockResolvedValue({
        guildId: GUILD_ID,
        name: 'genel',
        guild: {
          adultsOnly: false,
          name: 'Kankalar',
          iconUrl: 'https://cdn.kankaverse.com/icons/g.webp',
        },
      });

      await gateway.notifyChannelActivity(CHANNEL_ID, makeMessageDto());

      expect(pushSendToUsersMock.mock.calls[0][1].title).toBe('#genel · Kankalar');

      expect(pushSendToUsersMock.mock.calls[0][1].imageUrl).toBe(
        'https://cdn.kankaverse.com/icons/g.webp',
      );
    });

    it('doğrudan bahsedilen bu yoldan push almaz (MENTION yolu gönderiyor)', async () => {
      const dto = { ...makeMessageDto(), mentions: [MEMBER_1_ID] };

      await gateway.notifyChannelActivity(CHANNEL_ID, dto);

      expect(pushSendToUsersMock.mock.calls[0][0]).toEqual([MEMBER_2_ID]);
    });

    it('@everyone veya rol bahsetmesi içeren mesaj → bu yol çalışmaz', async () => {
      await gateway.notifyChannelActivity(CHANNEL_ID, {
        ...makeMessageDto(),
        mentionsEveryone: true,
      });
      await gateway.notifyChannelActivity(CHANNEL_ID, {
        ...makeMessageDto(),
        mentionRoles: ['role-1'],
      });

      expect(pushSendToUsersMock).not.toHaveBeenCalled();
    });

    it('yaş-kapılı kanalda minör push almaz (önizleme sızmaz)', async () => {
      prismaMock.channel.findUnique.mockResolvedValue({
        guildId: GUILD_ID,
        name: 'genel',
        ageGated: true,
      });
      prismaMock.guildMember.findMany.mockResolvedValue([
        { userId: AUTHOR_ID, user: { isMinor: false } },
        { userId: MEMBER_1_ID, user: { isMinor: false } },
        { userId: MEMBER_2_ID, user: { isMinor: true } },
      ]);

      await gateway.notifyChannelActivity(CHANNEL_ID, makeMessageDto());

      expect(pushSendToUsersMock.mock.calls[0][0]).toEqual([MEMBER_1_ID]);
    });
  });
});

// ── MessagesGateway.notifyDmActivity — M3 §2.6 DM push ───────────────────────

describe('MessagesGateway.notifyDmActivity — push (M3 §2.6)', () => {
  let gateway: MessagesGateway;

  const DM_MEMBER_ID = 'user-dm-member';
  const GROUP_MEMBER_1 = 'user-group-1';
  const GROUP_MEMBER_2 = 'user-group-2';

  function makeDmMessageDto(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'msg-dm-1',
      content: 'selam nasılsın',
      createdAt: new Date().toISOString(),
      author: { id: AUTHOR_ID, username: 'yazar' },
      channelId: DM_CHANNEL_ID,
      ...overrides,
    } as Record<string, unknown>;
  }

  beforeEach(() => {
    resetMocks();
    gateway = makeGateway();
  });

  it('1-1 DM: susturulmuş alıcıya push GİTMEZ (shouldNotifyChannel false)', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({
      guildId: null,
      dmRequestStatus: null,
      dmRequesterId: null,
    });
    prismaMock.channelMember.findMany.mockResolvedValue([
      { userId: AUTHOR_ID },
      { userId: DM_MEMBER_ID },
    ]);
    notificationsShouldNotifyMock.mockResolvedValue(false);

    await gateway.notifyDmActivity(DM_CHANNEL_ID, makeDmMessageDto());

    expect(notificationsShouldNotifyMock).toHaveBeenCalledWith(DM_MEMBER_ID, null, DM_CHANNEL_ID);
    expect(pushSendToUsersMock).not.toHaveBeenCalled();
  });

  it('1-1 DM: yazarın avatarı görsel olarak gider; grup DM: görsel yok', async () => {
    prismaMock.channelMember.findMany.mockResolvedValue([
      { userId: AUTHOR_ID },
      { userId: DM_MEMBER_ID },
    ]);
    notificationsShouldNotifyMock.mockResolvedValue(true);
    const dto = makeDmMessageDto({
      author: { id: AUTHOR_ID, username: 'yazar', avatarUrl: 'https://cdn.kankaverse.com/a.webp' },
    });

    prismaMock.channel.findUnique.mockResolvedValue({ guildId: null, type: 'DM' });
    await gateway.notifyDmActivity(DM_CHANNEL_ID, dto);
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: null, type: 'GROUP_DM' });
    await gateway.notifyDmActivity(DM_CHANNEL_ID, dto);

    expect(pushSendToUsersMock.mock.calls[0][1].imageUrl).toBe('https://cdn.kankaverse.com/a.webp');
    expect(pushSendToUsersMock.mock.calls[1][1].imageUrl).toBeNull();
  });

  it('yazara push gitmez (alıcı kümesinden filtrelenir)', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({
      guildId: null,
      dmRequestStatus: null,
      dmRequesterId: null,
    });
    prismaMock.channelMember.findMany.mockResolvedValue([
      { userId: AUTHOR_ID },
      { userId: DM_MEMBER_ID },
    ]);

    await gateway.notifyDmActivity(DM_CHANNEL_ID, makeDmMessageDto());

    expect(notificationsShouldNotifyMock).not.toHaveBeenCalledWith(AUTHOR_ID, null, DM_CHANNEL_ID);
    expect(pushSendToUsersMock).toHaveBeenCalledTimes(1);
    const [targets] = pushSendToUsersMock.mock.calls[0];
    expect(targets).not.toContain(AUTHOR_ID);
    expect(targets).toEqual([DM_MEMBER_ID]);
  });

  it('grup DM: yazar hariç diğer TÜM üyelere push gider', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({
      guildId: null,
      dmRequestStatus: null,
      dmRequesterId: null,
    });
    prismaMock.channelMember.findMany.mockResolvedValue([
      { userId: AUTHOR_ID },
      { userId: GROUP_MEMBER_1 },
      { userId: GROUP_MEMBER_2 },
    ]);

    await gateway.notifyDmActivity(DM_CHANNEL_ID, makeDmMessageDto());

    expect(pushSendToUsersMock).toHaveBeenCalledTimes(1);
    const [targets, payload] = pushSendToUsersMock.mock.calls[0];
    expect(targets).toEqual(expect.arrayContaining([GROUP_MEMBER_1, GROUP_MEMBER_2]));
    expect(targets).toHaveLength(2);
    expect(payload.title).toBe('yazar');
    expect(payload.body).toBe('selam nasılsın');
    expect(payload.data).toEqual({ type: 'DM_MESSAGE', channelId: DM_CHANNEL_ID });
  });

  it('DM mesajı için kalıcı bildirim kaydı OLUŞMAZ (notifications.create çağrılmaz)', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({
      guildId: null,
      dmRequestStatus: null,
      dmRequesterId: null,
    });
    prismaMock.channelMember.findMany.mockResolvedValue([
      { userId: AUTHOR_ID },
      { userId: DM_MEMBER_ID },
    ]);

    await gateway.notifyDmActivity(DM_CHANNEL_ID, makeDmMessageDto());

    expect(notificationsCreateMock).not.toHaveBeenCalled();
  });

  it('gövde ≤100 karaktere kırpılır', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({
      guildId: null,
      dmRequestStatus: null,
      dmRequesterId: null,
    });
    prismaMock.channelMember.findMany.mockResolvedValue([
      { userId: AUTHOR_ID },
      { userId: DM_MEMBER_ID },
    ]);

    await gateway.notifyDmActivity(DM_CHANNEL_ID, makeDmMessageDto({ content: 'a'.repeat(200) }));

    const [, payload] = pushSendToUsersMock.mock.calls[0];
    expect(payload.body.length).toBe(100);
  });

  it('bekleyen mesaj isteği (PENDING) → push gönderilmez', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({
      guildId: null,
      dmRequestStatus: 'PENDING',
      dmRequesterId: AUTHOR_ID,
    });
    prismaMock.channelMember.findMany.mockResolvedValue([
      { userId: AUTHOR_ID },
      { userId: DM_MEMBER_ID },
    ]);

    await gateway.notifyDmActivity(DM_CHANNEL_ID, makeDmMessageDto());

    expect(pushSendToUsersMock).not.toHaveBeenCalled();
  });

  it('guild kanalı (guildId dolu) → push gönderilmez', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });

    await gateway.notifyDmActivity(CHANNEL_ID, makeDmMessageDto({ channelId: CHANNEL_ID }));

    expect(pushSendToUsersMock).not.toHaveBeenCalled();
  });

  // ── C50 §1: DM v2 alanları ──
  describe('C50 v2', () => {
    afterEach(() => {
      delete (pushMock as any).v2Enabled;
    });

    function dmChannel(type: string, name: string | null) {
      return { guildId: null, type, name, dmRequestStatus: null, dmRequesterId: null };
    }

    it('bayrak kapalı → payload.v2 yok', async () => {
      prismaMock.channel.findUnique.mockResolvedValue(dmChannel('DM', null));
      prismaMock.channelMember.findMany.mockResolvedValue([
        { userId: AUTHOR_ID },
        { userId: DM_MEMBER_ID },
      ]);

      await gateway.notifyDmActivity(DM_CHANNEL_ID, makeDmMessageDto());

      expect(pushSendToUsersMock.mock.calls[0][1].v2).toBeUndefined();
    });

    it('1-1 DM → isGroup false, conversationTitle null, simge null, avatar yazardan', async () => {
      (pushMock as any).v2Enabled = true;
      prismaMock.channel.findUnique.mockResolvedValue(dmChannel('DM', null));
      prismaMock.channelMember.findMany.mockResolvedValue([
        { userId: AUTHOR_ID },
        { userId: DM_MEMBER_ID },
      ]);
      const dto = makeDmMessageDto({
        author: { id: AUTHOR_ID, username: 'yazar', avatarUrl: 'https://cdn/a.png' },
      });

      await gateway.notifyDmActivity(DM_CHANNEL_ID, dto);

      expect(pushSendToUsersMock.mock.calls[0][1].v2).toEqual({
        v: 2,
        kind: 'message',
        type: 'DM_MESSAGE',
        conversationId: DM_CHANNEL_ID,
        guildId: null,
        messageId: 'msg-dm-1',
        senderId: AUTHOR_ID,
        senderName: 'yazar',
        senderAvatarUrl: 'https://cdn/a.png',
        isGroup: false,
        conversationTitle: null,
        conversationIconUrl: null,
        text: 'selam nasılsın',
        timestamp: new Date(dto['createdAt'] as string).getTime(),
      });
    });

    it('grup DM → isGroup true, conversationTitle grup adı, simge null', async () => {
      (pushMock as any).v2Enabled = true;
      prismaMock.channel.findUnique.mockResolvedValue(dmChannel('GROUP_DM', 'Takım'));
      prismaMock.channelMember.findMany.mockResolvedValue([
        { userId: AUTHOR_ID },
        { userId: GROUP_MEMBER_1 },
      ]);

      await gateway.notifyDmActivity(DM_CHANNEL_ID, makeDmMessageDto());

      expect(pushSendToUsersMock.mock.calls[0][1].v2).toMatchObject({
        type: 'DM_MESSAGE',
        isGroup: true,
        conversationTitle: 'Takım',
        conversationIconUrl: null,
        senderAvatarUrl: null,
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // M3 sonrası KUSUR 2 — DM'de etiketlenen kullanıcı `notifyMentions` yolundan zaten push aldı;
  // `sendDmPush` onu İKİNCİ KEZ göndermemeli (aksi hâlde telefona iki bildirim düşer).
  // ─────────────────────────────────────────────────────────────────────────
  it('KUSUR 2 — grup DM: doğrudan bahsedilen üyeye sendDmPush GÖNDERMEZ, diğerine gönderir', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({
      guildId: null,
      dmRequestStatus: null,
      dmRequesterId: null,
    });
    prismaMock.channelMember.findMany.mockResolvedValue([
      { userId: AUTHOR_ID },
      { userId: GROUP_MEMBER_1 },
      { userId: GROUP_MEMBER_2 },
    ]);

    await gateway.notifyDmActivity(
      DM_CHANNEL_ID,
      makeDmMessageDto({
        content: `<@${GROUP_MEMBER_1}> bakar mısın`,
        mentions: [GROUP_MEMBER_1],
      }),
    );

    expect(pushSendToUsersMock).toHaveBeenCalledTimes(1);
    const [targets] = pushSendToUsersMock.mock.calls[0];
    expect(targets).not.toContain(GROUP_MEMBER_1);
    expect(targets).toEqual([GROUP_MEMBER_2]);
  });

  it('KUSUR 2 — tüm üyeler doğrudan bahsedilmişse (mentions == alıcılar) push hiç gönderilmez', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({
      guildId: null,
      dmRequestStatus: null,
      dmRequesterId: null,
    });
    prismaMock.channelMember.findMany.mockResolvedValue([
      { userId: AUTHOR_ID },
      { userId: DM_MEMBER_ID },
    ]);

    await gateway.notifyDmActivity(
      DM_CHANNEL_ID,
      makeDmMessageDto({
        content: `<@${DM_MEMBER_ID}> selam`,
        mentions: [DM_MEMBER_ID],
      }),
    );

    expect(pushSendToUsersMock).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // M3 sonrası KUSUR 3 — DM push gövdesi ham `<@id>` token'ı göstermemeli, `notifyMentions`
  // ile AYNI çözümden (resolveMentionPreview) geçmeli.
  // ─────────────────────────────────────────────────────────────────────────
  it('KUSUR 3 — DM push gövdesinde ham bahsetme tokeni kalmaz, @kullanıcıadına çözülür', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({
      guildId: null,
      dmRequestStatus: null,
      dmRequesterId: null,
    });
    prismaMock.channelMember.findMany.mockResolvedValue([
      { userId: AUTHOR_ID },
      { userId: DM_MEMBER_ID },
      { userId: GROUP_MEMBER_1 },
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: GROUP_MEMBER_1, username: 'kankakullanici' },
    ]);

    await gateway.notifyDmActivity(
      DM_CHANNEL_ID,
      makeDmMessageDto({
        content: `<@${GROUP_MEMBER_1}> bir bak`,
        mentions: [GROUP_MEMBER_1],
      }),
    );

    // GROUP_MEMBER_1 doğrudan bahsedilen — push almaz (KUSUR 2); yalnız DM_MEMBER_ID kalır.
    expect(pushSendToUsersMock).toHaveBeenCalledTimes(1);
    const [, payload] = pushSendToUsersMock.mock.calls[0];
    expect(payload.body).not.toMatch(/<@/);
    expect(payload.body).toBe('@kankakullanici bir bak');
  });
});

// ── MessagesGateway.notifyMentions (§5) ──────────────────────────────────────

describe('MessagesGateway.notifyMentions', () => {
  let gateway: MessagesGateway;

  const MENTIONED_USER_1 = 'user-mentioned-1';
  const MENTIONED_USER_2 = 'user-mentioned-2';

  function makeMentionDto(
    overrides: Partial<{
      mentions: string[];
      authorId: string;
      content: string;
    }> = {},
  ) {
    const authorId = overrides.authorId ?? AUTHOR_ID;
    const mentions = overrides.mentions ?? [MENTIONED_USER_1];
    const content = overrides.content ?? `<@${MENTIONED_USER_1}> buna bakabilir misin`;
    return {
      id: 'msg-mention-1',
      channelId: CHANNEL_ID,
      content,
      mentions,
      author: { id: authorId, username: 'author', avatarUrl: null },
      createdAt: new Date().toISOString(),
    } as Record<string, unknown>;
  }

  beforeEach(() => {
    resetMocks();
    gateway = makeGateway();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // mentions boşsa erken çık
  // ─────────────────────────────────────────────────────────────────────────
  it('mentions boş dizi → erken çıkar, emit yapılmaz', async () => {
    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({ mentions: [] }));

    expect(emitToUserMock).not.toHaveBeenCalled();
    expect(prismaMock.channel.findUnique).not.toHaveBeenCalled();
  });

  it('mentions undefined → erken çıkar, emit yapılmaz', async () => {
    const dto = makeMentionDto({ mentions: [] });
    delete dto['mentions'];

    await gateway.notifyMentions(CHANNEL_ID, dto);

    expect(emitToUserMock).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // yazar kendine mention eventi almaz
  // ─────────────────────────────────────────────────────────────────────────
  it('bahsedilen userId === authorId → event gönderilmez', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([{ id: AUTHOR_ID, username: 'author' }]);

    // yazar kendini bahsediyor
    await gateway.notifyMentions(
      CHANNEL_ID,
      makeMentionDto({
        mentions: [AUTHOR_ID],
        authorId: AUTHOR_ID,
        content: `<@${AUTHOR_ID}> bla`,
      }),
    );

    expect(emitToUserMock).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // başarılı mention eventi: §5 payload şekli
  // ─────────────────────────────────────────────────────────────────────────
  it('başarılı mention → bahsedilene §5 payload ile emit yapılır', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([{ id: MENTIONED_USER_1, username: 'kanka1' }]);

    await gateway.notifyMentions(
      CHANNEL_ID,
      makeMentionDto({
        mentions: [MENTIONED_USER_1],
        authorId: AUTHOR_ID,
        content: `<@${MENTIONED_USER_1}> buna bakar mısın`,
      }),
    );

    expect(emitToUserMock).toHaveBeenCalledTimes(1);
    const [targetId, event, payload] = emitToUserMock.mock.calls[0];
    expect(targetId).toBe(MENTIONED_USER_1);
    expect(event).toBe('mention');
    expect(payload.messageId).toBe('msg-mention-1');
    expect(payload.channelId).toBe(CHANNEL_ID);
    expect(payload.guildId).toBe(GUILD_ID);
    expect(payload.author.id).toBe(AUTHOR_ID);
    expect(payload.preview).toContain('@kanka1');
    expect(payload.preview.length).toBeLessThanOrEqual(100);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DM kanalı: guildId null
  // ─────────────────────────────────────────────────────────────────────────
  it('DM kanalı → payload guildId=null', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: null });
    prismaMock.user.findMany.mockResolvedValue([{ id: MENTIONED_USER_1, username: 'kanka1' }]);

    await gateway.notifyMentions(
      DM_CHANNEL_ID,
      makeMentionDto({
        mentions: [MENTIONED_USER_1],
        authorId: AUTHOR_ID,
      }),
    );

    const [, , payload] = emitToUserMock.mock.calls[0];
    expect(payload.guildId).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // preview: token → @username çözülür; ≤100 karakter
  // ─────────────────────────────────────────────────────────────────────────
  it('preview: token @id → @username çözülür', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([
      { id: MENTIONED_USER_1, username: 'kankakullanici' },
    ]);

    await gateway.notifyMentions(
      CHANNEL_ID,
      makeMentionDto({
        mentions: [MENTIONED_USER_1],
        content: `<@${MENTIONED_USER_1}> selam`,
      }),
    );

    const [, , payload] = emitToUserMock.mock.calls[0];
    expect(payload.preview).toBe('@kankakullanici selam');
  });

  it('preview: çözülemeyen token → @bilinmeyen', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([{ id: MENTIONED_USER_1, username: 'kanka1' }]);
    const UNKNOWN_ID = 'user-unknown-xyz';

    await gateway.notifyMentions(
      CHANNEL_ID,
      makeMentionDto({
        mentions: [MENTIONED_USER_1],
        content: `<@${MENTIONED_USER_1}> ve <@${UNKNOWN_ID}>`,
      }),
    );

    const [, , payload] = emitToUserMock.mock.calls[0];
    expect(payload.preview).toContain('@bilinmeyen');
    expect(payload.preview).toContain('@kanka1');
  });

  it('preview: 100 karakteri aşan içerik kesilir', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([{ id: MENTIONED_USER_1, username: 'k' }]);
    const longContent = `<@${MENTIONED_USER_1}> ` + 'a'.repeat(200);

    await gateway.notifyMentions(
      CHANNEL_ID,
      makeMentionDto({
        mentions: [MENTIONED_USER_1],
        content: longContent,
      }),
    );

    const [, , payload] = emitToUserMock.mock.calls[0];
    expect(payload.preview.length).toBeLessThanOrEqual(100);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // birden fazla bahsedilen: her biri için ayrı emit
  // ─────────────────────────────────────────────────────────────────────────
  it('iki bahsedilen → iki ayrı emit; yazar hariç', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([
      { id: MENTIONED_USER_1, username: 'kanka1' },
      { id: MENTIONED_USER_2, username: 'kanka2' },
    ]);

    await gateway.notifyMentions(
      CHANNEL_ID,
      makeMentionDto({
        mentions: [MENTIONED_USER_1, MENTIONED_USER_2],
        authorId: AUTHOR_ID,
        content: `<@${MENTIONED_USER_1}> ve <@${MENTIONED_USER_2}>`,
      }),
    );

    expect(emitToUserMock).toHaveBeenCalledTimes(2);
    const targets = emitToUserMock.mock.calls.map((c) => c[0]);
    expect(targets).toContain(MENTIONED_USER_1);
    expect(targets).toContain(MENTIONED_USER_2);
    expect(targets).not.toContain(AUTHOR_ID);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // §2 — MENTION kalıcı bildirim üretimi (resolveMentions çıktısı kaynak)
  // ─────────────────────────────────────────────────────────────────────────
  it('her bahsedilen için notifications.create(MENTION) çağrılır — resolveMentions çıktısı aynen', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([
      { id: MENTIONED_USER_1, username: 'kanka1' },
      { id: MENTIONED_USER_2, username: 'kanka2' },
    ]);

    await gateway.notifyMentions(
      CHANNEL_ID,
      makeMentionDto({
        mentions: [MENTIONED_USER_1, MENTIONED_USER_2],
        authorId: AUTHOR_ID,
        content: `<@${MENTIONED_USER_1}> ve <@${MENTIONED_USER_2}>`,
      }),
    );

    expect(notificationsCreateMock).toHaveBeenCalledTimes(2);
    const recipients = notificationsCreateMock.mock.calls.map((c) => c[0]);
    expect(recipients).toEqual(expect.arrayContaining([MENTIONED_USER_1, MENTIONED_USER_2]));
    // §2 şekli: type MENTION + actor=author + navigasyon alanları
    const [, data] = notificationsCreateMock.mock.calls[0];
    expect(data.type).toBe('MENTION');
    expect(data.actorId).toBe(AUTHOR_ID);
    expect(data.channelId).toBe(CHANNEL_ID);
    expect(data.guildId).toBe(GUILD_ID);
    expect(data.messageId).toBe('msg-mention-1');
    expect(typeof data.preview).toBe('string');
  });

  it('author === mentioned → notifications.create çağrılmaz (mevcut atlama kuralı miras)', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([{ id: AUTHOR_ID, username: 'author' }]);

    await gateway.notifyMentions(
      CHANNEL_ID,
      makeMentionDto({
        mentions: [AUTHOR_ID],
        authorId: AUTHOR_ID,
        content: `<@${AUTHOR_ID}> bla`,
      }),
    );

    expect(notificationsCreateMock).not.toHaveBeenCalled();
  });

  it('mentions boş → notifications.create çağrılmaz (resolveMentions kaynağı boş)', async () => {
    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({ mentions: [] }));

    expect(notificationsCreateMock).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // R12 — Suppression: shouldNotifyChannel false → create çağrılmaz (ne persist ne emit)
  // ─────────────────────────────────────────────────────────────────────────
  it('shouldNotifyChannel false (muted/NONE) → notifications.create çağrılmaz', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([{ id: MENTIONED_USER_1, username: 'kanka1' }]);
    notificationsShouldNotifyMock.mockResolvedValue(false);

    await gateway.notifyMentions(
      CHANNEL_ID,
      makeMentionDto({
        mentions: [MENTIONED_USER_1],
        authorId: AUTHOR_ID,
        content: `<@${MENTIONED_USER_1}> selam`,
      }),
    );

    expect(notificationsShouldNotifyMock).toHaveBeenCalledWith(
      MENTIONED_USER_1,
      GUILD_ID,
      CHANNEL_ID,
    );
    expect(notificationsCreateMock).not.toHaveBeenCalled();
    // anlık `mention` WS eventi yine de gider (tercih yalnız kalıcı bildirimi süzer)
    expect(emitToUserMock).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // R14 §2.4a — @everyone bastırma (ne emit ne persist); doğrudan bahsetme geçer
  // ─────────────────────────────────────────────────────────────────────────
  describe('@everyone bastırma (R14)', () => {
    const EVERYONE_ONLY_ID = 'user-everyone-only';

    function makeEveryoneDto(mentions: string[] = []) {
      return {
        id: 'msg-everyone-1',
        channelId: CHANNEL_ID,
        content: mentions.length
          ? `<@&role-everyone> ve <@${mentions[0]}>`
          : '<@&role-everyone> herkes',
        mentions,
        mentionsEveryone: true,
        author: { id: AUTHOR_ID, username: 'author', avatarUrl: null },
        createdAt: new Date().toISOString(),
      } as Record<string, unknown>;
    }

    it('suppressEveryone=true → everyone alıcısına NE emit NE persist', async () => {
      prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID, isPrivate: false });
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.guildMember.findMany.mockResolvedValue([
        { userId: AUTHOR_ID, user: { isMinor: false } },
        { userId: EVERYONE_ONLY_ID, user: { isMinor: false } },
      ]);
      prismaMock.notificationPref.findMany.mockResolvedValue([
        { userId: EVERYONE_ONLY_ID, suppressEveryone: true },
      ]);

      await gateway.notifyMentions(CHANNEL_ID, makeEveryoneDto());

      expect(emitToUserMock).not.toHaveBeenCalled();
      expect(notificationsCreateMock).not.toHaveBeenCalled();
    });

    // REGRESYON KİLİDİ (sözleşme §2.5): bastırma yalnız genişlemeden geleni keser.
    it('bastırma açık ama AYNI mesajda doğrudan bahsedilen kullanıcı bildirimi ALIR', async () => {
      prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID, isPrivate: false });
      prismaMock.user.findMany.mockResolvedValue([{ id: MENTIONED_USER_1, username: 'kanka1' }]);
      prismaMock.guildMember.findMany.mockResolvedValue([
        { userId: AUTHOR_ID, user: { isMinor: false } },
        { userId: MENTIONED_USER_1, user: { isMinor: false } },
        { userId: EVERYONE_ONLY_ID, user: { isMinor: false } },
      ]);
      // İkisi de bastırma açmış; ama MENTIONED_USER_1 doğrudan bahsediliyor → geçer.
      prismaMock.notificationPref.findMany.mockResolvedValue([
        { userId: EVERYONE_ONLY_ID, suppressEveryone: true },
      ]);

      await gateway.notifyMentions(CHANNEL_ID, makeEveryoneDto([MENTIONED_USER_1]));

      // Tercih sorgusu YALNIZ genişlemeden gelenler için (doğrudan bahsedilen kapsam DIŞI)
      const prefCall = prismaMock.notificationPref.findMany.mock.calls[0][0];
      expect(prefCall.where.userId.in).toContain(EVERYONE_ONLY_ID);
      expect(prefCall.where.userId.in).not.toContain(MENTIONED_USER_1);
      expect(prefCall.where.targetType).toBe('GUILD');
      expect(prefCall.where.targetId).toBe(GUILD_ID);

      // Doğrudan bahsedilen: hem emit hem persist
      expect(emitToUserMock).toHaveBeenCalledTimes(1);
      expect(emitToUserMock).toHaveBeenCalledWith(MENTIONED_USER_1, 'mention', expect.anything());
      expect(notificationsCreateMock).toHaveBeenCalledTimes(1);
      expect(notificationsCreateMock.mock.calls[0][0]).toBe(MENTIONED_USER_1);
    });

    it('bastırma kaydı yok → everyone alıcısı normal şekilde emit + persist alır', async () => {
      prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID, isPrivate: false });
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.guildMember.findMany.mockResolvedValue([
        { userId: AUTHOR_ID, user: { isMinor: false } },
        { userId: EVERYONE_ONLY_ID, user: { isMinor: false } },
      ]);

      await gateway.notifyMentions(CHANNEL_ID, makeEveryoneDto());

      expect(emitToUserMock).toHaveBeenCalledWith(EVERYONE_ONLY_ID, 'mention', expect.anything());
      expect(notificationsCreateMock).toHaveBeenCalledTimes(1);
    });

    it('T&S regresyon: özel kanalda everyone yalnız kanal üyeleri + tam yetkiliye gider (sızıntı yok)', async () => {
      prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID, isPrivate: true });
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.channelMember.findMany.mockResolvedValue([{ userId: EVERYONE_ONLY_ID }]);
      // R20: tam yetkili (OWNER/ADMINISTRATOR) kümesi artık PermissionsService'ten gelir.
      guildPrivilegedUserIdsMock.mockResolvedValue(new Set([AUTHOR_ID]));

      await gateway.notifyMentions(CHANNEL_ID, makeEveryoneDto());

      const targets = emitToUserMock.mock.calls.map((c) => c[0]);
      expect(targets).toEqual([EVERYONE_ONLY_ID]); // guild geneline SIZMAZ
    });

    it('T&S regresyon: yaş-kapılı kanalda minör everyone bildirimi almaz', async () => {
      prismaMock.channel.findUnique.mockResolvedValue({
        guildId: GUILD_ID,
        isPrivate: false,
        ageGated: true,
      });
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.guildMember.findMany.mockResolvedValue([
        { userId: AUTHOR_ID, user: { isMinor: false } },
        { userId: EVERYONE_ONLY_ID, user: { isMinor: false } },
        { userId: 'user-minor', user: { isMinor: true } },
      ]);

      await gateway.notifyMentions(CHANNEL_ID, makeEveryoneDto());

      const targets = emitToUserMock.mock.calls.map((c) => c[0]);
      expect(targets).toEqual([EVERYONE_ONLY_ID]);
      expect(targets).not.toContain('user-minor');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sprint R15 §2.5/§2.7 — rol bahsetmesi alıcı kümesi (T&S süzgeçleri + susturma)
// ═══════════════════════════════════════════════════════════════════════════════
describe('MessagesGateway.notifyMentions — rol bahsetmesi (R15)', () => {
  let gateway: MessagesGateway;

  const ROLE_MOD = 'role-mod';
  const ROLE_MEMBER_1 = 'user-role-1';
  const ROLE_MEMBER_2 = 'user-role-2';
  const DIRECT_USER = 'user-direct';

  function roleDto(overrides: Record<string, unknown> = {}) {
    return {
      id: 'msg-role-1',
      channelId: CHANNEL_ID,
      content: `<@&${ROLE_MOD}> toplantı var`,
      mentions: [],
      mentionsEveryone: false,
      mentionRoles: [ROLE_MOD],
      author: { id: AUTHOR_ID, username: 'author', avatarUrl: null },
      createdAt: new Date().toISOString(),
      ...overrides,
    } as Record<string, unknown>;
  }

  /** Rol üyeleri fixture — `guildMemberRole.findMany` select şekliyle birebir. */
  function roleMembers(...entries: { userId: string; isMinor?: boolean }[]) {
    return entries.map((e) => ({
      member: { userId: e.userId, user: { isMinor: e.isMinor ?? false } },
    }));
  }

  beforeEach(() => {
    resetMocks();
    gateway = makeGateway();
    prismaMock.channel.findUnique.mockResolvedValue({
      guildId: GUILD_ID,
      isPrivate: false,
      ageGated: false,
      guild: { adultsOnly: false },
    });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.role.findMany.mockResolvedValue([
      { id: ROLE_MOD, name: 'Moderatör', isEveryone: false },
    ]);
  });

  it('rol üyelerine bildirim gider, rolde olmayana gitmez', async () => {
    prismaMock.guildMemberRole.findMany.mockResolvedValue(
      roleMembers({ userId: ROLE_MEMBER_1 }, { userId: ROLE_MEMBER_2 }),
    );

    await gateway.notifyMentions(CHANNEL_ID, roleDto());

    const notified = emitToUserMock.mock.calls.filter((c) => c[1] === 'mention').map((c) => c[0]);
    expect(notified).toEqual(expect.arrayContaining([ROLE_MEMBER_1, ROLE_MEMBER_2]));
    expect(notified).not.toContain('user-baska');
  });

  it('yazar kendi rol bahsetmesinden bildirim ALMAZ', async () => {
    prismaMock.guildMemberRole.findMany.mockResolvedValue(
      roleMembers({ userId: AUTHOR_ID }, { userId: ROLE_MEMBER_1 }),
    );

    await gateway.notifyMentions(CHANNEL_ID, roleDto());

    const notified = emitToUserMock.mock.calls.filter((c) => c[1] === 'mention').map((c) => c[0]);
    expect(notified).not.toContain(AUTHOR_ID);
    expect(notified).toContain(ROLE_MEMBER_1);
  });

  it('ÖZEL kanal → rol sahibi kanal üyesi değilse ping ALMAZ (sızıntı kapısı)', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({
      guildId: GUILD_ID,
      isPrivate: true,
      ageGated: false,
      guild: { adultsOnly: false },
    });
    // Kanal üyesi yalnız ROLE_MEMBER_1; ROLE_MEMBER_2 rolde ama kanalda değil
    prismaMock.channelMember.findMany.mockResolvedValue([{ userId: ROLE_MEMBER_1 }]);
    guildPrivilegedUserIdsMock.mockResolvedValue(new Set()); // tam yetkili yok
    prismaMock.guildMemberRole.findMany.mockResolvedValue(
      roleMembers({ userId: ROLE_MEMBER_1 }, { userId: ROLE_MEMBER_2 }),
    );

    await gateway.notifyMentions(CHANNEL_ID, roleDto());

    const notified = emitToUserMock.mock.calls.filter((c) => c[1] === 'mention').map((c) => c[0]);
    expect(notified).toContain(ROLE_MEMBER_1);
    expect(notified).not.toContain(ROLE_MEMBER_2);
  });

  it('YAŞ-KAPILI kanal → minör rol sahibi ping ALMAZ', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({
      guildId: GUILD_ID,
      isPrivate: false,
      ageGated: true,
      guild: { adultsOnly: false },
    });
    prismaMock.guildMemberRole.findMany.mockResolvedValue(
      roleMembers({ userId: ROLE_MEMBER_1, isMinor: true }, { userId: ROLE_MEMBER_2 }),
    );

    await gateway.notifyMentions(CHANNEL_ID, roleDto());

    const notified = emitToUserMock.mock.calls.filter((c) => c[1] === 'mention').map((c) => c[0]);
    expect(notified).not.toContain(ROLE_MEMBER_1);
    expect(notified).toContain(ROLE_MEMBER_2);
  });

  it('suppressRoleMentions açık → rol pingi düşmez, AMA doğrudan bahsedilen ALIR (regresyon kilidi)', async () => {
    prismaMock.guildMemberRole.findMany.mockResolvedValue(
      roleMembers({ userId: ROLE_MEMBER_1 }, { userId: DIRECT_USER }),
    );
    // Her iki kullanıcı da rol bahsetmesini susturmuş; DIRECT_USER ayrıca adıyla çağrılıyor.
    prismaMock.notificationPref.findMany.mockResolvedValue([
      { userId: ROLE_MEMBER_1, suppressEveryone: false, suppressRoleMentions: true },
      { userId: DIRECT_USER, suppressEveryone: false, suppressRoleMentions: true },
    ]);

    await gateway.notifyMentions(
      CHANNEL_ID,
      roleDto({
        mentions: [DIRECT_USER],
        content: `<@&${ROLE_MOD}> ve <@${DIRECT_USER}>`,
      }),
    );

    const notified = emitToUserMock.mock.calls.filter((c) => c[1] === 'mention').map((c) => c[0]);
    expect(notified).not.toContain(ROLE_MEMBER_1); // yalnız rolden geliyordu → susturuldu
    expect(notified).toContain(DIRECT_USER); // adıyla çağrıldı → bastırma onu kesmez
  });

  it('hem @everyone hem rolden gelen kullanıcı: yalnız BİRİNİ susturmuşsa yine alır', async () => {
    prismaMock.guildMember.findMany.mockResolvedValue([
      { userId: ROLE_MEMBER_1, user: { isMinor: false } },
    ]);
    prismaMock.guildMemberRole.findMany.mockResolvedValue(roleMembers({ userId: ROLE_MEMBER_1 }));
    // Rol bahsetmelerini susturmuş ama @everyone'ı açık bırakmış
    prismaMock.notificationPref.findMany.mockResolvedValue([
      { userId: ROLE_MEMBER_1, suppressEveryone: false, suppressRoleMentions: true },
    ]);

    await gateway.notifyMentions(CHANNEL_ID, roleDto({ mentionsEveryone: true }));

    const notified = emitToUserMock.mock.calls.filter((c) => c[1] === 'mention').map((c) => c[0]);
    expect(notified).toContain(ROLE_MEMBER_1);
  });

  it('preview rol token’ını ROL ADIYLA çözer, sabit "@everyone" yazmaz', async () => {
    prismaMock.guildMemberRole.findMany.mockResolvedValue(roleMembers({ userId: ROLE_MEMBER_1 }));

    await gateway.notifyMentions(CHANNEL_ID, roleDto());

    const mentionCall = emitToUserMock.mock.calls.find((c) => c[1] === 'mention');
    expect(mentionCall?.[2].preview).toContain('@Moderatör');
    expect(mentionCall?.[2].preview).not.toContain('@everyone');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// M4a-3 §9.1 — handleCallInvite: push eklemesi + susturulmuş DM'de sessiz kalma
// ═══════════════════════════════════════════════════════════════════════════════
describe('MessagesGateway.handleCallInvite (M4a-3 §9.1)', () => {
  let gateway: MessagesGateway;

  const CALLER_ID = 'user-caller';
  const CALLEE_ID = 'user-callee';
  const CALL_DM_ID = 'ch-dm-call';

  function socketFor(userId: string) {
    return { data: { userId } } as any;
  }

  beforeEach(() => {
    resetMocks();
    gateway = makeGateway();
    prismaMock.channel.findUnique.mockResolvedValue({ type: 'DM', dmRequestStatus: null });
    prismaMock.channelMember.findMany.mockResolvedValue([
      { userId: CALLER_ID },
      { userId: CALLEE_ID },
    ]);
    dmPermissionMock.canDm.mockResolvedValue({ allowed: true });
    prismaMock.user.findUnique.mockResolvedValue({ username: 'arayankanka', avatarUrl: null });
  });

  it('gate geçilir, susturma yok → WS emiti AYNI kalır + push gider, ack {ok:true}', async () => {
    const res = await gateway.handleCallInvite(socketFor(CALLER_ID), { channelId: CALL_DM_ID });

    expect(res).toEqual({ ok: true });
    expect(emitToUserMock).toHaveBeenCalledWith(CALLEE_ID, 'voice.incoming_call', {
      channelId: CALL_DM_ID,
      caller: { id: CALLER_ID, username: 'arayankanka', avatarUrl: null },
    });

    expect(pushSendToUsersMock).toHaveBeenCalledTimes(1);
    const [targets, payload] = pushSendToUsersMock.mock.calls[0];
    expect(targets).toEqual([CALLEE_ID]);
    expect(payload.data).toEqual({
      type: 'incoming_call',
      channelId: CALL_DM_ID,
      callerId: CALLER_ID,
      callerName: 'arayankanka',
    });
    expect(payload.priority).toBe('high');
    expect(payload.ttlSeconds).toBe(30);
    expect(payload.categoryId).toBe('incoming_call');
    expect(typeof payload.androidChannelId).toBe('string');
    expect(typeof payload.title).toBe('string');
    expect(payload.body).toContain('arayankanka');
  });

  it('gate reddederse (canDm allowed=false) → ne WS ne push, ack {ok:false, error: DM_NOT_ALLOWED}', async () => {
    dmPermissionMock.canDm.mockResolvedValue({ allowed: false });

    const res = await gateway.handleCallInvite(socketFor(CALLER_ID), { channelId: CALL_DM_ID });

    expect(res).toEqual({ ok: false, error: 'DM_NOT_ALLOWED' });
    expect(emitToUserMock).not.toHaveBeenCalled();
    expect(pushSendToUsersMock).not.toHaveBeenCalled();
  });

  it('§9.1 madde 3 — callee DM kanalını ETKİN olarak susturmuş → ne WS ne push, ama ack yine {ok:true} (nötrlük)', async () => {
    prismaMock.notificationPref.findUnique.mockResolvedValue({ muted: true, mutedUntil: null });

    const res = await gateway.handleCallInvite(socketFor(CALLER_ID), { channelId: CALL_DM_ID });

    expect(res).toEqual({ ok: true }); // arayan susturmayı ANLAMAZ — farklı ack/kod YOK
    expect(emitToUserMock).not.toHaveBeenCalled();
    expect(pushSendToUsersMock).not.toHaveBeenCalled();
    expect(prismaMock.notificationPref.findUnique).toHaveBeenCalledWith({
      where: {
        userId_targetType_targetId: {
          userId: CALLEE_ID,
          targetType: 'CHANNEL',
          targetId: CALL_DM_ID,
        },
      },
    });
  });

  it('mute süresi geçmiş (mutedUntil geçmişte) → etkin sayılmaz, WS + push normal gider', async () => {
    prismaMock.notificationPref.findUnique.mockResolvedValue({
      muted: true,
      mutedUntil: new Date(Date.now() - 60_000),
    });

    const res = await gateway.handleCallInvite(socketFor(CALLER_ID), { channelId: CALL_DM_ID });

    expect(res).toEqual({ ok: true });
    expect(emitToUserMock).toHaveBeenCalledTimes(1);
    expect(pushSendToUsersMock).toHaveBeenCalledTimes(1);
  });

  it('muted=false kaydı (susturma kapalı) → normal gider', async () => {
    prismaMock.notificationPref.findUnique.mockResolvedValue({ muted: false, mutedUntil: null });

    await gateway.handleCallInvite(socketFor(CALLER_ID), { channelId: CALL_DM_ID });

    expect(emitToUserMock).toHaveBeenCalledTimes(1);
    expect(pushSendToUsersMock).toHaveBeenCalledTimes(1);
  });

  // 🔴 Sahip kararı 2026-08-07 (ikinci tur) — `level` aramayı SUSTURMAZ, yalnız `muted` susturur.
  // Ara bir sürümde level=NONE de kesiyordu; gerçek kullanımda ilk denemede geri alındı (sonuç tamamen
  // sessiz olduğu için sebep ancak DB'ye bakılarak bulunabilmişti). Bu iki test o geri almanın
  // regresyon koruması: bildirim SEVİYESİ ne olursa olsun arama gider.
  it('level=NONE (muted=false) → arama GİDER (level aramayı susturmaz)', async () => {
    prismaMock.notificationPref.findUnique.mockResolvedValue({
      muted: false,
      mutedUntil: null,
      level: 'NONE',
    });

    const res = await gateway.handleCallInvite(socketFor(CALLER_ID), { channelId: CALL_DM_ID });

    expect(res).toEqual({ ok: true });
    expect(emitToUserMock).toHaveBeenCalledTimes(1);
    expect(pushSendToUsersMock).toHaveBeenCalledTimes(1);
  });

  it("level=MENTIONS → bu dal MENTIONS'ı susturmaz, arama normal gider (regresyon)", async () => {
    prismaMock.notificationPref.findUnique.mockResolvedValue({
      muted: false,
      mutedUntil: null,
      level: 'MENTIONS',
    });

    const res = await gateway.handleCallInvite(socketFor(CALLER_ID), { channelId: CALL_DM_ID });

    expect(res).toEqual({ ok: true });
    expect(emitToUserMock).toHaveBeenCalledTimes(1);
    expect(pushSendToUsersMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * M4z sözleşme §F — grup çağrısı iptali.
 * `handleGroupCallCancel` `handleGroupCallStart`in aynısıdır; testler ikisini YAN YANA tutuyor ki
 * kapılar ileride birinde gevşerse diğerinin testi de düşsün (R7: çaldırabilen == susturabilen).
 */
describe('MessagesGateway.handleGroupCallCancel (M4z §F)', () => {
  let gateway: MessagesGateway;

  const STARTER_ID = 'user-starter';
  const MEMBER_B = 'user-b';
  const MEMBER_C = 'user-c';
  const GROUP_ID = 'ch-group-call';

  function socketFor(userId: string) {
    return { data: { userId, username: 'baslatan' } } as any;
  }

  beforeEach(() => {
    resetMocks();
    gateway = makeGateway();
    prismaMock.channel.findUnique.mockResolvedValue({ type: 'GROUP_DM' });
    prismaMock.channelMember.findMany.mockResolvedValue([
      { userId: MEMBER_B },
      { userId: MEMBER_C },
    ]);
  });

  it('iptal DİĞER TÜM üyelere yayılır (yalnız channelId; `by` yok), ack {ok:true}', async () => {
    const res = await gateway.handleGroupCallCancel(socketFor(STARTER_ID), { channelId: GROUP_ID });

    expect(res).toEqual({ ok: true });
    expect(emitToUserMock).toHaveBeenCalledTimes(2);
    expect(emitToUserMock).toHaveBeenCalledWith(MEMBER_B, 'voice.group_call_canceled', {
      channelId: GROUP_ID,
    });
    expect(emitToUserMock).toHaveBeenCalledWith(MEMBER_C, 'voice.group_call_canceled', {
      channelId: GROUP_ID,
    });
    // Gönderen kendi kendine iptal almaz — sorgu `userId: { not: userId }` ile süzülür.
    const where = prismaMock.channelMember.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ channelId: GROUP_ID, userId: { not: STARTER_ID } });
  });

  it('kanal GROUP_DM değilse → NOT_GROUP, hiçbir emit yok, kapılar hiç çağrılmaz', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ type: 'DM' });

    const res = await gateway.handleGroupCallCancel(socketFor(STARTER_ID), { channelId: GROUP_ID });

    expect(res).toEqual({ ok: false, error: 'NOT_GROUP' });
    expect(emitToUserMock).not.toHaveBeenCalled();
    expect(membershipMock.requireChannelAccess).not.toHaveBeenCalled();
  });

  it('kanal yoksa → NOT_GROUP', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(null);

    const res = await gateway.handleGroupCallCancel(socketFor(STARTER_ID), { channelId: GROUP_ID });

    expect(res).toEqual({ ok: false, error: 'NOT_GROUP' });
    expect(emitToUserMock).not.toHaveBeenCalled();
  });

  it('R7 — kanal erişimi yoksa (requireChannelAccess atar) → FORBIDDEN, sahte iptal yayılmaz', async () => {
    membershipMock.requireChannelAccess.mockRejectedValue(new Error('no access'));

    const res = await gateway.handleGroupCallCancel(socketFor(STARTER_ID), { channelId: GROUP_ID });

    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(emitToUserMock).not.toHaveBeenCalled();
  });

  it('R7 — DM engeli varsa (requireNoDmBlock atar) → FORBIDDEN, iptal yayılmaz', async () => {
    membershipMock.requireNoDmBlock.mockRejectedValue(new Error('blocked'));

    const res = await gateway.handleGroupCallCancel(socketFor(STARTER_ID), { channelId: GROUP_ID });

    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(emitToUserMock).not.toHaveBeenCalled();
  });

  it('R7 — iptal kapıları `group_call_start` ile AYNI ikilidir (ikisi de çağrılır)', async () => {
    await gateway.handleGroupCallCancel(socketFor(STARTER_ID), { channelId: GROUP_ID });

    expect(membershipMock.requireChannelAccess).toHaveBeenCalledWith(STARTER_ID, GROUP_ID);
    expect(membershipMock.requireNoDmBlock).toHaveBeenCalledWith(STARTER_ID, GROUP_ID);

    jest.clearAllMocks();
    prismaMock.channel.findUnique.mockResolvedValue({ type: 'GROUP_DM' });
    prismaMock.channelMember.findMany.mockResolvedValue([{ userId: MEMBER_B }]);
    prismaMock.user.findUnique.mockResolvedValue({ username: 'baslatan', avatarUrl: null });

    await gateway.handleGroupCallStart(socketFor(STARTER_ID), { channelId: GROUP_ID });

    expect(membershipMock.requireChannelAccess).toHaveBeenCalledWith(STARTER_ID, GROUP_ID);
    expect(membershipMock.requireNoDmBlock).toHaveBeenCalledWith(STARTER_ID, GROUP_ID);
    expect(emitToUserMock).toHaveBeenCalledWith(MEMBER_B, 'voice.group_call_started', {
      channelId: GROUP_ID,
      by: { id: STARTER_ID, username: 'baslatan' },
    });
  });
});

/**
 * Sprint M5a §4 — `voice:group_call_ring` (kişi başı çaldırma).
 * `handleGroupCallStart` ile AYNI NOT_GROUP + requireChannelAccess ikilisinden geçer; ama
 * blok kontrolü requireNoDmBlock DEĞİL, çağıran↔hedef doğrudan çifti (§4.2) — ayrıca hedef-üyelik,
 * hız sınırı (§4.3) ve "zaten odada" (§4.4) kapıları eklendi.
 */
describe('MessagesGateway.handleGroupCallRing (M5a §4)', () => {
  let gateway: MessagesGateway;

  const CALLER_ID = 'user-ring-caller';
  const TARGET_ID = 'user-ring-target';
  const OTHER_MEMBER_ID = 'user-ring-other';
  const GROUP_ID = 'ch-group-ring';

  function socketFor(userId: string) {
    return { data: { userId, username: 'çağıranKanka' } } as any;
  }

  beforeEach(() => {
    resetMocks();
    gateway = makeGateway();
    prismaMock.channel.findUnique.mockResolvedValue({ type: 'GROUP_DM' });
    prismaMock.channelMember.findUnique.mockResolvedValue({ userId: TARGET_ID });
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    voiceGetLiveParticipationMock.mockResolvedValue({
      present: false,
      streaming: false,
      video: false,
    });
  });

  it('kanal GROUP_DM değilse → NOT_GROUP, hiçbir kapı çağrılmaz', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ type: 'DM' });

    const res = await gateway.handleGroupCallRing(socketFor(CALLER_ID), {
      channelId: GROUP_ID,
      targetUserId: TARGET_ID,
    });

    expect(res).toEqual({ ok: false, error: 'NOT_GROUP' });
    expect(membershipMock.requireChannelAccess).not.toHaveBeenCalled();
    expect(emitToUserMock).not.toHaveBeenCalled();
  });

  it('kanal yoksa → NOT_GROUP', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(null);

    const res = await gateway.handleGroupCallRing(socketFor(CALLER_ID), {
      channelId: GROUP_ID,
      targetUserId: TARGET_ID,
    });

    expect(res).toEqual({ ok: false, error: 'NOT_GROUP' });
  });

  it('çağıranın kanal erişimi yoksa (requireChannelAccess atar) → FORBIDDEN, yayılmaz', async () => {
    membershipMock.requireChannelAccess.mockRejectedValue(new Error('no access'));

    const res = await gateway.handleGroupCallRing(socketFor(CALLER_ID), {
      channelId: GROUP_ID,
      targetUserId: TARGET_ID,
    });

    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(emitToUserMock).not.toHaveBeenCalled();
  });

  it('hedef kanalın üyesi değilse → FORBIDDEN', async () => {
    prismaMock.channelMember.findUnique.mockResolvedValue(null);

    const res = await gateway.handleGroupCallRing(socketFor(CALLER_ID), {
      channelId: GROUP_ID,
      targetUserId: TARGET_ID,
    });

    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(emitToUserMock).not.toHaveBeenCalled();
    expect(prismaMock.channelMember.findUnique).toHaveBeenCalledWith({
      where: { channelId_userId: { channelId: GROUP_ID, userId: TARGET_ID } },
    });
  });

  it('§4.2 — çağıran↔hedef arasında blok varsa (herhangi bir yön) → FORBIDDEN, sızıntı yok', async () => {
    prismaMock.userBlock.findFirst.mockResolvedValue({ id: 'block-1' });

    const res = await gateway.handleGroupCallRing(socketFor(CALLER_ID), {
      channelId: GROUP_ID,
      targetUserId: TARGET_ID,
    });

    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(emitToUserMock).not.toHaveBeenCalled();
    // requireNoDmBlock (rastgele-üye kapısı) BİLEREK kullanılmıyor
    expect(membershipMock.requireNoDmBlock).not.toHaveBeenCalled();
    const where = prismaMock.userBlock.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({
      OR: [
        { blockerId: CALLER_ID, blockedId: TARGET_ID },
        { blockerId: TARGET_ID, blockedId: CALLER_ID },
      ],
    });
  });

  it('§4.3 — ikinci çağrı (aynı çağıran→hedef, 60 sn içinde) → RATE_LIMITED', async () => {
    const first = await gateway.handleGroupCallRing(socketFor(CALLER_ID), {
      channelId: GROUP_ID,
      targetUserId: TARGET_ID,
    });
    expect(first).toEqual({ ok: true });

    const second = await gateway.handleGroupCallRing(socketFor(CALLER_ID), {
      channelId: GROUP_ID,
      targetUserId: TARGET_ID,
    });

    expect(second).toEqual({ ok: false, error: 'RATE_LIMITED' });
    // yalnız ilk çağrıda emit edildi
    expect(emitToUserMock).toHaveBeenCalledTimes(1);
  });

  it('§4.3 — farklı bir hedefe çaldırma AYNI pencerede sınırlanmaz (çift bazlı)', async () => {
    await gateway.handleGroupCallRing(socketFor(CALLER_ID), {
      channelId: GROUP_ID,
      targetUserId: TARGET_ID,
    });

    const res = await gateway.handleGroupCallRing(socketFor(CALLER_ID), {
      channelId: GROUP_ID,
      targetUserId: OTHER_MEMBER_ID,
    });

    expect(res).toEqual({ ok: true });
    expect(emitToUserMock).toHaveBeenCalledTimes(2);
  });

  it('§4.4 — hedef zaten odadaysa ack {ok:true} ama olay YAYILMAZ', async () => {
    voiceGetLiveParticipationMock.mockResolvedValue({
      present: true,
      streaming: false,
      video: false,
    });

    const res = await gateway.handleGroupCallRing(socketFor(CALLER_ID), {
      channelId: GROUP_ID,
      targetUserId: TARGET_ID,
    });

    expect(res).toEqual({ ok: true });
    expect(emitToUserMock).not.toHaveBeenCalled();
    expect(voiceGetLiveParticipationMock).toHaveBeenCalledWith(GROUP_ID, TARGET_ID);
  });

  it('§4.4 — LiveKit doğrulanamazsa (null) fail-open: yine de çaldırır', async () => {
    voiceGetLiveParticipationMock.mockResolvedValue(null);

    const res = await gateway.handleGroupCallRing(socketFor(CALLER_ID), {
      channelId: GROUP_ID,
      targetUserId: TARGET_ID,
    });

    expect(res).toEqual({ ok: true });
    expect(emitToUserMock).toHaveBeenCalledTimes(1);
  });

  it('mutlu yol — yalnız targetUserId a doğru olay + payload ile emit edilir', async () => {
    const res = await gateway.handleGroupCallRing(socketFor(CALLER_ID), {
      channelId: GROUP_ID,
      targetUserId: TARGET_ID,
    });

    expect(res).toEqual({ ok: true });
    expect(emitToUserMock).toHaveBeenCalledTimes(1);
    expect(emitToUserMock).toHaveBeenCalledWith(TARGET_ID, 'voice.group_call_started', {
      channelId: GROUP_ID,
      by: { id: CALLER_ID, username: 'çağıranKanka' },
    });
  });
});

describe('MessagesGateway.handleActivitySet (C31b §2.4)', () => {
  let gateway: MessagesGateway;
  const socket = (id = 'sock-1') =>
    ({ id, data: { userId: 'u1', sessionId: 's1', username: 'kanka' } }) as any;

  beforeEach(() => {
    resetMocks();
    gateway = makeGateway();
    presenceMock.gameActivityEnabled.mockResolvedValue(true);
    presenceMock.setGame.mockReturnValue(true);
    presenceMock.broadcastActivity.mockResolvedValue(undefined);
    gamesMock.resolve.mockResolvedValue({ id: 'g1', name: 'Valorant' });
    // önce null, sonra g1 (set edildikten sonra)
    presenceMock.activeGameId.mockReturnValueOnce(null).mockReturnValue('g1');
  });

  it('geçerli ref → tablodaki kimlikle kaydeder ve yayar', async () => {
    const res = await gateway.handleActivitySet(socket(), { ref: 'curated:g1' });
    expect(res).toEqual({ ok: true });
    expect(gamesMock.resolve).toHaveBeenCalledWith('curated:g1', {
      userId: 'u1',
      epicName: undefined,
    });
    expect(presenceMock.setGame).toHaveBeenCalledWith('u1', 'sock-1', 'g1');
    expect(presenceMock.broadcastActivity).toHaveBeenCalledWith('u1');
  });

  it('bilinmeyen / hidden ref (resolve null) → ok:false, kayıt ve yayın yok', async () => {
    gamesMock.resolve.mockResolvedValue(null);
    const res = await gateway.handleActivitySet(socket(), { ref: 'curated:yok' });
    expect(res).toEqual({ ok: false });
    expect(presenceMock.setGame).not.toHaveBeenCalled();
    expect(presenceMock.broadcastActivity).not.toHaveBeenCalled();
  });

  it('ayar kapalıyken çözümleme bile yapılmaz, kayıt yok', async () => {
    presenceMock.gameActivityEnabled.mockResolvedValue(false);
    const res = await gateway.handleActivitySet(socket(), { ref: 'steam:730' });
    expect(res).toEqual({ ok: false });
    expect(gamesMock.resolve).not.toHaveBeenCalled();
    expect(presenceMock.setGame).not.toHaveBeenCalled();
  });

  it('ref:null oyunu siler (ayar kapalı olsa da silmeye izin var)', async () => {
    presenceMock.gameActivityEnabled.mockResolvedValue(false);
    presenceMock.activeGameId.mockReset();
    presenceMock.activeGameId.mockReturnValueOnce('g1').mockReturnValue(null);
    const res = await gateway.handleActivitySet(socket(), { ref: null });
    expect(res).toEqual({ ok: true });
    expect(presenceMock.setGame).toHaveBeenCalledWith('u1', 'sock-1', null);
    expect(presenceMock.broadcastActivity).toHaveBeenCalledWith('u1');
  });

  it('bağlantı başına dakikada 10 sınırı; başka bağlantı etkilenmez', async () => {
    presenceMock.activeGameId.mockReset();
    presenceMock.activeGameId.mockReturnValue('g1');
    for (let i = 0; i < 10; i++) {
      expect(await gateway.handleActivitySet(socket('a'), { ref: 'curated:g1' })).toEqual({
        ok: true,
      });
    }
    expect(await gateway.handleActivitySet(socket('a'), { ref: 'curated:g1' })).toEqual({
      ok: false,
    });
    expect(await gateway.handleActivitySet(socket('b'), { ref: 'curated:g1' })).toEqual({
      ok: true,
    });
  });
});
