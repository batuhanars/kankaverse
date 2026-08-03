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
  channelMember: { findMany: jest.fn() },
  notificationPref: { findMany: jest.fn() },
  // R15 — rol bahsetmesi: preview'da rol adı çözümü + alıcı kümesi rol genişlemesi
  role: { findMany: jest.fn() },
  guildMemberRole: { findMany: jest.fn() },
};

const jwtMock = { verify: jest.fn() };
const configMock = { get: jest.fn() };
const membershipMock = {
  requireChannelAccess: jest.fn(),
  requireGuildMembership: jest.fn(),
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
};

const dmPermissionMock = { canDm: jest.fn() };

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

function makeGateway() {
  return new MessagesGateway(
    jwtMock as any,
    configMock as any,
    prismaMock as any,
    membershipMock as any,
    realtimeMock as any,
    presenceMock as any,
    dmPermissionMock as any,
    notificationsMock as any,
    pushMock as any,
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
  // R15 — varsayılan: içerikte rol token'ı yok / rol üyesi yok
  prismaMock.role.findMany.mockResolvedValue([]);
  prismaMock.guildMemberRole.findMany.mockResolvedValue([]);
  // KUSUR 3 — resolveMentionPreview varsayılanı: içerikte kullanıcı token'ı yoksa hiç çağrılmaz,
  // varsa da (mock override etmemişse) boş sonuç → @bilinmeyen fallback'i (throw yerine).
  prismaMock.user.findMany.mockResolvedValue([]);
  // M3 §2.6 — varsayılan: push başarıyla "gönderildi" (fire-and-forget, hata yutulur)
  pushSendToUsersMock.mockResolvedValue(undefined);
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
    expect(emitToUserMock).not.toHaveBeenCalledWith(AUTHOR_ID, expect.anything(), expect.anything());
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

  function makeMentionDto(overrides: Partial<{
    mentions: string[];
    authorId: string;
    content: string;
  }> = {}) {
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
    delete (dto as Record<string, unknown>)['mentions'];

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
    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({
      mentions: [AUTHOR_ID],
      authorId: AUTHOR_ID,
      content: `<@${AUTHOR_ID}> bla`,
    }));

    expect(emitToUserMock).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // başarılı mention eventi: §5 payload şekli
  // ─────────────────────────────────────────────────────────────────────────
  it('başarılı mention → bahsedilene §5 payload ile emit yapılır', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([
      { id: MENTIONED_USER_1, username: 'kanka1' },
    ]);

    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({
      mentions: [MENTIONED_USER_1],
      authorId: AUTHOR_ID,
      content: `<@${MENTIONED_USER_1}> buna bakar mısın`,
    }));

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
    prismaMock.user.findMany.mockResolvedValue([
      { id: MENTIONED_USER_1, username: 'kanka1' },
    ]);

    await gateway.notifyMentions(DM_CHANNEL_ID, makeMentionDto({
      mentions: [MENTIONED_USER_1],
      authorId: AUTHOR_ID,
    }));

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

    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({
      mentions: [MENTIONED_USER_1],
      content: `<@${MENTIONED_USER_1}> selam`,
    }));

    const [, , payload] = emitToUserMock.mock.calls[0];
    expect(payload.preview).toBe('@kankakullanici selam');
  });

  it('preview: çözülemeyen token → @bilinmeyen', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([
      { id: MENTIONED_USER_1, username: 'kanka1' },
    ]);
    const UNKNOWN_ID = 'user-unknown-xyz';

    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({
      mentions: [MENTIONED_USER_1],
      content: `<@${MENTIONED_USER_1}> ve <@${UNKNOWN_ID}>`,
    }));

    const [, , payload] = emitToUserMock.mock.calls[0];
    expect(payload.preview).toContain('@bilinmeyen');
    expect(payload.preview).toContain('@kanka1');
  });

  it('preview: 100 karakteri aşan içerik kesilir', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([
      { id: MENTIONED_USER_1, username: 'k' },
    ]);
    const longContent = `<@${MENTIONED_USER_1}> ` + 'a'.repeat(200);

    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({
      mentions: [MENTIONED_USER_1],
      content: longContent,
    }));

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

    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({
      mentions: [MENTIONED_USER_1, MENTIONED_USER_2],
      authorId: AUTHOR_ID,
      content: `<@${MENTIONED_USER_1}> ve <@${MENTIONED_USER_2}>`,
    }));

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

    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({
      mentions: [MENTIONED_USER_1, MENTIONED_USER_2],
      authorId: AUTHOR_ID,
      content: `<@${MENTIONED_USER_1}> ve <@${MENTIONED_USER_2}>`,
    }));

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

    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({
      mentions: [AUTHOR_ID],
      authorId: AUTHOR_ID,
      content: `<@${AUTHOR_ID}> bla`,
    }));

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

    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({
      mentions: [MENTIONED_USER_1],
      authorId: AUTHOR_ID,
      content: `<@${MENTIONED_USER_1}> selam`,
    }));

    expect(notificationsShouldNotifyMock).toHaveBeenCalledWith(MENTIONED_USER_1, GUILD_ID, CHANNEL_ID);
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
        content: mentions.length ? `<@&role-everyone> ve <@${mentions[0]}>` : '<@&role-everyone> herkes',
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

    it('T&S regresyon: özel kanalda everyone yalnız kanal üyeleri + owner/admin\'e gider (sızıntı yok)', async () => {
      prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID, isPrivate: true });
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.channelMember.findMany.mockResolvedValue([{ userId: EVERYONE_ONLY_ID }]);
      prismaMock.guildMember.findMany.mockResolvedValue([{ userId: AUTHOR_ID }]); // OWNER/ADMIN sorgusu

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
    prismaMock.guildMember.findMany.mockResolvedValue([]); // OWNER/ADMIN yok
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
