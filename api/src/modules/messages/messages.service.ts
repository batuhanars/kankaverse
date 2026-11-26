import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { PermissionsService } from '../../shared/permissions/permissions.service';
import { AutomodService } from '../../shared/automod/automod.service';
import { ModerationService } from '../../shared/moderation/moderation.service';
import { MESSAGE_AUTHOR_SELECT } from '../../common/utils/message-author.select';
import { canModerateGroupTarget, getGroupRole } from '../../shared/group-roles/group-roles';
import { loadRoleEmojis } from '../../common/utils/role-emoji.util';
import {
  groupVisibility,
  GroupVisibility,
  isHiddenBeforeJoin,
  preJoinEncryptedFilter,
} from '../../common/utils/pre-join.util';
import { E2eeMessageService, E2eeSendPlan } from '../e2ee/e2ee-message.service';
import { toB64 } from '../e2ee/e2ee.util';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { Attachment, Message, MessageReaction, Prisma, ScanStatus, User } from '@prisma/client';

type AttachmentDto = Pick<
  Attachment,
  | 'id'
  | 'filename'
  | 'contentType'
  | 'size'
  | 'scanStatus'
  | 'durationMs'
  | 'waveform'
  | 'thumbnail'
  | 'width'
  | 'height'
  | 'aiGenerationId'
>;

/** C46: addReaction sonucu; `removed`/`added` doluysa o emoji için olay yayınlanır. */
export type ReactionChange = { removed: string | null; added: string | null };

type ReactionAggDto = { emoji: string; count: number; reactedByMe: boolean };

/** Yanıt alıntısındaki ek özeti: istemci türe göre etiket + küçük önizleme çizer (adres yok, T&S kapısı aynı). */
type ReplyAttachmentDto = Pick<
  Attachment,
  'id' | 'filename' | 'contentType' | 'scanStatus' | 'thumbnail'
>;

type ReplyToDto = {
  id: string;
  content: string;
  authorUsername: string;
  /** Alıntılanan mesajın İLK eki; eki yoksa null. */
  attachment: ReplyAttachmentDto | null;
  /** C62 §2.3.b: yalnız eski üye penceresinde ve alıntı `leftAt` sonrası düzenlendiyse (aksi hâlde alan YOK). */
  editedAfterLeave?: true;
} | null;

type ReplyToRaw =
  | (Pick<
      Message,
      'id' | 'content' | 'deletedAt' | 'webhookId' | 'webhookName' | 'encrypted' | 'createdAt'
    > & {
      editedAt?: Date | null;
      author: Pick<User, 'username'>;
      attachments?: ReplyAttachmentDto[];
    })
  | null;

/** Alıntı metni: istemci 2-3 satır gösteriyor (WhatsApp gibi); 100 karakter tek satırı bile doldurmuyordu. */
const REPLY_SNIPPET_MAX = 300;

type MessageWithAuthor = Message & {
  author: Pick<User, 'id' | 'username' | 'avatarUrl' | 'avatarAnimatedUrl'>;
  attachments: AttachmentDto[];
  reactions?: Pick<MessageReaction, 'userId' | 'emoji'>[];
  replyTo?: ReplyToRaw;
  mentions: string[];
  pinnedAt: Date | null;
};

// replyTo snippet: ≤REPLY_SNIPPET_MAX karakter; dosya ekli + boş içerik → "[dosya]" (eski istemciler
// için korunuyor; yeni istemci `attachment` doluyken türe göre etiket gösterir); silinmişse null
// E1: şifreli mesajın metnini sunucu bilmez; boş içerik "[dosya]" değil, istemciye "yerel depodan doldur"
// işaretidir (web/mobil `fillQuote` yalnız boş içerikte depoya bakar).
function buildReplyToDto(raw: ReplyToRaw, leftAt?: Date | null): ReplyToDto {
  if (!raw || raw.deletedAt !== null) return null;
  // C62 §2.3.b: eski üye alıntılanan mesajın `leftAt` anındaki halini görür; sonradan düzenlendiyse gövde verilmez.
  const editedAfterLeave = isEditedAfter(raw.editedAt, leftAt);
  const snippet =
    raw.encrypted || editedAfterLeave
      ? ''
      : raw.content.trim().length > 0
        ? raw.content.slice(0, REPLY_SNIPPET_MAX)
        : '[dosya]';
  // C35 §5.1: webhook mesajına yanıtta oluşturanın adı sızmaz, webhook'un görünen adı gösterilir
  const authorUsername = raw.webhookId ? (raw.webhookName ?? '') : raw.author.username;
  const first = raw.attachments?.[0];
  const attachment = first
    ? {
        id: first.id,
        filename: first.filename,
        contentType: first.contentType,
        scanStatus: first.scanStatus,
        thumbnail: first.thumbnail ?? null,
      }
    : null;
  return {
    id: raw.id,
    content: snippet,
    authorUsername,
    attachment,
    ...(editedAfterLeave ? { editedAfterLeave: true as const } : {}),
  };
}

/** C62 §2.3.b: mesaj eski üyenin ayrılma anından SONRA düzenlendi mi (`leftAt` yoksa = aktif üye = hep false). */
function isEditedAfter(
  editedAt: Date | null | undefined,
  leftAt: Date | null | undefined,
): boolean {
  return !!leftAt && !!editedAt && editedAt > leftAt;
}

/**
 * `joinedAt` (yalnız GROUP_DM, E2 §2.5): çağıranın katılımından ÖNCE gönderilmiş şifreli bir mesaja yanıt
 * alıntısı verilmez (alıntı üst veri sızdırır: yazar adı). Düz eski mesajın alıntısı bugünkü gibi kalır.
 */
function toMessageDto(
  msg: MessageWithAuthor,
  callerId?: string,
  joinedAt?: GroupVisibility | null,
  leftAt?: Date | null,
) {
  // C62 §2.3.b: eski üye penceresinde `leftAt` sonrası düzenlenen mesajın gövdesi (içerik, şifreli yük, bahsetme,
  // embed) verilmez; yalnız `editedAfterLeave: true`. `leftAt` verilmediyse (aktif üye) hiçbir şey değişmez.
  const editedAfterLeave = isEditedAfter(msg.editedAt, leftAt);
  const replyTo = msg.replyTo && isHiddenBeforeJoin(msg.replyTo, joinedAt) ? null : msg.replyTo;
  // Aggregate reactions: group by emoji, count, reactedByMe
  const reactionsAgg: ReactionAggDto[] = [];
  if (msg.reactions && msg.reactions.length > 0) {
    const byEmoji = new Map<string, { count: number; reactedByMe: boolean }>();
    for (const r of msg.reactions) {
      const existing = byEmoji.get(r.emoji);
      if (existing) {
        existing.count += 1;
        if (callerId && r.userId === callerId) existing.reactedByMe = true;
      } else {
        byEmoji.set(r.emoji, {
          count: 1,
          reactedByMe: callerId ? r.userId === callerId : false,
        });
      }
    }
    for (const [emoji, agg] of byEmoji) {
      reactionsAgg.push({ emoji, count: agg.count, reactedByMe: agg.reactedByMe });
    }
  }

  return {
    id: msg.id,
    channelId: msg.channelId,
    content: editedAfterLeave ? '' : msg.content,
    replyToId: msg.replyToId,
    replyTo: buildReplyToDto(replyTo ?? null, leftAt),
    editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
    pinnedAt: msg.pinnedAt ? msg.pinnedAt.toISOString() : null,
    author: msg.webhookId
      ? {
          // C35 §5.1: görünen kimlik webhook'tan gelir; oluşturanın (authorId) id'si DTO'ya ASLA girmez.
          id: msg.webhookId,
          username: msg.webhookName ?? '',
          avatarUrl: null as string | null,
          avatarAnimatedUrl: null as string | null,
          roleEmoji: null as string | null,
        }
      : {
          id: msg.author.id,
          username: msg.author.username,
          avatarUrl: msg.author.avatarUrl,
          // C16: hareketli WebP adresi (avatarUrl = statik kare). Eski önbellek/olayda alan yok → istemci statik.
          avatarAnimatedUrl: msg.author.avatarAnimatedUrl ?? null,
          // C21: ortam kanalı için sonradan `withRoleEmojis` doldurur; DM'de null kalır.
          roleEmoji: null as string | null,
        },
    webhook: msg.webhookId ? { id: msg.webhookId } : null,
    embeds: msg.webhookId && !editedAfterLeave ? ((msg.embeds ?? null) as unknown[] | null) : null,
    attachments: msg.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      scanStatus: a.scanStatus,
      durationMs: a.durationMs ?? null,
      waveform: a.waveform ?? null,
      thumbnail: a.thumbnail ?? null,
      width: a.width ?? null,
      height: a.height ?? null,
      // C14b: sunucu kaynaklı "Yapay zeka" rozeti (istemci bayrak gönderemez; Attachment.aiGenerationId'den türer)
      aiGenerated: (a.aiGenerationId ?? null) !== null,
    })),
    reactions: reactionsAgg,
    mentions: editedAfterLeave ? [] : (msg.mentions ?? []),
    mentionsEveryone: editedAfterLeave ? false : (msg.mentionsEveryone ?? false),
    // R15 — istemci hem rol çipini çizmek hem "bana rolümden bahsedildi" bandını yakmak için
    // rol id'lerini görmeli (kendi rollerimle kesişim istemcide hesaplanır).
    mentionRoles: editedAfterLeave ? [] : (msg.mentionRoles ?? []),
    createdAt: msg.createdAt.toISOString(),
    ...(editedAfterLeave ? { editedAfterLeave: true as const } : {}),
    // E1: yalnız şifreli mesajda (şifresizde alan YOK). content '' kalır; istemci ciphertext'i çözer.
    ...(msg.encrypted && msg.ciphertext
      ? {
          encrypted: true as const,
          // C62: leftAt sonrası düzenlenmişse şifreli yük ve franking etiketi VERİLMEZ.
          ...(editedAfterLeave ? {} : { ciphertext: toB64(msg.ciphertext) }),
          senderDeviceId: msg.senderDeviceId ?? null,
          // E4: yalnız varsa (v1 istemci mesajında alan YOK). Okuyan cihaz kendi hesapladığıyla karşılaştırır.
          ...(msg.frankingTag && !editedAfterLeave ? { frankingTag: toB64(msg.frankingTag) } : {}),
        }
      : {}),
  };
}

/**
 * C29 — iyimser gönderim eşleştirmesi: istemcinin gönderdiği `nonce` yalnız `create()` dönüşüne
 * (HTTP cevabı + `message.created` yayını) aynen taşınır. DB'ye yazılmaz; liste/arama/düzenleme
 * uçlarında hiç dönmez. Nonce yoksa alan eklenmez.
 */
function withNonce<T extends object>(dto: T, nonce?: string): T & { nonce?: string } {
  return nonce ? { ...dto, nonce } : dto;
}

// replyTo include fragmanı — tüm sorgularda aynı şekil kullanılır
/**
 * R15 §2.4 — tek mesajda en fazla 3 farklı rol etiketlenebilir. Kullanıcı bahsetmesindeki ≤10
 * kuralının kardeşi: rol bahsetmesi kişi başına değil GRUP başına ping ürettiği için sınır daha dar.
 */
const MAX_ROLE_MENTIONS = 3;
const REACTION_LIST_LIMIT = 200; // C46 §3.1

/** Düz metin `@everyone` (kelime/`<@&`/`@@` içinde değil); `@here` eşleşmez. Yalnız webhook yolu kullanır. */
const PLAIN_EVERYONE_RE = /(?<![\w@<&])@everyone(?!\w)/;

const REPLY_TO_INCLUDE = {
  select: {
    id: true,
    content: true,
    encrypted: true,
    createdAt: true,
    editedAt: true, // C62 §2.3.b: eski üye penceresinde `leftAt` sonrası düzenleme tespiti
    deletedAt: true,
    webhookId: true,
    webhookName: true,
    author: { select: { username: true } },
    // Yalnız ilk ek: alıntıda tek küçük önizleme var (WhatsApp gibi).
    attachments: {
      select: { id: true, filename: true, contentType: true, scanStatus: true, thumbnail: true },
      orderBy: { createdAt: 'asc' },
      take: 1,
    },
  },
} as const;

@Injectable()
export class MessagesService {
  private readonly scanEnabled: boolean;

  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
    private permissions: PermissionsService,
    private automod: AutomodService,
    private config: ConfigService,
    private moderation: ModerationService,
    private e2ee: E2eeMessageService,
    // C75: alıcının cevabıyla örtük kabulde mesaj isteği bildirimi okundu işaretlenir.
    private notifications?: NotificationsService,
  ) {
    this.scanEnabled = config.get<boolean>('attachmentScanEnabled') ?? false;
  }

  /**
   * R7 Enforcement çekirdeği (C35 §3 ile ORTAK): global BAN ve kapsam-duyarlı MUTE → mesaj yazamaz.
   * `create()` gönderenin kendi kimliğiyle, webhook yürütmesi OLUŞTURANIN kimliğiyle çağırır;
   * iki yolun kapısı tek yerde durur, ayrı kopya yok.
   */
  async assertSenderUnrestricted(userId: string, guildId: string | null): Promise<void> {
    if (await this.moderation.hasActiveBan(userId)) {
      throw new ForbiddenException({
        message: 'Hesabınız kısıtlandığı için mesaj gönderemezsiniz.',
        error: 'USER_BANNED',
      });
    }
    if (await this.moderation.hasActiveMute(userId, guildId)) {
      throw new ForbiddenException({
        message: 'Bu kanalda mesaj gönderme yetkiniz kısıtlandı.',
        error: 'USER_MUTED',
      });
    }
  }

  /**
   * Automod çekirdeği (C35 §3 ile ORTAK): verilen her metin ayrı ayrı `automod.check`'ten geçer;
   * biri takılırsa 400 MESSAGE_BLOCKED. Boş metinler atlanır. `create()` yalnız `content` verir,
   * webhook `content` + `username` + embed metinlerini verir.
   */
  assertTextsAllowed(texts: string[]): void {
    for (const text of texts) {
      if (text.trim().length === 0) continue;
      if (this.automod.check(text).blocked) {
        throw new BadRequestException({
          message: 'Mesajınız topluluk kurallarına uygun değil.',
          error: 'MESSAGE_BLOCKED',
        });
      }
    }
  }

  /**
   * C35 §3 — webhook mesajını yazar ve istemci DTO'suna çevirir (ortak `toMessageDto` + `withRoleEmojis`).
   * `authorId` = webhook'u oluşturan üye (§0.3); DTO'daki görünen kimlik webhook'tan gelir.
   * Kapılar (yetki, ban/mute, automod, bahsetme) ÇAĞIRANDA uygulanır; burası yalnız yazım + şekil.
   */
  async createWebhookMessage(
    channel: { id: string; guildId: string | null },
    data: {
      creatorId: string;
      webhookId: string;
      webhookName: string;
      content: string;
      embeds: Prisma.InputJsonValue | null;
      mentionsEveryone: boolean;
      mentionRoles: string[];
    },
  ) {
    const message = await this.prisma.message.create({
      data: {
        channelId: channel.id,
        authorId: data.creatorId,
        content: data.content,
        mentions: [], // §3.4: kullanıcı bahsetmesi webhook'ta çözülmez
        mentionsEveryone: data.mentionsEveryone,
        mentionRoles: data.mentionRoles,
        webhookId: data.webhookId,
        webhookName: data.webhookName,
        embeds: data.embeds ?? Prisma.DbNull,
      },
      include: {
        author: { select: MESSAGE_AUTHOR_SELECT },
        attachments: {
          select: {
            id: true,
            filename: true,
            contentType: true,
            size: true,
            scanStatus: true,
            durationMs: true,
            waveform: true,
            thumbnail: true,
            width: true,
            height: true,
            aiGenerationId: true,
          },
        },
        reactions: { select: { userId: true, emoji: true } },
        replyTo: REPLY_TO_INCLUDE,
      },
    });
    return (await this.withRoleEmojis(channel.guildId, [toMessageDto(message)]))[0];
  }

  /**
   * §3 + §4 — Mention token parse + erişim doğrulaması (T&S / R7 incelemesi)
   *
   * 1. content içinden <@userId> token'larını regex ile topla, tekilleştir.
   *    Eşleşme yoksa erken [] dön — ekstra sorgu yok.
   * 2. Erişim doğrulaması (T&S KRİTİK — requireChannelAccess kapılarını birebir aynalar):
   *    - Guild kanalı → GuildMember + isMinor TEK sorguda; needsAgeCheck ise minörler elenir.
   *    - DM/grup DM → ChannelMember + isMinor TEK sorguda; channel.ageGated ise minörler elenir.
   *    Yalnız dönen set geçerlidir; geçersiz/erişimsiz token sessizce düşer.
   *    Ayrı hata kodu YOK, durum sızıntısı YOK (taciz/spam vektörü + minör/varlık).
   * 3. ≤10 sınırı: fazlası sessizce kesilir (anti-spam, hata değil).
   *
   * @param channel — requireChannelAccess'in döndürdüğü guild-include'lu kanal objesi.
   *   Çağıranlar (create, editMessage) bu objeyi zaten elde ediyor; ayrı bayrak sorgusu yapılmaz.
   */
  async resolveMentions(
    channel: {
      id: string;
      guildId: string | null;
      ageGated: boolean;
      guild?: { adultsOnly: boolean } | null;
    },
    content: string,
    senderId: string,
    // C35 §3.4: webhook'ta kullanıcı bahsetmesi (<@id>) çözülmez → `false` ile kullanıcı sorgusu hiç açılmaz.
    // C35: `plainEveryone` yalnız webhook yolunda — düz metin `@everyone` (token değil) toplu bahsetme sayılır.
    opts: { resolveUsers?: boolean; plainEveryone?: boolean } = {},
  ): Promise<{ mentions: string[]; mentionsEveryone: boolean; mentionRoles: string[] }> {
    /**
     * Adım 0 — ROL token'ları (`<@&roleId>`). R15 §2.2 kapı modeli (R2 revizyonu, 2026-08-03):
     *
     *   | Token                        | Kapı                                             |
     *   |------------------------------|--------------------------------------------------|
     *   | rol, `mentionable: true`     | kanalda yazabilen herkes                          |
     *   | rol, `mentionable: false`    | HİÇ KİMSE (izin baypası yok — anahtar mutlak)     |
     *   | everyone rolü                | İKİ KAPI: `mentionable` VE `MENTION_EVERYONE`     |
     *
     * R2: `MENTION_EVERYONE` artık yalnız @everyone'ı yönetir. İlk hâlde kısıtlı rolleri de
     * baypas ediyordu; göç telafisi o izni everyone rolüne eklediği ortamlarda **her üye**
     * baypası kazandığı için "bahsetme" anahtarını kapatmak hiçbir şey değiştirmiyordu (canlı
     * kullanım raporu). Kısıtlı rol artık anahtar açılmadan kimseye açılmaz.
     *
     * @everyone'da iki kapının birlikte aranması bilinçli: `mentionable` ortam çapında
     * kill-switch olarak anlamını korur ("burada kimse herkesi etiketleyemez"), izin ise
     * kimin yapabileceğini belirler. Tek kapıya indirilirse diğeri yeniden ölü bayrak olur.
     *
     * Kapıya takılan token **sessizce düşer** (mesaj gider, ping olmaz) — hata döndürmek
     * rolün varlığını/adını sızdırırdı.
     *
     * 🔴 Üye id'leri `mentions` dizisine YAZILMAZ: rol üyeliği sonradan değişir, mesaja gömülü
     * üye listesi yanlış tarihe donardı. Alıcı kümesi okuma anında çözülür (`notifyMentions`).
     */
    let mentionsEveryone = false;
    const mentionRoles: string[] = [];
    const ROLE_MENTION_REGEX = /<@&([a-zA-Z0-9_-]+)>/g;
    const roleTokenIds = new Set<string>();
    let roleMatch: RegExpExecArray | null;
    while ((roleMatch = ROLE_MENTION_REGEX.exec(content)) !== null) {
      roleTokenIds.add(roleMatch[1]);
    }
    // Webhook istemcileri (Discord biçimi) everyone rolünün id'sini bilemez; düz `@everyone` metni
    // aynı iki kapıdan (rol mentionable + MENTION_EVERYONE) geçerek tokenla aynı sonucu verir. `@here` çözülmez.
    if (opts.plainEveryone && channel.guildId !== null && PLAIN_EVERYONE_RE.test(content)) {
      const everyoneRole = await this.prisma.role.findFirst({
        where: { guildId: channel.guildId, isEveryone: true },
        select: { id: true },
      });
      if (everyoneRole) roleTokenIds.add(everyoneRole.id);
    }
    // DM/grup DM'de rol diye bir şey yok → çözüm hiç çalıştırılmaz (bugünkü davranış).
    if (roleTokenIds.size > 0 && channel.guildId !== null) {
      const guildId = channel.guildId;
      // TEK sorgu; `guildId` şartı başka ortamın rol id'sini otomatik eler.
      const roles = await this.prisma.role.findMany({
        where: { guildId, id: { in: Array.from(roleTokenIds) } },
        select: { id: true, mentionable: true, isEveryone: true },
      });

      // İzin yalnız everyone token'ı varsa çözülür (R2: normal rollerde izin baypası yok,
      // gereksiz sorgu açılmaz). EN FAZLA BİR KEZ çözülür.
      let permissionCache: boolean | null = null;
      const canMentionEveryone = async (): Promise<boolean> => {
        if (permissionCache === null) {
          permissionCache = await this.permissions.hasGuildPermission(
            senderId,
            guildId,
            'MENTION_EVERYONE',
          );
        }
        return permissionCache;
      };

      for (const role of roles) {
        if (role.isEveryone) {
          if (role.mentionable && (await canMentionEveryone())) mentionsEveryone = true;
          continue;
        }
        // R2: yalnız mentionable rol geçer. İzin baypası yok — kapalı anahtar mutlak.
        if (role.mentionable) {
          // ≤3 farklı rol (kullanıcı bahsetmesindeki ≤10 kuralının kardeşi); fazlası sessizce düşer.
          if (mentionRoles.length < MAX_ROLE_MENTIONS) mentionRoles.push(role.id);
        }
      }
    }

    if (opts.resolveUsers === false) return { mentions: [], mentionsEveryone, mentionRoles };

    // Adım 1: kullanıcı token parse + tekilleştir (<@&...> bu regex'e takılmaz: & sınıfta yok)
    const MENTION_REGEX = /<@([a-zA-Z0-9_-]+)>/g;
    const tokenIds = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = MENTION_REGEX.exec(content)) !== null) {
      tokenIds.add(match[1]);
    }

    // Erken çıkış: kullanıcı token'ı yoksa yalnız rol sonucu
    if (tokenIds.size === 0) return { mentions: [], mentionsEveryone, mentionRoles };

    const ids = Array.from(tokenIds);

    // Adım 2: erişim doğrulaması — TEK toplu sorgu (N+1 yok)
    let validIds: string[];

    if (channel.guildId !== null) {
      // Guild kanalı: üyelik + isMinor TEK sorguda (requireChannelAccess satır 58-69 ile birebir)
      const needsAgeCheck = channel.ageGated || (channel.guild?.adultsOnly ?? false);
      const members = await this.prisma.guildMember.findMany({
        where: { guildId: channel.guildId, userId: { in: ids } },
        select: { userId: true, user: { select: { isMinor: true } } },
      });
      const valid = needsAgeCheck ? members.filter((m) => !m.user.isMinor) : members;
      const validSet = new Set(valid.map((m) => m.userId));
      validIds = ids.filter((id) => validSet.has(id));
    } else {
      // DM / grup DM: ChannelMember kontrolü + isMinor (tutarlılık için)
      const needsAgeCheck = channel.ageGated;
      const members = await this.prisma.channelMember.findMany({
        where: { channelId: channel.id, userId: { in: ids } },
        select: { userId: true, user: { select: { isMinor: true } } },
      });
      const valid = needsAgeCheck ? members.filter((m) => !m.user.isMinor) : members;
      const validSet = new Set(valid.map((m) => m.userId));
      validIds = ids.filter((id) => validSet.has(id));
    }

    // Adım 3: ≤10 sınırı (fazlası sessizce düşer)
    return { mentions: validIds.slice(0, 10), mentionsEveryone, mentionRoles };
  }

  /**
   * 🔴 R7 — E2 Rev.2 §4.2: şifreli mesajda bahsetme. İçerik sunucuya görünmez; istemci kimlik listesini düz üst veri
   * olarak bildirir. Kimlikler `<@id>` token'ına çevrilip BUGÜNKÜ `resolveMentions` kapısından geçer (kanal üyeliği +
   * yaş kapısı/minör süzgeci + ≤10 sınırı): yeni bir erişim kararı YOK, kestirme yol YOK. Üye olmayan kimlik ve
   * gönderenin kendisi sessizce düşer. Rol/@everyone şifreli mesajda yok (token üretilmez).
   */
  private async resolveEncryptedMentions(
    channel: Parameters<MessagesService['resolveMentions']>[0],
    ids: string[] | undefined,
    senderId: string,
  ) {
    const wanted = [...new Set(ids ?? [])].filter((id) => id !== senderId);
    if (wanted.length === 0) return { mentions: [], mentionsEveryone: false, mentionRoles: [] };
    return this.resolveMentions(channel, wanted.map((id) => `<@${id}>`).join(' '), senderId, {
      plainEveryone: false,
    });
  }

  async findMessages(userId: string, channelId: string, before?: string) {
    // C62 §2.3 🔴 R7: üyelik kapısı NOT_CHANNEL_MEMBER verirse, ayrılma kaydı olan eski GROUP_DM üyesi
    // yalnız `leftAt`e kadarki pencereyi okur. Başka her hata (404, yaş kapısı) ve kaydı olmayan yabancı
    // bugünkü gibi aynen fırlar.
    let channel;
    let departed: { joinedAt: Date; leftAt: Date; clearedAt: Date | null } | null = null;
    try {
      channel = await this.membership.requireChannelAccess(userId, channelId);
    } catch (err) {
      if (
        !(err instanceof ForbiddenException) ||
        (err.getResponse() as { error?: string }).error !== 'NOT_CHANNEL_MEMBER'
      ) {
        throw err;
      }
      try {
        ({ channel, window: departed } = await this.membership.requireGroupHistoryAccess(
          userId,
          channelId,
        ));
      } catch {
        throw err;
      }
    }

    // Sabit sayfa boyutu (cursor tabanlı). HTTP yüzeyinde ayarlanabilir limit YOK (controller before-only).
    const take = 50;

    // createdAt filtresi: G4 clearedAt (gt) + cursor before (lt) TEK objede birleşir.
    // (Ayrı spread'lerde ikisi de `createdAt` anahtarını yazıp üzerine binerdi → load-more'da
    //  clearedAt filtresi düşer, temizlenmiş geçmiş geri görünürdü. B1 düzeltmesi.)
    const createdAtFilter: { gt?: Date; lt?: Date; lte?: Date } = {};

    if (before) {
      const beforeMsg = await this.prisma.message.findUnique({ where: { id: before } });
      // Bayat/geçersiz cursor (mesaj yok) → "daha eski yok"; en son 50'yi DÖNDÜRME — yoksa
      // frontend `hasMore` (gelen.length===50) "daha var" sanıp aynı cursor'la döngüye girer. D5.
      if (!beforeMsg) return [];
      createdAtFilter.lt = beforeMsg.createdAt;
    }

    // G4: DM kanalında çağıranın clearedAt'inden SONRASINI döndür (kendi temizlediği geçmiş kapanır).
    // Kayıt DB'de durur; karşı tarafın görünümü tam. Guild kanallarında clearedAt yoktur.
    if (departed) {
      // Eski üye: pencere `leftAt` (dahil) ile kapalı; sayfalama cursor'ı (`lt`) bu üst sınırla birlikte uygulanır.
      createdAtFilter.lte = departed.leftAt;
      if (departed.clearedAt) createdAtFilter.gt = departed.clearedAt;
    } else if (!channel.guildId) {
      const member = await this.prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
        select: { clearedAt: true },
      });
      if (member?.clearedAt) createdAtFilter.gt = member.clearedAt;
    }
    // E2 §2.5: grup DM'de katılım öncesi şifreli mesajlar (sayfalama dahil) dönmez.
    const joinedAt = await groupVisibility(this.prisma, channel, userId, departed?.joinedAt);

    const messages = await this.prisma.message.findMany({
      where: {
        channelId,
        deletedAt: null,
        ...preJoinEncryptedFilter(joinedAt),
        ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
      },
      include: {
        author: { select: MESSAGE_AUTHOR_SELECT },
        attachments: {
          select: {
            id: true,
            filename: true,
            contentType: true,
            size: true,
            scanStatus: true,
            durationMs: true,
            waveform: true,
            thumbnail: true,
            width: true,
            height: true,
            aiGenerationId: true,
          },
        },
        // Reaksiyonları tek sorguda çek — N+1 yok; aggregation JS tarafında
        // C62 §2.3.b: eski üye yalnız `leftAt`e kadar verilmiş tepkileri görür (aktif üyede süzgeç yok).
        reactions: {
          ...(departed ? { where: { createdAt: { lte: departed.leftAt } } } : {}),
          select: { userId: true, emoji: true },
        },
        replyTo: REPLY_TO_INCLUDE,
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    return this.withRoleEmojis(
      channel.guildId,
      messages.map((msg) => toMessageDto(msg, userId, joinedAt, departed?.leftAt)),
    );
  }

  /**
   * C21: ortam kanalı mesajlarının yazarlarına `roleEmoji` (emojisi olan en yüksek pozisyonlu rol)
   * ekler. Tek sorgu; DM'de (guildId null) dokunmaz. DTO'ları yerinde günceller ve döndürür.
   */
  private async withRoleEmojis<T extends { author: { id: string; roleEmoji: string | null } }>(
    guildId: string | null,
    dtos: T[],
  ): Promise<T[]> {
    if (!guildId || dtos.length === 0) return dtos;
    const emojis = await loadRoleEmojis(this.prisma, guildId, [
      ...new Set(dtos.map((d) => d.author.id)),
    ]);
    for (const d of dtos) d.author.roleEmoji = emojis.get(d.author.id) ?? null;
    return dtos;
  }

  async create(userId: string, channelId: string, dto: CreateMessageDto, tokenFamily?: string) {
    const channel = await this.membership.requireChannelAccess(userId, channelId);

    // R7 Enforcement: BAN (global) + MUTE (scope-aware) — webhook yürütmesiyle ORTAK çekirdek (C35 §3)
    await this.assertSenderUnrestricted(userId, channel.guildId ?? null);

    // C57: salt okunur kanal. Yalnız kanal yönetme yetkisi olan (OWNER/ADMINISTRATOR dahil) yazar.
    // Webhook yolu bu kapıdan geçmez (webhook'u zaten MANAGE_WEBHOOKS sahibi kurar).
    if (channel.guildId && channel.readOnly) {
      const canWrite = await this.permissions.hasGuildPermission(
        userId,
        channel.guildId,
        'MANAGE_CHANNELS',
      );
      if (!canWrite) {
        throw new ForbiddenException({
          message: 'Bu kanala yalnız yetkililer yazabilir.',
          error: 'CHANNEL_READ_ONLY',
        });
      }
    }

    // Yavaş mod (slow mode): yalnızca guild kanallarında; tam yetkili (OWNER/ADMINISTRATOR) muaf
    // R20: enum-ADMIN kısa devresi kalktı — izin sistemi tek kaynak.
    if (channel.guildId && channel.slowModeSeconds > 0) {
      const isPrivileged = await this.permissions.hasFullAccess(userId, channel.guildId);
      if (!isPrivileged) {
        const lastMessage = await this.prisma.message.findFirst({
          // C35: webhook mesajı oluşturanın yavaş mod süresini yemez (authorId = oluşturan ama gönderen o değil)
          where: { channelId, authorId: userId, webhookId: null, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        if (lastMessage) {
          const elapsedMs = Date.now() - lastMessage.createdAt.getTime();
          const requiredMs = channel.slowModeSeconds * 1000;
          if (elapsedMs < requiredMs) {
            const retryAfter = Math.ceil((requiredMs - elapsedMs) / 1000);
            throw new HttpException(
              {
                message: `Yavaş mod aktif. Lütfen ${retryAfter} saniye bekleyin.`,
                error: 'SLOW_MODE',
                retryAfter,
              },
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }
        }
      }
    }

    // E1: şifreli kanalda ciphertext zorunlu/düz içerik yasak (409), şifresizde ciphertext 422; cihaz kapısı 403.
    // (BAN/MUTE/salt-okunur kapılarından SONRA: yasaklı kullanıcı şifreleme durumunu yoklayamaz.)
    const e2ee = await this.e2ee.planSend(
      tokenFamily ? { id: userId, tokenFamily } : undefined,
      channelId,
      dto,
    );

    // İçerik + ek doğrulama: ikisi de boş olamaz
    const hasContent = dto.content && dto.content.trim().length > 0;
    const hasAttachments = dto.attachmentIds && dto.attachmentIds.length > 0;
    if (!hasContent && !hasAttachments && !e2ee.encrypted) {
      throw new BadRequestException({
        message: 'Mesaj içeriği veya en az bir dosya eki gereklidir.',
        error: 'EMPTY_MESSAGE',
      });
    }

    // DM kanalında blok kontrolü: blok sonradan konuşmayı keser.
    // GROUP_DM'de ATLA — grup arkadaş-tabanlı (oluşturma/ekleme kapısında garanti edilir).
    // Yalnız tam 2 üyeli 1-1 DM'de uygula.
    if (!channel.guildId && channel.type !== 'GROUP_DM') {
      await this.membership.requireNoDmBlock(userId, channelId);
    }

    // C9: 1-1 DM mesaj isteği kapısı (PENDING kanal)
    if (!channel.guildId && channel.type === 'DM' && channel.dmRequestStatus === 'PENDING') {
      if (channel.dmRequesterId === userId) {
        // İstek sahibi: kabule dek YALNIZ ilk mesaj (önizleme = saldırı yüzeyi, sınırla).
        const existing = await this.prisma.message.count({ where: { channelId, deletedAt: null } });
        if (existing >= 1) {
          throw new ForbiddenException({
            message: 'Mesaj isteğiniz kabul edilene kadar tek mesaj gönderebilirsiniz.',
            error: 'MESSAGE_REQUEST_PENDING',
          });
        }
      } else {
        // Alıcı cevap yazıyor → örtük kabul (kabul endpoint'iyle aynı sonuç).
        await this.prisma.channel.update({
          where: { id: channelId },
          data: { dmRequestStatus: 'ACCEPTED' },
        });
        await this.notifications?.markMessageRequestActioned(userId, channelId);
      }
    }

    // Automod: guild kanalı mesajlarında içerik filtresi (DM hariç — özel alan)
    // Sıfır DB, sıfır kayıt — sadece block-on-send.
    if (channel.guildId && hasContent) this.assertTextsAllowed([dto.content!]);

    // replyToId doğrulama: var + silinmemiş + AYNI kanal
    if (dto.replyToId) {
      const replyTarget = await this.prisma.message.findUnique({
        where: { id: dto.replyToId },
        select: { id: true, channelId: true, deletedAt: true },
      });
      if (!replyTarget || replyTarget.deletedAt !== null || replyTarget.channelId !== channelId) {
        throw new BadRequestException({
          message: 'Geçersiz yanıt hedefi.',
          error: 'INVALID_REPLY',
        });
      }
    }

    // Attachment doğrulama: sahiplik + messageId null (henüz başka mesaja bağlanmamış)
    if (hasAttachments) {
      const attachments = await this.prisma.attachment.findMany({
        where: { id: { in: dto.attachmentIds } },
        select: { id: true, uploaderId: true, messageId: true },
      });

      if (attachments.length !== dto.attachmentIds!.length) {
        throw new BadRequestException({
          message: "Geçersiz dosya eki ID'si.",
          error: 'ATTACHMENT_NOT_FOUND',
        });
      }

      for (const att of attachments) {
        if (att.uploaderId !== userId) {
          throw new BadRequestException({
            message: 'Bu dosya size ait değil.',
            error: 'ATTACHMENT_FORBIDDEN',
          });
        }
        if (att.messageId !== null) {
          throw new BadRequestException({
            message: 'Bu dosya zaten başka bir mesaja eklenmiş.',
            error: 'ATTACHMENT_ALREADY_LINKED',
          });
        }
      }
    }

    // §3: mention token parse + erişim doğrulaması (§4 T&S) — create'ten önce
    // E1: şifreli mesajda içerik sunucuya görünmez → bahsetme istemcinin bildirdiği kimlik listesinden (E2 Rev.2 §4.2).
    const { mentions, mentionsEveryone, mentionRoles } = e2ee.encrypted
      ? await this.resolveEncryptedMentions(channel, dto.mentionUserIds, userId)
      : await this.resolveMentions(channel, dto.content ?? '', userId);

    const message = await this.prisma.message.create({
      data: {
        channelId,
        authorId: userId,
        content: dto.content ?? '',
        replyToId: dto.replyToId ?? null,
        mentions,
        mentionsEveryone,
        mentionRoles,
        ...this.e2eeMessageData(e2ee),
      },
      include: {
        author: { select: MESSAGE_AUTHOR_SELECT },
        attachments: {
          select: {
            id: true,
            filename: true,
            contentType: true,
            size: true,
            scanStatus: true,
            durationMs: true,
            waveform: true,
            thumbnail: true,
            width: true,
            height: true,
            aiGenerationId: true,
          },
        },
        reactions: { select: { userId: true, emoji: true } },
        replyTo: REPLY_TO_INCLUDE,
      },
    });

    // C20: DM/grup DM'de göndermek = okumak. Gönderenin okuma işaretçisi mesajın anına ilerler;
    // yoksa diğer cihaz listeyi çekince kendi mesajı "okunmamış" görünür. Tek updateMany (ek sorgu 1).
    // `dm:read` YAYINLANMAZ (C12: tik "okudu" demek, "cevap yazdı" değil). Ortam kanalında kusur yok:
    // okunmamış sayımı `authorId != ben` ile kendi mesajını zaten saymıyor, dokunulmaz.
    if (!channel.guildId) {
      try {
        await this.prisma.channelMember.updateMany({
          where: {
            channelId,
            userId,
            OR: [{ lastReadAt: null }, { lastReadAt: { lt: message.createdAt } }],
          },
          data: { lastReadAt: message.createdAt },
        });
      } catch {
        // işaretçi kozmetik; mesaj gönderimini bozmaz
      }
    }

    // Attachment'ları mesaja bağla + scan-gate uygula
    if (hasAttachments) {
      // LANSMAN: ATTACHMENT_SCAN_ENABLED=true + gerçek CSAM tarayıcı bağlanmadan canlıya ALINMAZ (R5)
      // false (dev): auto-CLEAN — feature test edilebilir
      // true (prod, gelecek): PENDING bırak → tarama servisi (R5 aracı bağlanır; bu sprint stub/no-op)
      const newScanStatus: ScanStatus = this.scanEnabled ? ScanStatus.PENDING : ScanStatus.CLEAN;

      await this.prisma.attachment.updateMany({
        where: { id: { in: dto.attachmentIds } },
        data: {
          messageId: message.id,
          scanStatus: newScanStatus,
        },
      });

      // Güncellenen attachment'ları mesaj DTO'suna yansıt
      const linkedAttachments = await this.prisma.attachment.findMany({
        where: { messageId: message.id },
        select: {
          id: true,
          filename: true,
          contentType: true,
          size: true,
          scanStatus: true,
          durationMs: true,
          waveform: true,
          thumbnail: true,
          width: true,
          height: true,
          aiGenerationId: true,
        },
      });

      const withFiles = toMessageDto(
        { ...message, attachments: linkedAttachments, reactions: [] },
        userId,
      );
      return withNonce((await this.withRoleEmojis(channel.guildId, [withFiles]))[0], dto.nonce);
    }

    return withNonce(
      (await this.withRoleEmojis(channel.guildId, [toMessageDto(message, userId)]))[0],
      dto.nonce,
    );
  }

  /** E1: şifreli plan → Message alanları (şifresizde boş; `content` ayrıca '' kalır). */
  private e2eeMessageData(plan: E2eeSendPlan) {
    return plan.encrypted
      ? {
          encrypted: true,
          ciphertext: plan.ciphertext,
          senderDeviceId: plan.senderDeviceId,
          frankingTag: plan.frankingTag,
        }
      : {};
  }

  /** Mesaj + yazar + ek + tepki + yanıt alıntısı include'u (E1 şifreli düzenleme yolu için). */
  private messageInclude() {
    return {
      author: { select: MESSAGE_AUTHOR_SELECT },
      attachments: {
        select: {
          id: true,
          filename: true,
          contentType: true,
          size: true,
          scanStatus: true,
          durationMs: true,
          waveform: true,
          thumbnail: true,
          width: true,
          height: true,
          aiGenerationId: true,
        },
      },
      reactions: { select: { userId: true, emoji: true } },
      replyTo: REPLY_TO_INCLUDE,
    } as const;
  }

  async editMessage(
    userId: string,
    channelId: string,
    messageId: string,
    dto: UpdateMessageDto,
    tokenFamily?: string,
  ) {
    const channel = await this.membership.requireChannelAccess(userId, channelId);

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.deletedAt !== null) {
      throw new NotFoundException({ message: 'Mesaj bulunamadı.', error: 'MESSAGE_NOT_FOUND' });
    }

    // C35 §4.6: webhook mesajı düzenlenemez (oluşturan dahil)
    if (message.webhookId) {
      throw new ForbiddenException({
        message: 'Webhook mesajları düzenlenemez.',
        error: 'WEBHOOK_MESSAGE_READONLY',
      });
    }

    if (message.authorId !== userId) {
      throw new ForbiddenException({
        message: 'Bu mesajı düzenleme yetkiniz yok.',
        error: 'NOT_MESSAGE_AUTHOR',
      });
    }

    // E1: şifreli mesajı yalnız `ciphertext` ile düzenle (mention/automod yok; içerik sunucuya görünmez).
    const e2ee = await this.e2ee.planEdit(
      tokenFamily ? { id: userId, tokenFamily } : undefined,
      message,
      dto,
    );
    if (e2ee.encrypted) {
      const encUpdated = await this.prisma.message.update({
        where: { id: messageId },
        data: {
          editedAt: new Date(),
          mentions: (await this.resolveEncryptedMentions(channel, dto.mentionUserIds, userId))
            .mentions,
          ...this.e2eeMessageData(e2ee),
        },
        include: this.messageInclude(),
      });
      return (await this.withRoleEmojis(channel.guildId, [toMessageDto(encUpdated, userId)]))[0];
    }

    // İçerik boş olamaz
    if (!dto.content || dto.content.trim().length === 0) {
      throw new BadRequestException({
        message: 'Mesaj içeriği boş olamaz.',
        error: 'EMPTY_MESSAGE',
      });
    }

    // Automod: guild kanalı içerik filtresi
    if (channel.guildId) this.assertTextsAllowed([dto.content]);

    // §3: mention token parse + erişim doğrulaması (§4 T&S) — edit'te yeniden hesapla
    const { mentions, mentionsEveryone, mentionRoles } = await this.resolveMentions(
      channel,
      dto.content,
      userId,
    );

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: dto.content,
        editedAt: new Date(),
        mentions,
        mentionsEveryone,
        mentionRoles,
      },
      include: {
        author: { select: MESSAGE_AUTHOR_SELECT },
        attachments: {
          select: {
            id: true,
            filename: true,
            contentType: true,
            size: true,
            scanStatus: true,
            durationMs: true,
            waveform: true,
            thumbnail: true,
            width: true,
            height: true,
            aiGenerationId: true,
          },
        },
        reactions: { select: { userId: true, emoji: true } },
        replyTo: REPLY_TO_INCLUDE,
      },
    });

    return (await this.withRoleEmojis(channel.guildId, [toMessageDto(updated, userId)]))[0];
  }

  async deleteMessage(userId: string, channelId: string, messageId: string) {
    const channel = await this.membership.requireChannelAccess(userId, channelId);

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.deletedAt !== null) {
      throw new NotFoundException({ message: 'Mesaj bulunamadı.', error: 'MESSAGE_NOT_FOUND' });
    }

    // Kendi mesajını silmek her zaman serbest.
    // Başkasının mesajını silmek: guild kanalında MANAGE_MESSAGES izni gerekir;
    // grup DM'de kurucu/yönetici hiyerarşisi (group-roles.ts); 1-1 DM'de hiç.
    if (message.authorId !== userId) {
      const allowed = channel.guildId
        ? await this.canManageGuildMessage(userId, channel.guildId, message.webhookId)
        : channel.type === 'GROUP_DM'
          ? canModerateGroupTarget(
              await getGroupRole(this.prisma, channel, userId),
              await getGroupRole(this.prisma, channel, message.authorId),
            )
          : false; // 1-1 DM: başkasının mesajı silinemez
      if (!allowed) {
        throw new ForbiddenException({
          message: 'Bu mesajı silme yetkiniz yok.',
          error: 'NOT_MESSAGE_AUTHOR',
        });
      }
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    return null;
  }

  /** Ortam kanalında başkasının mesajı: MANAGE_MESSAGES; webhook mesajında MANAGE_WEBHOOKS da yeter (C35 §4.6). */
  private async canManageGuildMessage(
    userId: string,
    guildId: string,
    webhookId: string | null,
  ): Promise<boolean> {
    if (await this.permissions.hasGuildPermission(userId, guildId, 'MANAGE_MESSAGES')) return true;
    return !!webhookId && this.permissions.hasGuildPermission(userId, guildId, 'MANAGE_WEBHOOKS');
  }

  /**
   * C46: kişi başı mesaj başına TEK tepki. Tek transaction:
   *  - aynı emoji zaten var → değişiklik yok;
   *  - başka emoji var → eskisi silinir, yenisi eklenir (`removed` = eski, `added` = yeni);
   *  - hiç yok → eklenir.
   * Yarışta (P2002) bir kez yeniden denenir; yine çakışırsa "değişiklik yok" sayılır.
   * Çağıran yayını buna göre yapar: önce `reaction.removed`, sonra `reaction.added`.
   */
  async addReaction(
    userId: string,
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<ReactionChange> {
    await this.membership.requireChannelAccess(userId, channelId);
    await this.requireLiveMessage(channelId, messageId);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const existing = await tx.messageReaction.findUnique({
            where: { messageId_userId: { messageId, userId } },
          });
          if (existing?.emoji === emoji) return { removed: null, added: null };
          if (existing) await tx.messageReaction.deleteMany({ where: { id: existing.id } });
          await tx.messageReaction.create({ data: { messageId, userId, emoji } });
          return { removed: existing?.emoji ?? null, added: emoji };
        });
      } catch (err) {
        const isRace = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (!isRace) throw err;
      }
    }
    return { removed: null, added: null };
  }

  async removeReaction(userId: string, channelId: string, messageId: string, emoji: string) {
    await this.membership.requireChannelAccess(userId, channelId);

    await this.requireLiveMessage(channelId, messageId);

    // No-op: kayıt yoksa hata fırlatma. Dönen değer gerçekten satır silindi mi (yayın kararı çağıranda).
    const { count } = await this.prisma.messageReaction.deleteMany({
      where: { messageId, userId, emoji },
    });

    return count > 0;
  }

  /**
   * C46 §3 — kimler hangi emojiyle tepki verdi. Erişim: `requireChannelAccess` (mesajı görebilen
   * listeyi görür, yeni ifşa yok). En fazla 200 satır okunur; fazlası `count`ta görünmez, listede yok.
   * Gruplar ilk tepki zamanına göre, kişiler `createdAt` artan.
   */
  async listReactions(userId: string, channelId: string, messageId: string) {
    await this.membership.requireChannelAccess(userId, channelId);
    await this.requireLiveMessage(channelId, messageId);

    // `count` tüm satırları sayar (200 sınırı yalnız okunan kişi listesine uygulanır).
    const [totals, rows] = await Promise.all([
      this.prisma.messageReaction.groupBy({
        by: ['emoji'],
        where: { messageId },
        _count: { _all: true },
        _min: { createdAt: true },
      }),
      this.prisma.messageReaction.findMany({
        where: { messageId },
        orderBy: { createdAt: 'asc' },
        take: REACTION_LIST_LIMIT,
        select: { emoji: true, userId: true },
      }),
    ]);
    if (totals.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
      select: MESSAGE_AUTHOR_SELECT,
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const usersByEmoji = new Map<string, typeof users>();
    for (const r of rows) {
      const user = userById.get(r.userId);
      if (!user) continue;
      usersByEmoji.set(r.emoji, [...(usersByEmoji.get(r.emoji) ?? []), user]);
    }

    return [...totals]
      .sort((x, y) => (x._min.createdAt?.getTime() ?? 0) - (y._min.createdAt?.getTime() ?? 0))
      .map((t) => ({
        emoji: t.emoji,
        count: t._count._all,
        users: usersByEmoji.get(t.emoji) ?? [],
      }));
  }

  private async requireLiveMessage(channelId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt !== null || message.channelId !== channelId) {
      throw new NotFoundException({ message: 'Mesaj bulunamadı.', error: 'MESSAGE_NOT_FOUND' });
    }
    return message;
  }

  // ── PIN ortak yetki yardımcısı ──────────────────────────────────────────────
  // Guild kanalı → MANAGE_MESSAGES; DM/grup DM → requireChannelAccess üyeliği yeterli.
  private async requirePinAccess(
    userId: string,
    channel: Awaited<ReturnType<typeof this.membership.requireChannelAccess>>,
  ): Promise<void> {
    if (channel.guildId) {
      // Guild kanalı: üyeliği zaten requireChannelAccess doğruladı; MANAGE_MESSAGES kontrolü ek
      const canManage = await this.permissions.hasGuildPermission(
        userId,
        channel.guildId,
        'MANAGE_MESSAGES',
      );
      if (!canManage) {
        throw new ForbiddenException({
          message: 'Bu işlem için yetkiniz yok.',
          error: 'FORBIDDEN',
        });
      }
    }
    // DM/grup DM: requireChannelAccess üyeliği yeterli — ek kontrol yok
  }

  async pinMessage(userId: string, channelId: string, messageId: string): Promise<null> {
    const channel = await this.membership.requireChannelAccess(userId, channelId);
    await this.requirePinAccess(userId, channel);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt !== null || message.channelId !== channelId) {
      throw new NotFoundException({ message: 'Mesaj bulunamadı.', error: 'INVALID_MESSAGE' });
    }

    // İdempotent: zaten sabitliyse no-op
    if (message.pinnedAt !== null) {
      return null;
    }

    // 50 sınırı: kanal başına en fazla 50 sabit mesaj
    const pinCount = await this.prisma.message.count({
      where: { channelId, pinnedAt: { not: null }, deletedAt: null },
    });
    if (pinCount >= 50) {
      throw new ConflictException({
        message: 'Bu kanalda en fazla 50 mesaj sabitlenebilir.',
        error: 'PIN_LIMIT',
      });
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { pinnedAt: new Date(), pinnedById: userId },
    });

    return null;
  }

  async unpinMessage(userId: string, channelId: string, messageId: string): Promise<null> {
    const channel = await this.membership.requireChannelAccess(userId, channelId);
    await this.requirePinAccess(userId, channel);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt !== null || message.channelId !== channelId) {
      throw new NotFoundException({ message: 'Mesaj bulunamadı.', error: 'INVALID_MESSAGE' });
    }

    // İdempotent: zaten sabit değilse no-op
    if (message.pinnedAt === null) {
      return null;
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { pinnedAt: null, pinnedById: null },
    });

    return null;
  }

  /**
   * M3b §5.1 — `q` (metin) + `has` (link/image/file) süzgeçlerinin ORTAK Prisma `where` parçası.
   * Kanal kapsamlı `searchMessages` ve ortam kapsamlı `searchGuildMessages` **ikisi de** bunu çağırır.
   * Kopyalansaydı aynı ek bir uçta "dosya" diğerinde "medya" sayılabilirdi (M3 `resolveMentionPreview` dersi).
   *
   * - `q` + `has=link` aynı `content` anahtarını ezmesin → AND ile birleşir; tekil durumlarda
   *   `content` doğrudan kalır (mevcut q-only davranış birebir korunur).
   * - `image` = en az bir `image/*` veya `video/*` ek · `file` = en az bir medya-DIŞI ek (M2c §2).
   * - Tanınmayan `has` değeri sessizce yok sayılır (bugünkü ortam ucu davranışı).
   *
   * @param safeQ trim'lenmiş + 100 karakterde kesilmiş sorgu ('' = metin filtresi yok)
   * @param has   'link' | 'image' | 'file' | undefined
   */
  private buildSearchContentFilter(safeQ: string, has?: string): Prisma.MessageWhereInput {
    const hasQ = safeQ.length > 0;
    const qCond = { content: { contains: safeQ, mode: 'insensitive' as const } };
    const linkCond = { content: { contains: 'http', mode: 'insensitive' as const } };

    const contentWhere: Prisma.MessageWhereInput =
      hasQ && has === 'link'
        ? { AND: [qCond, linkCond] }
        : hasQ
          ? qCond
          : has === 'link'
            ? linkCond
            : {};

    // `image | file` ayrımı Attachment.contentType üzerinden: image/* veya video/* → medya.
    const mediaAttachmentCond = {
      OR: [{ contentType: { startsWith: 'image/' } }, { contentType: { startsWith: 'video/' } }],
    };

    return {
      ...contentWhere,
      ...(has === 'image'
        ? { attachments: { some: mediaAttachmentCond } }
        : has === 'file'
          ? { attachments: { some: { NOT: mediaAttachmentCond } } }
          : {}),
    };
  }

  async searchMessages(
    userId: string,
    channelId: string,
    q: string,
    before?: string,
    has?: string,
  ) {
    // Erişim + yaş kapısı + DM throw'ları propagate
    const channel = await this.membership.requireChannelAccess(userId, channelId);

    // q doğrulama: trim, min 2 karakter.
    // M3b §5.1: `has` doluysa q OPSİYONEL (DM medya/bağlantı/dosya sekmeleri sorgusuz çalışır).
    // `has` yoksa bugünkü kural birebir korunur → q zorunlu. Dolu gelen q her hâlükârda ≥2 karakter.
    const trimmedQ = (q ?? '').trim();
    const hasFilter = has?.trim() || undefined;
    if ((!hasFilter || trimmedQ.length > 0) && trimmedQ.length < 2) {
      throw new BadRequestException({
        error: 'QUERY_TOO_SHORT',
        message: 'Arama için en az 2 karakter girin.',
      });
    }
    // Maks 100 karakterde kes
    const safeQ = trimmedQ.slice(0, 100);

    // createdAt filtresi: findMessages'deki B1 dersiyle aynı — DM clearedAt (gt) + cursor before (lt)
    // TEK objede birleştirilir; ayrı spread kullanılmaz.
    const createdAtFilter: { gt?: Date; lt?: Date } = {};

    if (before) {
      const beforeMsg = await this.prisma.message.findUnique({ where: { id: before } });
      // Bayat/geçersiz cursor (mesaj yok) → "daha eski yok"; en son 50'yi DÖNDÜRME — yoksa
      // frontend `hasMore` (gelen.length===50) "daha var" sanıp aynı cursor'la döngüye girer. D5.
      if (!beforeMsg) return [];
      createdAtFilter.lt = beforeMsg.createdAt;
    }

    // G4: DM kanalında clearedAt filtrelemesi (findMessages ile birebir)
    if (!channel.guildId) {
      const member = await this.prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
        select: { clearedAt: true },
      });
      if (member?.clearedAt) createdAtFilter.gt = member.clearedAt;
    }
    // E2 §2.5: sonuçların yanıt alıntıları için (şifreli mesaj zaten aramaya girmez).
    const joinedAt = await groupVisibility(this.prisma, channel, userId);

    const messages = await this.prisma.message.findMany({
      where: {
        channelId,
        deletedAt: null,
        // E1: şifreli mesajlar sunucu aramasına girmez (content '' zaten eşleşmez; açık koşul savunma derinliği)
        encrypted: false,
        // q + has ortak helper'dan (ortam ucuyla aynı mantık — §5.1)
        ...this.buildSearchContentFilter(safeQ, hasFilter),
        // G4 clearedAt (gt) + cursor before (lt) TEK createdAt objesinde birleşik kalır (B1/D5)
        ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
      },
      include: {
        author: { select: MESSAGE_AUTHOR_SELECT },
        attachments: {
          select: {
            id: true,
            filename: true,
            contentType: true,
            size: true,
            scanStatus: true,
            durationMs: true,
            waveform: true,
            thumbnail: true,
            width: true,
            height: true,
            aiGenerationId: true,
          },
        },
        reactions: { select: { userId: true, emoji: true } },
        replyTo: REPLY_TO_INCLUDE,
      },
      orderBy: { createdAt: 'desc' },
      // M3b §5.1 (PM kararı): ortam ucuyla EŞİT (50). DM/kanal medya-bağlantı-dosya sekmeleri
      // artık bu uca geldiği için 30'da kalsaydı ortam kanalında gösterilen sonuç sayısı düşerdi.
      take: 50,
    });

    return this.withRoleEmojis(
      channel.guildId,
      messages.map((msg) => toMessageDto(msg, userId, joinedAt)),
    );
  }

  async findPins(userId: string, channelId: string) {
    // requireChannelAccess: üyelik + yaş kapısı dahil
    const channel = await this.membership.requireChannelAccess(userId, channelId);
    // E2 §2.5: katılım öncesi şifreli sabitlenmiş mesaj yeni üyeye dönmez.
    const joinedAt = await groupVisibility(this.prisma, channel, userId);

    const messages = await this.prisma.message.findMany({
      where: {
        channelId,
        pinnedAt: { not: null },
        deletedAt: null,
        ...preJoinEncryptedFilter(joinedAt),
      },
      include: {
        author: { select: MESSAGE_AUTHOR_SELECT },
        attachments: {
          select: {
            id: true,
            filename: true,
            contentType: true,
            size: true,
            scanStatus: true,
            durationMs: true,
            waveform: true,
            thumbnail: true,
            width: true,
            height: true,
            aiGenerationId: true,
          },
        },
        reactions: { select: { userId: true, emoji: true } },
        replyTo: REPLY_TO_INCLUDE,
      },
      orderBy: { pinnedAt: 'desc' },
    });

    return this.withRoleEmojis(
      channel.guildId,
      messages.map((msg) => toMessageDto(msg, userId, joinedAt)),
    );
  }

  /**
   * Sunucu-geneli mesaj arama — kullanıcının ERİŞEBİLDİĞİ guild metin kanallarında.
   * Sızıntı-güvenli: yaş-kapılı/adultsOnly minöre kapalı; özel kanal yalnız tam yetkili
   * (OWNER/ADMINISTRATOR) veya ChannelMember'a. Sonuç kanal-gruplu döner (Discord-tarzı).
   */
  async searchGuildMessages(
    userId: string,
    guildId: string,
    q: string,
    opts?: { from?: string; mentions?: string; in?: string; has?: string },
  ) {
    await this.membership.requireGuildMembership(userId, guildId);

    // q opsiyonel: dolu ise ≥2 karakter şartı korunur, boşsa metin filtresi uygulanmaz.
    const trimmedQ = (q ?? '').trim();
    const hasQ = trimmedQ.length > 0;
    if (hasQ && trimmedQ.length < 2) {
      throw new BadRequestException({
        error: 'QUERY_TOO_SHORT',
        message: 'Arama için en az 2 karakter girin.',
      });
    }
    const safeQ = trimmedQ.slice(0, 100);

    // from / mentions / in / has opsiyonel filtreler (boş string = yok say)
    const from = opts?.from?.trim() || undefined;
    const mentions = opts?.mentions?.trim() || undefined;
    const inChannel = opts?.in?.trim() || undefined;
    const has = opts?.has?.trim() || undefined; // 'link' | 'image' | 'file'

    // En az biri (q | from | mentions | in | has) dolu olmalı; hiçbiri yoksa boş sonuç.
    if (!hasQ && !from && !mentions && !inChannel && !has) return [];

    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { adultsOnly: true },
    });
    const channels = await this.prisma.channel.findMany({
      where: { guildId, deletedAt: null, type: 'GUILD_TEXT' },
      select: { id: true, name: true, ageGated: true, isPrivate: true },
    });

    // R20: enum-ADMIN kısa devresi kalktı — izin sistemi (OWNER/ADMINISTRATOR) tek kaynak.
    const privileged = await this.permissions.hasFullAccess(userId, guildId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isMinor: true },
    });
    const isMinor = user?.isMinor ?? false;

    // Özel kanal üyeliği (yalnız ayrıcalıklı değilse gerekir)
    let memberChannelIds = new Set<string>();
    const privateIds = channels.filter((c) => c.isPrivate).map((c) => c.id);
    if (privateIds.length && !privileged) {
      const cms = await this.prisma.channelMember.findMany({
        where: { userId, channelId: { in: privateIds } },
        select: { channelId: true },
      });
      memberChannelIds = new Set(cms.map((c) => c.channelId));
    }

    let accessible = channels.filter((c) => {
      if ((c.ageGated || guild?.adultsOnly) && isMinor) return false; // yaş kapısı
      if (c.isPrivate && !privileged && !memberChannelIds.has(c.id)) return false; // özel kanal
      return true;
    });
    // `in` filtresi: yalnız o kanal — erişilebilir değilse boş sonuç (sızıntı yok)
    if (inChannel) accessible = accessible.filter((c) => c.id === inChannel);
    if (accessible.length === 0) return [];

    const nameById = new Map(accessible.map((c) => [c.id, c.name]));

    const messages = await this.prisma.message.findMany({
      where: {
        channelId: { in: accessible.map((c) => c.id) },
        deletedAt: null,
        // Dolu filtreler AND'lenir; boş olanlar where'e hiç girmez.
        // q + has ortak helper'dan (kanal ucuyla aynı mantık — §5.1)
        ...this.buildSearchContentFilter(safeQ, has),
        // C35: webhook mesajının authorId'si oluşturan; `from` süzgeci oluşturanı webhook mesajlarından ele vermesin
        ...(from ? { authorId: from, webhookId: null } : {}),
        ...(mentions ? { mentions: { has: mentions } } : {}),
      },
      include: {
        author: { select: MESSAGE_AUTHOR_SELECT },
        attachments: {
          select: {
            id: true,
            filename: true,
            contentType: true,
            size: true,
            scanStatus: true,
            durationMs: true,
            waveform: true,
            thumbnail: true,
            width: true,
            height: true,
            aiGenerationId: true,
          },
        },
        reactions: { select: { userId: true, emoji: true } },
        replyTo: REPLY_TO_INCLUDE,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Kanal-gruplu sonuç (kanal sırası: ilk eşleşmenin geldiği sıra)
    const grouped = new Map<string, ReturnType<typeof toMessageDto>[]>();
    for (const m of messages) {
      if (!grouped.has(m.channelId)) grouped.set(m.channelId, []);
      grouped.get(m.channelId)!.push(toMessageDto(m, userId));
    }
    await this.withRoleEmojis(guildId, [...grouped.values()].flat());
    return [...grouped.entries()].map(([channelId, msgs]) => ({
      channelId,
      channelName: nameById.get(channelId) ?? '',
      messages: msgs,
    }));
  }
}
