import { previewFromAttachments } from '../../common/utils/attachment-preview.util';
import {
  canModerateGroupTarget,
  getGroupRole,
  isGroupManager,
} from '../../shared/group-roles/group-roles';
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DmPermissionService } from '../../shared/dm-permission/dm-permission.service';
import { CreateDmChannelDto } from './dto/create-dm-channel.dto';
import { CreateGroupDmDto } from './dto/create-group-dm.dto';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { RenameGroupDmDto } from './dto/rename-group-dm.dto';
import { visibleLastReaction } from '../../common/utils/last-reaction.util';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { PushService } from '../../shared/push/push.service';
import { E2eeMembershipService } from '../e2ee/e2ee-membership.service';
import { channelSoftDeleteOps, softDeleteChannelInTx } from '../e2ee/e2ee-channel-cleanup';
import { VoiceService } from '../voice/voice.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  GroupVisibility,
  isHiddenBeforeJoin,
  preJoinEncryptedFilter,
  toPeriods,
} from '../../common/utils/pre-join.util';
import {
  DepartureReasonValue,
  departureUpsertOp,
  loadDepartedGroupItems,
} from './dm-departure.util';
import {
  GroupDmEventInput,
  buildGroupEventPayload,
  groupEventCreateOp,
} from './dm-group-event.util';
import { seenReadersDecision } from './dm-seen.util';

/**
 * 🫀 C12 §3.2 — okundu bilgisi görünürlük kararı. **T&S karar fonksiyonu (R7), satır satır insan
 * incelemesi zorunlu.**
 *
 * Bilerek SAF: sorgu yapmaz, yalnız verilen olgulardan karar üretir. İki çağıranı var (DTO alanı ve
 * `dm:read` yayını) ve ikisinin de kuralı AYNI olmak zorunda; kuralı bir yerde gevşetip diğerinde
 * sıkı bırakmak, olayı gönderip DTO'da gizlemek gibi sessiz bir tutarsızlık üretirdi.
 *
 * 🔴 İKİ AYRI SORU, İKİ AYRI CEVAP (ilk sürümün kusuru buydu — sahip bulgusu 2026-08-11):
 *   `visible`: tik çizilecek mi? Bu bir GİZLİLİK/kanal-türü kararı.
 *   `readAt` : karşı taraf ne zamana kadar okumuş? Bu bir VERİ.
 * İlk sürüm ikisini tek bir `Date | null`a sıkıştırıyordu ve "henüz hiç okumamış" ile "gizlilik
 * kapalı" aynı sonuca düşüyordu. Sonuç: karşı taraf sohbeti bir kez bile açmadıysa tik HİÇ
 * çizilmiyordu — yani ilk mesajda "İletildi" asla görünmüyordu, ki tam da en çok görülmesi
 * gereken an orası. Ayrımı koruyoruz: gizlilik açıksa tek tik ÇİZİLİR, okuma gelince çifte döner.
 *
 * Kural sırası (fail-closed — belirsizse görünmez):
 *  1. 1-1 DM değil → görünmez. Grup DM'de "karşı taraf" tanımsız (C12 §8, karar C12c'de).
 *  2. Bekleyen mesaj isteği (PENDING) → görünmez. Kabul edilmeden "okudu" demek isteği süzgeç
 *     olmaktan çıkarır (C9'un amacı). Okuma gerçekleşmiş olsa bile paylaşılmaz.
 *  3. Taraflardan biri diğerini engellemiş → görünmez.
 *  4. Karşı taraf okundu bilgisini kapatmış → görünmez (kendi tercihi).
 *  5. **Ben kapatmışsam → görünmez.** Karşılıklılık: paylaşmayan göremez. Bu madde kullanıcının
 *     kendi aleyhine görünen tek maddedir ve bilinçlidir; tek yönlü kullanım yok.
 *  6. Aksi hâlde görünür; `readAt` karşı tarafın okuma anıdır (hiç okumamışsa null → tek tik).
 *
 * Dönen tarih bir SIR DEĞİL: o sohbetin iki tarafından biri okumuş demek. Yine de mesaj başına
 * değil kanal başına tek değer dönüyor (istemci mesaj.createdAt ile karşılaştırır).
 */
export interface ReadReceiptDecision {
  /** Tik çizilecek mi. false → istemci göstergeyi HİÇ çizmez (yarım kalmış tik bırakmayız). */
  visible: boolean;
  /** Karşı tarafın okuma anı. `visible` true olsa bile hiç okumamışsa null (= tek tik). */
  readAt: Date | null;
}

export function readReceiptDecision(input: {
  isDm: boolean;
  requestPending: boolean;
  blockedEitherWay: boolean;
  viewerReadReceipts: boolean;
  otherReadReceipts: boolean;
  otherLastReadAt: Date | null;
}): ReadReceiptDecision {
  const hidden: ReadReceiptDecision = { visible: false, readAt: null };
  if (!input.isDm) return hidden;
  if (input.requestPending) return hidden;
  if (input.blockedEitherWay) return hidden;
  if (!input.otherReadReceipts) return hidden;
  if (!input.viewerReadReceipts) return hidden;
  return { visible: true, readAt: input.otherLastReadAt ?? null };
}

/**
 * 🫀 C34 §1 — GRUP DM okundu durumu kararı. **T&S karar fonksiyonu (R7), satır satır insan
 * incelemesi zorunlu.** `readReceiptDecision` (1-1) DEĞİŞMEDİ; bu ayrı ve saf bir kardeşi.
 *
 * Grupta "karşı taraf" tek kişi değil. İzleyiciye YALNIZ tek toplu zaman verilir:
 *   `allReadAt` = uygun üyelerin `lastReadAt`lerinin EN KÜÇÜĞÜ (biri hiç okumadıysa null) → "herkes okudu"
 * Sahip kararı 2026-10-29: "bazıları okudu" ara durumu YOK; en-büyük zaman hesaplanmaz ve gönderilmez.
 * 🔴 Bireysel `lastReadAt` bu fonksiyonun çıktısında HİÇ bulunmaz: kim okudu sorusu cevaplanamaz
 * (OUT: "kim okudu" listesi).
 *
 * Uygun üye (izleyici HARİÇ olarak çağıran filtreler): `readReceipts` açık VE izleyiciyle iki yönde
 * de engel ilişkisi yok. Kapalı/engelli üye hiç sayılmaz: ne `all` kapısını bekletir ne `some`a girer.
 *
 * Fail-closed:
 *  - İzleyicinin kendi `readReceipts`'i kapalıysa → görünmez (karşılıklılık, C12 madde 5 ile aynı).
 *  - Uygun üye yoksa → görünmez, iki zaman null.
 */
export interface GroupReadReceiptDecision {
  /** Çift tik çizilecek mi. false → istemci grupta yalnız gri tek tik çizer. */
  visible: boolean;
  allReadAt: Date | null;
}

export function groupReadReceiptDecision(input: {
  viewerReadReceipts: boolean;
  /** İzleyici HARİÇ diğer üyeler. */
  members: Array<{
    readReceipts: boolean;
    blockedEitherWay: boolean;
    lastReadAt: Date | null;
  }>;
}): GroupReadReceiptDecision {
  const hidden: GroupReadReceiptDecision = { visible: false, allReadAt: null };
  if (!input.viewerReadReceipts) return hidden;

  const eligible = input.members.filter((m) => m.readReceipts && !m.blockedEitherWay);
  if (eligible.length === 0) return hidden;

  const times = eligible.map((m) => m.lastReadAt?.getTime() ?? null);
  const readTimes = times.filter((t): t is number => t !== null);
  const allReadAt = readTimes.length === times.length ? new Date(Math.min(...readTimes)) : null;
  return { visible: true, allReadAt };
}

@Injectable()
export class DmService {
  constructor(
    private prisma: PrismaService,
    private dmPermission: DmPermissionService,
    private realtime: RealtimeService,
    // C50: opsiyonel (okundu push'u); yoksa yalnız soket yayını yapılır.
    @Optional() private push?: PushService,
    // E2: grup üyeliği değişiminin E2EE tarafı (Nest her zaman verir; `?` yalnız elle kurulan eski spec'ler için).
    private e2ee?: E2eeMembershipService,
    // C62 §2.3.d: ayrılan/çıkarılan kullanıcıyı grup aramasından (LiveKit odası = groupId) düşürür.
    private voice?: VoiceService,
    // C75: istek sonuçlanınca (kabul/ret) mesaj isteği bildirimini okundu işaretler.
    private notifications?: NotificationsService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // T&S yardımcısı: karşılıklı arkadaşlık kontrolü
  // ACCEPTED friendship: her iki yönde kontrol (requester veya addressee olabilir)
  // ─────────────────────────────────────────────────────────────────────────────
  async isMutualFriend(aId: string, bId: string): Promise<boolean> {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: aId, addresseeId: bId },
          { requesterId: bId, addresseeId: aId },
        ],
      },
      select: { id: true },
    });
    return friendship !== null;
  }

  /**
   * GET /dm/channels — DM kanalları (1-1 + GROUP_DM).
   *
   * G4: clearedAt olan ve sonrasında YENİ MESAJ OLMAYAN 1-1 kanallar listede gösterilmez.
   * G3: canMessage + selfBlocked hesaplanır (blok durumu) — yalnız 1-1 için.
   *
   * Discriminated union dönüşü:
   *  - 1-1 DM: type='DM', otherUser, canMessage, selfBlocked
   *  - GROUP_DM: type='GROUP_DM', name, ownerId, members[{id,username,avatarUrl,avatarAnimatedUrl}]
   */
  async getDmChannels(userId: string) {
    const memberships = await this.prisma.channelMember.findMany({
      where: { userId },
      include: {
        channel: {
          include: {
            members: {
              include: {
                user: {
                  // readReceipts: C12 okundu kararı için (çıktıya yazılmaz, aşağıdaki DTO'lar elle kuruluyor)
                  select: {
                    id: true,
                    username: true,
                    avatarUrl: true,
                    avatarAnimatedUrl: true,
                    readReceipts: true,
                  },
                },
              },
            },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                author: { select: { id: true, username: true, avatarUrl: true } },
                // Ek-yalnız önizleme için yalnız tür (son mesajın ekleri)
                attachments: { select: { contentType: true } },
              },
            },
          },
        },
      },
    });

    // Silinmiş kanalları filtrele (kanal silinmişse üyelik hâlâ olabilir)
    const activeMemberships = memberships.filter((m) => m.channel.deletedAt === null);

    // C9: PENDING mesaj isteği kanalları normal DM listesinde GÖRÜNMEZ (istek kutusuna gider —
    // hem alıcıda hem gönderende). Kabul edilince (ACCEPTED) listeye girer.
    const dmMemberships = activeMemberships.filter(
      (m) => m.channel.type === 'DM' && m.channel.dmRequestStatus !== 'PENDING',
    );
    const groupMemberships = activeMemberships.filter((m) => m.channel.type === 'GROUP_DM');

    // G3: 1-1 DM blok kontrolü (batch)
    const otherUserIds = dmMemberships
      .map((m) => m.channel.members.find((cm) => cm.userId !== userId)?.userId)
      .filter((id): id is string => !!id);

    // C34: grup üyeleri de aynı toplu blok sorgusuna katılır (grup okundu kararı için); 1-1 kararı
    // yalnız `otherUserIds` üzerinden okunur, davranışı değişmez.
    const groupMemberIds = groupMemberships.flatMap((m) =>
      m.channel.members.filter((cm) => cm.userId !== userId).map((cm) => cm.userId),
    );
    const blockLookupIds = [...otherUserIds, ...groupMemberIds];

    const [blockedByMeRecords, blockedByOtherRecords] = await Promise.all([
      this.prisma.userBlock.findMany({
        where: { blockerId: userId, blockedId: { in: blockLookupIds } },
        select: { blockedId: true },
      }),
      this.prisma.userBlock.findMany({
        where: { blockedId: userId, blockerId: { in: blockLookupIds } },
        select: { blockerId: true },
      }),
    ]);

    const selfBlockedSet = new Set(blockedByMeRecords.map((b) => b.blockedId));
    const blockedMeSet = new Set(blockedByOtherRecords.map((b) => b.blockerId));

    const result: Array<Record<string, unknown>> = [];

    // 1-1 DM kanalları
    for (const m of dmMemberships) {
      const otherMember = m.channel.members.find((cm) => cm.userId !== userId);
      const lastMsg = m.channel.messages[0] ?? null;

      // G4: clearedAt filtresi — temizlendi ve sonrasında mesaj yok → listeye alma
      if (m.clearedAt !== null) {
        const hasNewMessage = lastMsg !== null && lastMsg.createdAt > m.clearedAt;
        if (!hasNewMessage) continue;
      }

      const lastReaction = visibleLastReaction({
        raw: m.lastReaction,
        lastReadAt: m.lastReadAt,
        lastMessageAt: lastMsg?.createdAt ?? null,
        blockedEitherWay: (id) => selfBlockedSet.has(id) || blockedMeSet.has(id),
      });
      const unread =
        lastReaction !== null ||
        (lastMsg !== null && (m.lastReadAt === null || lastMsg.createdAt > m.lastReadAt));
      const otherId = otherMember?.user.id;
      const selfBlocked = otherId ? selfBlockedSet.has(otherId) : false;
      const anyBlock = otherId ? selfBlockedSet.has(otherId) || blockedMeSet.has(otherId) : false;
      const canMessage = !anyBlock;

      // 🔴 Kusur düzeltmesi (sahip bulgusu 2026-10-29): okundu alanları yalnız tek kanal DTO'sunda
      // (`toDmChannelDto`) vardı, liste ucu göndermiyordu. Sohbet listeden açılınca istemci
      // `receiptsEnabled`i bulamıyor ve tik HİÇ çizilmiyordu. Karar aynı tek fonksiyondan geçer.
      // PENDING istek kanalları bu listeye zaten girmiyor (yukarıdaki süzgeç).
      const selfMember = m.channel.members.find((cm) => cm.userId === userId);
      const receipt = readReceiptDecision({
        isDm: true,
        requestPending: false,
        blockedEitherWay: anyBlock,
        viewerReadReceipts: selfMember?.user.readReceipts ?? false,
        otherReadReceipts: otherMember?.user.readReceipts ?? false,
        otherLastReadAt: otherMember?.lastReadAt ?? null,
      });
      // C67: görüldü avatarları; eski alanlar geriye uyum için aynen kalır.
      const seen = seenReadersDecision({
        requestPending: false,
        viewerReadReceipts: selfMember?.user.readReceipts ?? false,
        members: otherMember
          ? [
              {
                userId: otherMember.userId,
                readReceipts: otherMember.user.readReceipts,
                blockedEitherWay: anyBlock,
                lastReadAt: otherMember.lastReadAt,
              },
            ]
          : [],
      });

      result.push({
        id: m.channel.id,
        type: 'DM' as const,
        otherUser: otherMember
          ? {
              id: otherMember.user.id,
              username: otherMember.user.username,
              avatarUrl: otherMember.user.avatarUrl,
              avatarAnimatedUrl: otherMember.user.avatarAnimatedUrl,
            }
          : null,
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              channelId: lastMsg.channelId,
              content: previewFromAttachments(lastMsg.content, lastMsg.attachments),
              replyToId: lastMsg.replyToId,
              ...(lastMsg.encrypted ? { encrypted: true } : {}),
              author: {
                id: lastMsg.author.id,
                username: lastMsg.author.username,
                avatarUrl: lastMsg.author.avatarUrl,
              },
              createdAt: lastMsg.createdAt.toISOString(),
            }
          : null,
        unread,
        lastReaction,
        canMessage,
        selfBlocked,
        receiptsEnabled: receipt.visible,
        otherReadAt: receipt.readAt ? receipt.readAt.toISOString() : null,
        seenBy: seen.readers,
      });
    }

    // C65: aktif grupların önceki üyelik dönemleri TEK sorguda (grup yoksa sorgu yok).
    const periodsByChannel = new Map<string, { joinedAt: Date; leftAt: Date }[]>();
    if (groupMemberships.length > 0) {
      const pastRows = await this.prisma.groupDmPastPeriod.findMany({
        where: { userId, channelId: { in: groupMemberships.map((g) => g.channel.id) } },
        select: { channelId: true, joinedAt: true, leftAt: true },
      });
      for (const r of pastRows ?? []) {
        periodsByChannel.set(r.channelId!, [...(periodsByChannel.get(r.channelId!) ?? []), r]);
      }
    }

    // GROUP_DM kanalları
    for (const m of groupMemberships) {
      const visibility: GroupVisibility = {
        joinedAt: m.createdAt,
        periods: toPeriods(periodsByChannel.get(m.channel.id) ?? []),
      };
      // E2 §2.5: katılım öncesi şifreli mesaj önizlemede/okunmamışta yok; son mesaj bu süzgeçle yeniden seçilir.
      const newest = m.channel.messages[0] ?? null;
      const lastMsg =
        newest && isHiddenBeforeJoin(newest, visibility)
          ? await this.latestVisibleMessage(m.channel.id, visibility)
          : newest;
      const lastReaction = visibleLastReaction({
        raw: m.lastReaction,
        lastReadAt: m.lastReadAt,
        lastMessageAt: lastMsg?.createdAt ?? null,
        blockedEitherWay: (id) => selfBlockedSet.has(id) || blockedMeSet.has(id),
      });
      const unread =
        lastReaction !== null ||
        (lastMsg !== null && (m.lastReadAt === null || lastMsg.createdAt > m.lastReadAt));

      // C34 §1: grup okundu kararı; bireysel lastReadAt yanıta YAZILMAZ, yalnız toplu tek zaman.
      const groupReceipt = groupReadReceiptDecision({
        viewerReadReceipts:
          m.channel.members.find((cm) => cm.userId === userId)?.user.readReceipts ?? false,
        members: m.channel.members
          .filter((cm) => cm.userId !== userId)
          .map((cm) => ({
            readReceipts: cm.user.readReceipts,
            blockedEitherWay: selfBlockedSet.has(cm.userId) || blockedMeSet.has(cm.userId),
            lastReadAt: cm.lastReadAt,
          })),
      });

      const groupSeen = seenReadersDecision({
        requestPending: false,
        viewerReadReceipts:
          m.channel.members.find((cm) => cm.userId === userId)?.user.readReceipts ?? false,
        members: m.channel.members
          .filter((cm) => cm.userId !== userId)
          .map((cm) => ({
            userId: cm.userId,
            readReceipts: cm.user.readReceipts,
            blockedEitherWay: selfBlockedSet.has(cm.userId) || blockedMeSet.has(cm.userId),
            lastReadAt: cm.lastReadAt,
          })),
      });

      result.push({
        id: m.channel.id,
        type: 'GROUP_DM' as const,
        name: m.channel.name ?? null,
        ownerId: m.channel.ownerId ?? null,
        // Kurucunun atadığı yöneticiler (kurucu hariç; kurucu ownerId'den bilinir)
        adminIds: m.channel.members.filter((cm) => cm.isAdmin).map((cm) => cm.userId),
        members: m.channel.members.map((cm) => ({
          id: cm.user.id,
          username: cm.user.username,
          avatarUrl: cm.user.avatarUrl,
          avatarAnimatedUrl: cm.user.avatarAnimatedUrl,
        })),
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              channelId: lastMsg.channelId,
              content: previewFromAttachments(lastMsg.content, lastMsg.attachments),
              replyToId: lastMsg.replyToId,
              ...(lastMsg.encrypted ? { encrypted: true } : {}),
              author: {
                id: lastMsg.author.id,
                username: lastMsg.author.username,
                avatarUrl: lastMsg.author.avatarUrl,
              },
              createdAt: lastMsg.createdAt.toISOString(),
            }
          : null,
        unread,
        lastReaction,
        receiptsEnabled: groupReceipt.visible,
        groupAllReadAt: groupReceipt.allReadAt ? groupReceipt.allReadAt.toISOString() : null,
        seenBy: groupSeen.readers,
        departed: null,
      });
    }

    // C62 §2.3: gruptan ayrılan/çıkarılan kullanıcının grupları (kanalı silinmemiş olanlar)
    const departedItems = await loadDepartedGroupItems(this.prisma, userId);
    for (const d of departedItems) result.push(d.item);

    // 🔴 Sıralama (sahip bulgusu 2026-08-12, web + mobil): bu liste HİÇ sıralanmıyordu.
    // Prisma `orderBy`sız bir sorguda satır sırasını garanti etmez; "en son mesaj gelen sohbet
    // üstte" kuralı bu yüzden yalnız istemcilerin canlı `dm.message` yolunda (kanalı listenin
    // başına taşıma) çalışıyor, her tazelemede sıra rastgele bir düzene dönüyordu. Kural artık
    // TEK yerde, sunucuda: iki istemci de aynı sırayı alır, istemcide ikinci bir sıralama
    // yazılmaz. Anahtar son mesajın tarihi; hiç mesajı olmayan sohbet (yeni açılmış, henüz
    // yazılmamış) kanalın kendi oluşturma tarihine düşer — aksi hâlde en dibe çakılırdı.
    const channelCreatedAt = new Map(
      activeMemberships.map((m) => [m.channel.id, m.channel.createdAt.getTime()]),
    );
    for (const d of departedItems) channelCreatedAt.set(d.item.id as string, d.channelCreatedAt);
    const sortKey = (c: Record<string, unknown>): number => {
      const lastMessage = c.lastMessage as { createdAt: string } | null;
      if (lastMessage) return Date.parse(lastMessage.createdAt);
      return channelCreatedAt.get(c.id as string) ?? 0;
    };
    result.sort((a, b) => sortKey(b) - sortKey(a));

    return result;
  }

  async getOrCreateDmChannel(senderId: string, dto: CreateDmChannelDto) {
    const targetId = dto.userId;

    const result = await this.dmPermission.canDm(senderId, targetId);
    if (!result.allowed) {
      // G3: blok dahil tüm ret nedenleri jenerik DM_NOT_ALLOWED (BLOCKED istemciye dönmez)
      throw new ForbiddenException({
        message: 'Bu kullanıcıya mesaj gönderemezsiniz.',
        error: 'DM_NOT_ALLOWED',
      });
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId, deletedAt: null },
      select: { id: true, username: true, avatarUrl: true, avatarAnimatedUrl: true },
    });
    if (!target)
      throw new NotFoundException({ message: 'Kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });

    // Mevcut DM kanalını ara (soft-delete HARİÇ — reddedilen istek kanalı yeniden dönmesin).
    // Mevcut PENDING/ACCEPTED/legacy kanal varsa onu döner: yeni istek oluşturmaz.
    const existingMembership = await this.prisma.channelMember.findFirst({
      where: {
        userId: senderId,
        channel: {
          type: 'DM',
          deletedAt: null,
          members: { some: { userId: targetId } },
        },
      },
      include: { channel: true },
    });

    if (existingMembership) {
      return this.toDmChannelDto(existingMembership.channel.id, target, senderId);
    }

    // Yeni DM kanalı oluştur (atomik transaction).
    // C9: canDm asRequest ise DİREKT değil PENDING istek kanalı (dmRequesterId = başlatan).
    const channel = await this.prisma.$transaction(async (tx) => {
      const ch = await tx.channel.create({
        data: {
          type: 'DM',
          guildId: null,
          ...(result.asRequest
            ? { dmRequestStatus: 'PENDING' as const, dmRequesterId: senderId }
            : {}),
        },
      });
      await tx.channelMember.createMany({
        data: [
          { channelId: ch.id, userId: senderId },
          { channelId: ch.id, userId: targetId },
        ],
      });
      return ch;
    });

    return this.toDmChannelDto(channel.id, target, senderId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /dm/groups
  // [R7] T&S kapı sırası (insan incelemesi zorunlu):
  //   0. D49: tek üye (toplam 2 kişi) → grup DEĞİL, 1-1 DM'e yönlendirilir (aşağıda)
  //   1. creator isMinor → 403 GROUP_MINOR_FORBIDDEN
  //   2. her memberId: isMutualFriend değilse → 400 NOT_FRIEND (jenerik)
  //      member.isMinor → 403 GROUP_MINOR_FORBIDDEN (jenerik; statü sızdırılmaz)
  //   3. $transaction: Channel{GROUP_DM} + ChannelMember (creator + members) → 201
  // ─────────────────────────────────────────────────────────────────────────────
  async createGroupDm(creatorId: string, dto: CreateGroupDmDto) {
    // Benzersizlik + kendini içermez
    const uniqueIds = [...new Set(dto.memberIds)].filter((id) => id !== creatorId);
    if (uniqueIds.length === 0 || uniqueIds.length > 9) {
      throw new BadRequestException({
        message: 'Geçersiz üye listesi.',
        error: 'INVALID_MEMBER_LIST',
      });
    }

    // ── D49: iki kişilik grup = DM'in kötü kopyası ──────────────────────────────
    // Tek üye kaldıysa açılmak istenen şey aslında bir 1-1 DM. Grup kurmak yerine
    // getOrCreateDmChannel'a yönlendirilir (mevcut DM varsa o kanal döner, yenisi
    // açılmaz). Bu bir HATA yolu değil, BAŞARI yolu — istemci dönen `type: 'DM'`e
    // bakıp DM ekranına gider, kullanıcıya uyarı gösterilmez.
    //
    // 🔴 [R7] Kapı bilinçli olarak değişir: grup yolu isMutualFriend + minör kontrolü
    // uygularken bu dal canDm'e tabidir (dmPolicy'ye göre arkadaş olmayana "istek"
    // izni verebilir). Kapı GEVŞEMİYOR, açılan şey bir DM olduğu için DM'in kendi
    // kapısı uygulanıyor. Ret hâlinde canDm'in jenerik DM_NOT_ALLOWED'ı döner;
    // "grup kurulamadı" gibi ayrı bir metin üretilmez (statü sızdırma yok).
    if (uniqueIds.length === 1) {
      return this.getOrCreateDmChannel(creatorId, { userId: uniqueIds[0] });
    }

    // Kapı 1: creator isMinor?
    const creator = await this.prisma.user.findUnique({
      where: { id: creatorId, deletedAt: null },
      select: { isMinor: true },
    });
    if (!creator)
      throw new NotFoundException({ message: 'Kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });
    if (creator.isMinor) {
      throw new ForbiddenException({
        message: 'Bu işlem için yetkiniz yok.',
        error: 'GROUP_MINOR_FORBIDDEN',
      });
    }

    // Kapı 2: her üye — karşılıklı arkadaş + minör değil
    const members = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds }, deletedAt: null },
      select: { id: true, isMinor: true, username: true, avatarUrl: true },
    });

    // Statü sızdırma engeli: eksik kullanıcı = jenerik NOT_FRIEND (bulunamadı veya arkadaş değil farkı yok)
    for (const memberId of uniqueIds) {
      const member = members.find((m) => m.id === memberId);
      if (!member) {
        throw new BadRequestException({ message: 'Kullanıcı eklenemedi.', error: 'NOT_FRIEND' });
      }
      // G1: minör hedef → jenerik NOT_FRIEND (statü sızdırılmaz; arkadaş-olmayan ile ayırt edilemez)
      const mutual = await this.isMutualFriend(creatorId, memberId);
      if (member.isMinor || !mutual) {
        throw new BadRequestException({ message: 'Kullanıcı eklenemedi.', error: 'NOT_FRIEND' });
      }
    }

    // Kapı 3: transaction — kanal + üyeler
    const channel = await this.prisma.$transaction(async (tx) => {
      const ch = await tx.channel.create({
        data: {
          type: 'GROUP_DM',
          guildId: null,
          ownerId: creatorId,
          name: dto.name ?? null,
        },
        include: {
          members: {
            include: {
              user: {
                select: { id: true, username: true, avatarUrl: true, avatarAnimatedUrl: true },
              },
            },
          },
        },
      });
      await tx.channelMember.createMany({
        data: [
          { channelId: ch.id, userId: creatorId },
          ...uniqueIds.map((id) => ({ channelId: ch.id, userId: id })),
        ],
      });
      return ch;
    });

    // Üye listesini taze çek (createMany sonrası include çalışmaz)
    const freshMembers = await this.prisma.channelMember.findMany({
      where: { channelId: channel.id },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true, avatarAnimatedUrl: true } },
      },
    });

    return {
      id: channel.id,
      type: 'GROUP_DM' as const,
      name: channel.name ?? null,
      ownerId: creatorId,
      adminIds: [] as string[],
      members: freshMembers.map((cm) => ({
        id: cm.user.id,
        username: cm.user.username,
        avatarUrl: cm.user.avatarUrl,
        avatarAnimatedUrl: cm.user.avatarAnimatedUrl,
      })),
      lastMessage: null,
      unread: false,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /dm/groups/:id/members
  // [R7] ekleyenin arkadaşı + minör değil + zaten üye değil
  // ─────────────────────────────────────────────────────────────────────────────
  async addGroupMember(callerId: string, groupId: string, dto: AddGroupMemberDto) {
    await this.requireGroupChannel(groupId);
    await this.requireGroupMember(callerId, groupId);

    const targetId = dto.userId;
    if (targetId === callerId) {
      throw new BadRequestException({
        message: 'Kendinizi ekleyemezsiniz.',
        error: 'CANNOT_ADD_SELF',
      });
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId, deletedAt: null },
      select: { id: true, isMinor: true, username: true, avatarUrl: true },
    });
    if (!target) {
      throw new BadRequestException({ message: 'Kullanıcı eklenemedi.', error: 'NOT_FRIEND' });
    }
    // G1: minör hedef → jenerik NOT_FRIEND (statü sızdırılmaz; arkadaş-olmayan ile ayırt edilemez)
    const mutual = await this.isMutualFriend(callerId, targetId);
    if (target.isMinor || !mutual) {
      throw new BadRequestException({ message: 'Kullanıcı eklenemedi.', error: 'NOT_FRIEND' });
    }

    const existing = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: groupId, userId: targetId } },
    });
    if (existing) {
      throw new ConflictException({ message: 'Kullanıcı zaten grupta.', error: 'ALREADY_MEMBER' });
    }

    // E2 §2.2/§2.4: şifreli gruba uygun olmayan üye eklenemez (422); yeniden eklenen üyenin eski-üye kaydı
    // aynı transaction'da silinir; commit sonrası `e2ee:devices-changed`.
    // C62 §2.2: geri eklenen normal üyedir; ayrılma izi (departure) üyelik create ile aynı tx'te silinir.
    await this.e2ee?.assertMemberAddable(groupId, targetId);
    // C64 §2.2: olay satırı üyelikle AYNI tx ve AYNI an (`at`; ChannelMember.createdAt açıkça verilir).
    const at = new Date();
    const added = groupEventCreateOp(this.prisma, {
      channelId: groupId,
      kind: 'MEMBER_ADDED',
      actorId: callerId,
      targetId,
      createdAt: at,
    });
    await this.prisma.$transaction([
      this.prisma.channelMember.create({
        data: { channelId: groupId, userId: targetId, createdAt: at },
      }),
      this.prisma.groupDmDeparture.deleteMany({ where: { channelId: groupId, userId: targetId } }),
      added.op,
      ...(this.e2ee?.addOps(groupId, targetId) ?? []),
    ]);
    await this.e2ee?.afterAdd(groupId, targetId);
    // Alıcılar: değişiklik SONRASI grubun tüm üyeleri (eklenen dahil).
    const members = await this.prisma.channelMember.findMany({
      where: { channelId: groupId },
      select: { userId: true },
    });
    await this.emitGroupEvent(
      added.event,
      (members ?? []).map((m) => m.userId),
    );

    return {
      id: target.id,
      username: target.username,
      avatarUrl: target.avatarUrl,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE /dm/groups/:id/members/me
  // Çağıran ayrılır; kalan < 2 → kanal soft-delete
  // ─────────────────────────────────────────────────────────────────────────────
  async leaveGroupDm(userId: string, groupId: string) {
    await this.requireGroupChannel(groupId);
    const membership = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: groupId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException({
        message: 'Bu grubun üyesi değilsiniz.',
        error: 'NOT_CHANNEL_MEMBER',
      });
    }

    await this.deleteGroupMembership(groupId, userId, membership, 'LEFT', null);

    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE /dm/groups/:id/members/:userId — [R7] kurucu herkesi, yönetici normal üyeyi çıkarır
  // ─────────────────────────────────────────────────────────────────────────────
  async removeGroupMember(callerId: string, groupId: string, targetUserId: string) {
    const channel = await this.requireGroupChannel(groupId);

    if (targetUserId === callerId) {
      throw new BadRequestException({
        message:
          'Kendinizi gruptan çıkaramazsınız. Gruptan ayrılmak için ayrılma seçeneğini kullanın.',
        error: 'CANNOT_REMOVE_SELF',
      });
    }

    await this.requireGroupMember(callerId, groupId);
    const [actor, target] = await Promise.all([
      getGroupRole(this.prisma, channel, callerId),
      getGroupRole(this.prisma, channel, targetUserId),
    ]);
    if (!canModerateGroupTarget(actor, target)) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }

    const membership = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: groupId, userId: targetUserId } },
    });
    if (!membership) {
      throw new NotFoundException({
        message: 'Kullanıcı bu grubun üyesi değil.',
        error: 'MEMBER_NOT_FOUND',
      });
    }

    await this.deleteGroupMembership(groupId, targetUserId, membership, 'REMOVED', callerId);

    return null;
  }

  /**
   * Gruptan ayrılma/çıkarma ortak yolu: departure upsert (C62) + üyelik satırı + (grupta E2EE varsa) eski-üye
   * kaydı ve bekleyen Welcome silme AYNI transaction'da (E2 §2.4); kalan < 2 ise kanal soft-delete; commit sonrası
   * soket odasından çıkarma + `e2ee:devices-changed` (E2EE servisi) + ayrılana `dm.group_departed`.
   * Kanal silinirse E2EE satırlarına dokunulmaz.
   */
  private async deleteGroupMembership(
    groupId: string,
    userId: string,
    membership: { id: string; createdAt: Date; clearedAt: Date | null },
    reason: DepartureReasonValue,
    actorId: string | null,
  ) {
    const e2eeOps = (await this.e2ee?.departureOps(groupId, userId)) ?? [];
    const others = await this.prisma.channelMember.findMany({
      where: { channelId: groupId, userId: { not: userId } },
      select: { userId: true },
    });
    const leftAt = new Date();
    // C64 §2.2: olay `leftAt` ile AYNI an ve AYNI tx. LEFT → actor null; REMOVED → çıkaran.
    // C65: bu üyelik dönemi (geri eklemede SİLİNMEZ) aynı tx'te kaydedilir.
    const periodOp = this.prisma.groupDmPastPeriod.create({
      data: { channelId: groupId, userId, joinedAt: membership.createdAt, leftAt },
    });
    const left = groupEventCreateOp(this.prisma, {
      channelId: groupId,
      kind: reason === 'LEFT' ? 'MEMBER_LEFT' : 'MEMBER_REMOVED',
      actorId: reason === 'LEFT' ? null : actorId,
      targetId: userId,
      createdAt: leftAt,
    });
    await this.prisma.$transaction([
      departureUpsertOp(this.prisma, {
        channelId: groupId,
        userId,
        joinedAt: membership.createdAt,
        leftAt,
        reason,
        clearedAt: membership.clearedAt,
        memberIds: others.map((o) => o.userId),
      }),
      this.prisma.channelMember.delete({ where: { id: membership.id } }),
      left.op,
      periodOp,
      ...e2eeOps,
    ]);

    const remaining = await this.prisma.channelMember.count({ where: { channelId: groupId } });
    const channelDeleted = remaining < 2;
    if (channelDeleted) {
      // C77 §1: kalan son üyenin cihazlarına bekleyen Welcome'lar da silinir (aynı işlem).
      await this.prisma.$transaction(channelSoftDeleteOps(this.prisma, groupId));
    }
    await this.e2ee?.afterDeparture(groupId, userId, channelDeleted);
    // C62 §2.3.d: kişi devam eden grup aramasından da düşer (best-effort; hata işlemi bozmaz). Kanal silindiyse de.
    await this.voice?.evictFromRooms(userId, [groupId]);
    // Yalnız ayrılana (tüm soketleri); kalanlara canlı olay bu işte yok (C62 §6).
    this.realtime.emitToUser(userId, 'dm.group_departed', {
      channelId: groupId,
      reason,
      leftAt: leftAt.toISOString(),
    });
    // C64: kalan üyelere + ayrılana `dm.group_event` (kanal silinse de; kalan üyeye ve ayrılana gider).
    await this.emitGroupEvent(left.event, [...others.map((o) => o.userId), userId]);
  }

  /** C64: commit sonrası `dm.group_event` yayını. Best-effort: yayın hatası işlemi bozmaz. */
  private async emitGroupEvent(event: GroupDmEventInput, recipientIds: string[]): Promise<void> {
    try {
      const payload = await buildGroupEventPayload(this.prisma, event);
      this.realtime.emitToUsers([...new Set(recipientIds)], 'dm.group_event', payload);
    } catch {
      // olay satırı zaten yazıldı; canlı yayın düşerse istemci sayfa yenilemesinde görür
    }
  }

  /** DELETE /dm/groups/:id/departure — eski üye, ayrılma kaydını (listedeki grubu) siler; yerel etki, olay yok. */
  async deleteDeparture(userId: string, groupId: string) {
    // C65: sildiği geçmiş geri eklenince geri gelmesin; dönem satırları departure ile aynı tx'te silinir.
    const [{ count }] = await this.prisma.$transaction([
      this.prisma.groupDmDeparture.deleteMany({ where: { channelId: groupId, userId } }),
      this.prisma.groupDmPastPeriod.deleteMany({ where: { channelId: groupId, userId } }),
    ]);
    if (count === 0) {
      throw new NotFoundException({
        message: 'Ayrılma kaydı bulunamadı.',
        error: 'DEPARTURE_NOT_FOUND',
      });
    }
    return null;
  }

  /** Grup listesinin son mesajı, katılım öncesi şifreli mesajlar hariç (nadir yol: en yeni mesaj gizliyse). */
  private latestVisibleMessage(channelId: string, visibility: GroupVisibility) {
    return this.prisma.message.findFirst({
      where: { channelId, deletedAt: null, ...preJoinEncryptedFilter(visibility) },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        attachments: { select: { contentType: true } },
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE /dm/groups/:id — yalnız owner
  // ─────────────────────────────────────────────────────────────────────────────
  async deleteGroupDm(userId: string, groupId: string) {
    const channel = await this.requireGroupChannel(groupId);

    if (channel.ownerId !== userId) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }

    // C77 §1: soft-delete + bekleyen E2EE Welcome temizliği aynı işlemde.
    await this.prisma.$transaction(channelSoftDeleteOps(this.prisma, groupId));

    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PATCH /dm/groups/:id — kurucu veya yönetici; grup adı güncelle
  // ─────────────────────────────────────────────────────────────────────────────
  async renameGroupDm(userId: string, groupId: string, dto: RenameGroupDmDto) {
    const channel = await this.requireGroupChannel(groupId);

    if (channel.ownerId !== userId) {
      await this.requireGroupMember(userId, groupId);
    }
    if (!isGroupManager(await getGroupRole(this.prisma, channel, userId))) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }

    const updated = await this.prisma.channel.update({
      where: { id: groupId },
      data: { name: dto.name },
    });

    return { id: updated.id, name: updated.name };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUT/DELETE /dm/groups/:id/admins/:userId — [R7] yalnız kurucu; üyeye yöneticilik ver/al
  // ─────────────────────────────────────────────────────────────────────────────
  async setGroupAdmin(callerId: string, groupId: string, targetUserId: string, isAdmin: boolean) {
    const channel = await this.requireGroupChannel(groupId);

    if (channel.ownerId !== callerId) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }
    if (targetUserId === callerId) {
      throw new BadRequestException({
        message: 'Kurucu zaten tüm yetkilere sahip.',
        error: 'CANNOT_CHANGE_OWNER',
      });
    }

    const membership = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: groupId, userId: targetUserId } },
    });
    if (!membership) {
      throw new NotFoundException({
        message: 'Kullanıcı bu grubun üyesi değil.',
        error: 'MEMBER_NOT_FOUND',
      });
    }

    await this.prisma.channelMember.update({ where: { id: membership.id }, data: { isAdmin } });
    return { userId: targetUserId, isAdmin };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1-1 DM yardımcıları
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * POST /dm/channels/:id/read — kendi `lastReadAt`imi şimdiye çeker.
   *
   * C12 §3.3: yazma bittikten sonra karşı tarafa `dm:read` yayınlanır ki gönderdiği mesajların
   * tiki BEKLEMEDEN çift tike dönsün. Yayın kararı DTO ile aynı fonksiyondan (`readReceiptDecision`)
   * geçer: görmeye hakkı yoksa olay HİÇ gönderilmez, "istemci nasılsa gizler" denmez.
   *
   * Grup DM'de yayın `dm:groupRead` (C34, `emitGroupReadReceipt`); 1-1 `readReceiptDecision` grup için hep `visible: false`.
   */
  async markRead(userId: string, channelId: string) {
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!member) {
      throw new ForbiddenException({
        message: 'Bu kanala erişim izniniz yok.',
        error: 'NOT_CHANNEL_MEMBER',
      });
    }
    const readAt = new Date();
    await this.prisma.channelMember.update({
      where: { id: member.id },
      data: { lastReadAt: readAt },
    });

    // C20: kendi diğer cihazlarım (yalnız okuyan; karşı tarafa GİTMEZ).
    this.emitReadSelf(userId, { channelId, guildId: null, readAt });
    await this.emitReadReceipt(channelId, userId, readAt);
    await this.emitSeen(channelId, userId);
    return null;
  }

  /**
   * C20 — `read:self`: okumayı yapan kullanıcının KENDİ soketlerine (diğer cihazlar). Karşı tarafa
   * asla gitmez, bu yüzden gizlilik kararı (`readReceiptDecision`) gerekmez. Hata okumayı bozmaz.
   */
  private emitReadSelf(
    userId: string,
    payload: { channelId: string; guildId: string | null; readAt: Date },
  ): void {
    try {
      this.realtime.emitToUser(userId, 'read:self', {
        channelId: payload.channelId,
        guildId: payload.guildId,
        readAt: payload.readAt.toISOString(),
      });
    } catch {
      // kozmetik: bir sonraki liste çekimi doğru değeri taşır
    }
    // C50 §2.4: kapalı telefondaki v2 bildirimini sil (işaret yoksa push yok). Hata okumayı bozmaz.
    this.push?.notifyRead(userId, [payload.channelId]).catch(() => {});
  }

  /**
   * C12 §3.3 — `dm:read` yayını. Ayrı fonksiyon çünkü `markRead`in işi okuma yazmak; yayın
   * başarısız olsa bile okuma yazılmış olmalı (aşağıdaki try/catch bunun için).
   *
   * 🔴 Buradaki gizlilik kararı `readReceiptDecision` ile ALINIR, elle tekrar yazılmaz. Dikkat: karar
   * ALICININ gözünden veriliyor — `viewerReadReceipts` alıcının tercihi, `otherReadReceipts`
   * okuyanın (benim) tercihim. Yön karıştırılırsa kapalı anahtar sızar.
   */
  private async emitReadReceipt(channelId: string, readerId: string, readAt: Date): Promise<void> {
    try {
      const channel = await this.prisma.channel.findUnique({
        where: { id: channelId },
        select: {
          type: true,
          dmRequestStatus: true,
          members: {
            select: { userId: true, user: { select: { readReceipts: true } } },
          },
        },
      });
      if (!channel) return;
      // C34: grup DM'de karar çok kişili ve ayrı fonksiyonda; 1-1 yolu aşağıda AYNEN.
      if (channel.type === 'GROUP_DM') {
        await this.emitGroupReadReceipt(channelId, readerId);
        return;
      }
      if (channel.type !== 'DM') return;

      const reader = channel.members.find((m) => m.userId === readerId);
      const recipient = channel.members.find((m) => m.userId !== readerId);
      if (!reader || !recipient) return;

      const block = await this.prisma.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: readerId, blockedId: recipient.userId },
            { blockerId: recipient.userId, blockedId: readerId },
          ],
        },
        select: { id: true },
      });

      const decision = readReceiptDecision({
        isDm: true,
        requestPending: channel.dmRequestStatus === 'PENDING',
        blockedEitherWay: !!block,
        viewerReadReceipts: recipient.user.readReceipts,
        otherReadReceipts: reader.user.readReceipts,
        otherLastReadAt: readAt,
      });
      if (!decision.visible) return;

      this.realtime.emitToUser(recipient.userId, 'dm:read', {
        channelId,
        userId: readerId,
        readAt: readAt.toISOString(),
      });
    } catch {
      // Yayın kozmetiktir: okuma zaten yazıldı, bir sonraki `GET /dm/channels` doğru değeri taşır.
      // Kullanıcının okuma işlemini bir soket hatası yüzünden 500'e çevirmek orantısız olurdu.
    }
  }

  /**
   * C67 §2 — `dm:seen { channelId, userId, readAt }`. Okuyan bir üye `markRead` yaptığında, onu karar
   * fonksiyonuyla (`seenReadersDecision`) GÖREBİLEN her izleyiciye gider; görmeye hakkı olmayana (ayarı
   * kapalı, engelli, izleyicinin kendi ayarı kapalı, PENDING) hiç gönderilmez. Okuyanın kendisine gitmez.
   * Mevcut `dm:read` / `dm:groupRead` yayınları geriye uyum için AYNEN kalır. Hata okumayı bozmaz.
   */
  private async emitSeen(channelId: string, readerId: string): Promise<void> {
    try {
      const channel = await this.prisma.channel.findUnique({
        where: { id: channelId },
        select: { type: true, dmRequestStatus: true },
      });
      if (!channel || (channel.type !== 'DM' && channel.type !== 'GROUP_DM')) return;
      const members = await this.prisma.channelMember.findMany({
        where: { channelId },
        select: { userId: true, lastReadAt: true, user: { select: { readReceipts: true } } },
      });
      const ids = members.map((m) => m.userId);
      const blocks = await this.prisma.userBlock.findMany({
        where: { blockerId: { in: ids }, blockedId: { in: ids } },
        select: { blockerId: true, blockedId: true },
      });
      const isBlocked = (a: string, b: string) =>
        blocks.some(
          (x) =>
            (x.blockerId === a && x.blockedId === b) || (x.blockerId === b && x.blockedId === a),
        );

      for (const viewer of members) {
        if (viewer.userId === readerId) continue;
        const decision = seenReadersDecision({
          requestPending: channel.dmRequestStatus === 'PENDING',
          viewerReadReceipts: viewer.user.readReceipts,
          members: members
            .filter((m) => m.userId !== viewer.userId)
            .map((m) => ({
              userId: m.userId,
              readReceipts: m.user.readReceipts,
              blockedEitherWay: isBlocked(viewer.userId, m.userId),
              lastReadAt: m.lastReadAt,
            })),
        });
        const reader = decision.readers.find((r) => r.userId === readerId);
        if (!reader) continue;
        this.realtime.emitToUser(viewer.userId, 'dm:seen', {
          channelId,
          userId: readerId,
          readAt: reader.readAt,
        });
      }
    } catch {
      // Kozmetik: bir sonraki liste çekimi doğru `seenBy`yi taşır.
    }
  }

  /**
   * C34 §1.4 — grup DM'de bir üye okuyunca DİĞER her üyeye, O ÜYENİN gözünden güncel toplu durum
   * (`dm:groupRead`). Karar `groupReadReceiptDecision` ile alınır; payload'da bireysel okuma anı
   * YOKTUR (okuyanın kimliği bile gitmez, istemci yalnız toplu tek zamanı değiştirir). Okuyanın
   * kendisine gitmez: kendi okuması kendi tikini değiştirmez. Hata okumayı bozmaz (çağıran try/catch).
   */
  private async emitGroupReadReceipt(channelId: string, readerId: string): Promise<void> {
    const members = await this.prisma.channelMember.findMany({
      where: { channelId },
      select: {
        userId: true,
        lastReadAt: true,
        user: { select: { readReceipts: true } },
      },
    });
    const ids = members.map((m) => m.userId);
    const blocks = await this.prisma.userBlock.findMany({
      where: { blockerId: { in: ids }, blockedId: { in: ids } },
      select: { blockerId: true, blockedId: true },
    });
    const isBlocked = (a: string, b: string) =>
      blocks.some(
        (x) => (x.blockerId === a && x.blockedId === b) || (x.blockerId === b && x.blockedId === a),
      );

    for (const viewer of members) {
      if (viewer.userId === readerId) continue;
      const decision = groupReadReceiptDecision({
        viewerReadReceipts: viewer.user.readReceipts,
        members: members
          .filter((m) => m.userId !== viewer.userId)
          .map((m) => ({
            readReceipts: m.user.readReceipts,
            blockedEitherWay: isBlocked(viewer.userId, m.userId),
            lastReadAt: m.lastReadAt,
          })),
      });
      this.realtime.emitToUser(viewer.userId, 'dm:groupRead', {
        channelId,
        receiptsEnabled: decision.visible,
        groupAllReadAt: decision.allReadAt ? decision.allReadAt.toISOString() : null,
      });
    }
  }

  /**
   * DELETE /dm/channels/:id — G4 inbox soft-delete.
   *
   * Çağıranın ChannelMember.clearedAt = now. Mesaj DB'de durur; karşı taraf etkilenmez.
   * Yeni mesaj gelince kanal tekrar listede görünür (getDmChannels filtresi).
   * Event YOK — lokal etki.
   */
  async clearDmChannel(userId: string, channelId: string) {
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!member) {
      throw new ForbiddenException({
        message: 'Bu kanala erişim izniniz yok.',
        error: 'NOT_CHANNEL_MEMBER',
      });
    }
    await this.prisma.channelMember.update({
      where: { id: member.id },
      data: { clearedAt: new Date() },
    });
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Özel yardımcılar
  // ─────────────────────────────────────────────────────────────────────────────

  /** GROUP_DM kanalı var mı + silinmemiş mi? */
  private async requireGroupChannel(groupId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: groupId, deletedAt: null },
    });
    if (!channel || channel.type !== 'GROUP_DM') {
      throw new NotFoundException({ message: 'Grup bulunamadı.', error: 'GROUP_NOT_FOUND' });
    }
    return channel;
  }

  /** Çağıran grup üyesi mi? */
  private async requireGroupMember(userId: string, groupId: string) {
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: groupId, userId } },
    });
    if (!member) {
      throw new ForbiddenException({
        message: 'Bu grubun üyesi değilsiniz.',
        error: 'NOT_CHANNEL_MEMBER',
      });
    }
    return member;
  }

  private async toDmChannelDto(
    channelId: string,
    otherUser: {
      id: string;
      username: string;
      avatarUrl: string | null;
      avatarAnimatedUrl?: string | null;
    },
    userId: string,
  ) {
    const [members, lastMsg, selfBlockRecord, otherBlockRecord, channelRow] = await Promise.all([
      // C12: tek sorguda İKİ üyelik + her iki tarafın `readReceipts` tercihi. Eskiden yalnız kendi
      // üyeliğim `findUnique` ile çekiliyordu; karşı tarafın `lastReadAt`i ve iki tercih için üç ayrı
      // sorgu eklemek yerine aynı sorgu genişletildi — kanal listesi bunu her kanal için çağırıyor,
      // sorgu sayısı orada N ile çarpılıyor.
      this.prisma.channelMember.findMany({
        where: { channelId },
        select: {
          userId: true,
          lastReadAt: true,
          clearedAt: true,
          user: { select: { readReceipts: true } },
        },
      }),
      this.prisma.message.findFirst({
        where: { channelId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { id: true, username: true, avatarUrl: true } },
          // Ek-yalnız önizleme için yalnız tür (son mesajın ekleri)
          attachments: { select: { contentType: true } },
        },
      }),
      // G3: selfBlocked = yalnız "ben onu engelledim"
      this.prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId: userId, blockedId: otherUser.id } },
        select: { id: true },
      }),
      // canMessage için "o beni engelledi mi" — DTO'da açığa ÇIKMAZ, yalnız canMessage hesabında kullanılır
      this.prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId: otherUser.id, blockedId: userId } },
        select: { id: true },
      }),
      // C9: istek durumu (frontend "istek gönderildi/bekliyor" ayrımı için)
      this.prisma.channel.findUnique({
        where: { id: channelId },
        select: { dmRequestStatus: true, dmRequesterId: true },
      }),
    ]);

    // `membership` eskiden doğrudan sorgudan geliyordu; artık iki üyelik tek sorguda çekiliyor ve
    // burada ayrıştırılıyor. `unread` hesabı DEĞİŞMEDİ (aynı alan, aynı karşılaştırma).
    const membership = members.find((m) => m.userId === userId) ?? null;
    const otherMember = members.find((m) => m.userId === otherUser.id) ?? null;

    const unread =
      lastMsg !== null &&
      (membership?.lastReadAt === null ||
        lastMsg.createdAt > (membership?.lastReadAt ?? new Date(0)));

    const selfBlocked = !!selfBlockRecord;
    const canMessage = !selfBlocked && !otherBlockRecord;

    // C12 §3.2 — karar tek yerde (`readReceiptDecision`), burada yalnız olgular toplanıyor.
    const receipt = readReceiptDecision({
      isDm: true, // bu fonksiyon yalnız 1-1 DM için çağrılıyor
      requestPending: channelRow?.dmRequestStatus === 'PENDING',
      blockedEitherWay: !!selfBlockRecord || !!otherBlockRecord,
      viewerReadReceipts: membership?.user.readReceipts ?? false,
      otherReadReceipts: otherMember?.user.readReceipts ?? false,
      otherLastReadAt: otherMember?.lastReadAt ?? null,
    });
    // C67: görüldü avatarları (aynı kapı: PENDING/engel/ayar karar fonksiyonunda).
    const seen = seenReadersDecision({
      requestPending: channelRow?.dmRequestStatus === 'PENDING',
      viewerReadReceipts: membership?.user.readReceipts ?? false,
      members: otherMember
        ? [
            {
              userId: otherMember.userId,
              readReceipts: otherMember.user.readReceipts,
              blockedEitherWay: !!selfBlockRecord || !!otherBlockRecord,
              lastReadAt: otherMember.lastReadAt,
            },
          ]
        : [],
    });

    return {
      id: channelId,
      type: 'DM' as const,
      otherUser: {
        id: otherUser.id,
        username: otherUser.username,
        avatarUrl: otherUser.avatarUrl,
        // C16: DM listesinde aktif sohbette ve hover'da canlanır
        avatarAnimatedUrl: otherUser.avatarAnimatedUrl ?? null,
      },
      lastMessage: lastMsg
        ? {
            id: lastMsg.id,
            channelId: lastMsg.channelId,
            content: previewFromAttachments(lastMsg.content, lastMsg.attachments),
            replyToId: lastMsg.replyToId,
            ...(lastMsg.encrypted ? { encrypted: true } : {}),
            author: {
              id: lastMsg.author.id,
              username: lastMsg.author.username,
              avatarUrl: lastMsg.author.avatarUrl,
            },
            createdAt: lastMsg.createdAt.toISOString(),
          }
        : null,
      unread,
      canMessage,
      selfBlocked,
      // C9: null = normal DM · 'PENDING'/'ACCEPTED' = istek. requestOutgoing = bu isteği ben mi başlattım.
      requestStatus: channelRow?.dmRequestStatus ?? null,
      requestOutgoing: channelRow?.dmRequesterId === userId,
      // C12 §3.2 — İKİ AYRI ALAN, birbirine karıştırılmamalı:
      //   receiptsEnabled: tik çizilecek mi (gizlilik kapısı). false → istemci HİÇ çizmez.
      //   otherReadAt   : karşı tarafın okuma anı; null = henüz hiç okumamış (tek tik).
      receiptsEnabled: receipt.visible,
      otherReadAt: receipt.readAt ? receipt.readAt.toISOString() : null,
      seenBy: seen.readers,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // C9 — Mesaj İstekleri (arkadaş-olmayan DM onay süzgeci)
  // ─────────────────────────────────────────────────────────────────────────────

  /** GET /dm/requests — bana gelen (ben başlatmadığım) PENDING mesaj istekleri. */
  async getMessageRequests(userId: string) {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { messageRequestsSeenAt: true },
    });
    const seenAt = me?.messageRequestsSeenAt ?? null;
    const channels = await this.prisma.channel.findMany({
      where: {
        type: 'DM',
        deletedAt: null,
        dmRequestStatus: 'PENDING',
        dmRequesterId: { not: userId }, // bana gelen (ben başlatan değilim)
        members: { some: { userId } }, // ben üyeyim
        // C75 K1: istek ilk mesajla doğar; mesajsız (yalnız "Mesaj at" ile açılmış) kanal alıcıya görünmez.
        messages: { some: { deletedAt: null } },
      },
      include: {
        dmRequester: { select: { id: true, username: true, avatarUrl: true } },
        // C75 Rev.7: yalnız KENDİ üyelik satırım (istek başına görüldü). Karşı tarafın satırı okunmaz.
        members: { where: { userId }, select: { requestSeenAt: true } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            content: true,
            encrypted: true,
            createdAt: true,
            attachments: { select: { contentType: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return channels.map((c) => ({
      channelId: c.id,
      requester: c.dmRequester
        ? {
            id: c.dmRequester.id,
            username: c.dmRequester.username,
            avatarUrl: c.dmRequester.avatarUrl,
          }
        : null,
      preview: previewFromAttachments(c.messages[0]?.content, c.messages[0]?.attachments),
      // E1: yalnız şifreliyse alan var (lastMessage kalıbı); istemci "🔒 Şifreli mesaj" gösterir.
      ...(c.messages[0]?.encrypted ? { encrypted: true as const } : {}),
      createdAt: c.createdAt.toISOString(),
      // C75 Rev.7: istek tek tek açıldıysa görüldü. Açılmadıysa Rev.6'nın toplu damgası (eski istemcilerin
      // yazdığı) hâlâ geçerli: ilk mesaj o damgadan sonraysa (ya da damga yoksa) görülmemiş.
      unseen:
        !c.members[0]?.requestSeenAt &&
        (!seenAt || (c.messages[0] ? c.messages[0].createdAt > seenAt : false)),
    }));
  }

  /**
   * POST /dm/requests/seen — C75 Rev.6: istekler sayfası görüldü. seenAt=now; okunmamış istek
   * bildirimleri okundu; kendi soketlerine `dm.requests_seen`; bekleyen istek kanalları için
   * diğer cihazlardaki push bildirimi kalksın diye okundu push'u.
   */
  async markMessageRequestsSeen(userId: string) {
    const seenAt = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: { messageRequestsSeenAt: seenAt },
    });
    await this.notifications?.markAllMessageRequestsRead(userId);
    this.realtime.emitToUser(userId, 'dm.requests_seen', { seenAt: seenAt.toISOString() });
    const pending = await this.prisma.channel.findMany({
      where: {
        type: 'DM',
        deletedAt: null,
        dmRequestStatus: 'PENDING',
        dmRequesterId: { not: userId },
        members: { some: { userId } },
        messages: { some: { deletedAt: null } },
      },
      select: { id: true },
    });
    if (pending.length > 0) {
      this.push
        ?.notifyRead(
          userId,
          pending.map((c) => c.id),
        )
        .catch(() => {});
    }
    return null;
  }

  /** Bekleyen isteği doğrula + alıcı-kapısı (yalnız alıcı işlem yapabilir, istek sahibi değil). */
  private async requirePendingRequestForRecipient(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId, deletedAt: null },
    });
    if (!channel || channel.type !== 'DM' || channel.dmRequestStatus !== 'PENDING') {
      throw new NotFoundException({ message: 'İstek bulunamadı.', error: 'REQUEST_NOT_FOUND' });
    }
    // İstek sahibi kendi isteğini kabul/reddedemez; yalnız alıcı.
    if (channel.dmRequesterId === userId) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!member) {
      throw new ForbiddenException({
        message: 'Bu isteğe erişim izniniz yok.',
        error: 'NOT_CHANNEL_MEMBER',
      });
    }
    return channel;
  }

  /** POST /dm/requests/:channelId/accept — ACCEPTED yap; güncel DM kanalı DTO'su. */
  async acceptMessageRequest(userId: string, channelId: string) {
    const channel = await this.requirePendingRequestForRecipient(userId, channelId);
    await this.prisma.channel.update({
      where: { id: channelId },
      data: { dmRequestStatus: 'ACCEPTED' },
    });
    await this.notifications?.markMessageRequestActioned(userId, channelId);
    // C75 Rev.6 (c): diğer cihazlardaki istek push bildirimi kalksın.
    this.push?.notifyRead(userId, [channelId]).catch(() => {});
    const other = await this.prisma.user.findUnique({
      where: { id: channel.dmRequesterId! },
      select: { id: true, username: true, avatarUrl: true, avatarAnimatedUrl: true },
    });
    if (!other)
      throw new NotFoundException({ message: 'Kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });
    // C75 §2.6: gönderenin kilitli kutusu açılsın (yalnız durum senkronu; bildirim/push yok).
    this.realtime.emitToUser(channel.dmRequesterId!, 'dm.request_accepted', { channelId });
    // C75 §2.7: alıcının diğer cihazlarında istek ekrandan düşsün.
    this.realtime.emitToUser(userId, 'dm.request_resolved', { channelId, outcome: 'accepted' });
    return this.toDmChannelDto(channelId, other, userId);
  }

  /**
   * POST /dm/requests/:channelId/reject — kanalı soft-delete (mesajlar T&S kanıtı olarak kalır,
   * hiçbir yerde servis edilmez); block=true ise istek sahibini engelle (idempotent).
   */
  async rejectMessageRequest(userId: string, channelId: string, block: boolean) {
    const channel = await this.requirePendingRequestForRecipient(userId, channelId);
    const requesterId = channel.dmRequesterId!;
    await this.prisma.$transaction(async (tx) => {
      // C77 §1: istek kurulurken alıcıya bırakılan Welcome'lar da silinir (yoksa alıcının kuyruğunu kilitler).
      await softDeleteChannelInTx(tx, channelId);
      if (block) {
        await tx.userBlock.upsert({
          where: { blockerId_blockedId: { blockerId: userId, blockedId: requesterId } },
          create: { blockerId: userId, blockedId: requesterId },
          update: {},
        });
      }
    });
    await this.notifications?.markMessageRequestActioned(userId, channelId);
    this.push?.notifyRead(userId, [channelId]).catch(() => {});
    // C75 §2.7: alıcının diğer cihazlarında istek ekrandan düşsün (engelle dahil).
    this.realtime.emitToUser(userId, 'dm.request_resolved', { channelId, outcome: 'rejected' });
    return null;
  }

  /**
   * POST /dm/requests/:channelId/seen — C75 Rev.7: alıcı tek bir isteğin detayını açtı.
   *
   * 🔴 R7: `markRead` (lastReadAt) KULLANILMAZ. O yol C12 `dm:seen` yayınını tetikler; istek sahibi
   * "mesajımı açtı" bilgisini alırdı. Yabancının bunu öğrenmesi istek süzgecinin engellediği şey.
   * Burada yazılan `requestSeenAt` yalnız alıcının kendi istemcilerine döner.
   *
   * İdempotent: zaten görülmüşse damga değişmez (updateMany + null koşulu), olay/okundu yine gider
   * (diğer cihaz geride kalmışsa yakalasın).
   */
  async markMessageRequestSeen(userId: string, channelId: string) {
    await this.requirePendingRequestForRecipient(userId, channelId);
    await this.prisma.channelMember.updateMany({
      where: { channelId, userId, requestSeenAt: null },
      data: { requestSeenAt: new Date() },
    });
    await this.notifications?.markMessageRequestActioned(userId, channelId);
    this.realtime.emitToUser(userId, 'dm.request_seen', { channelId });
    this.push?.notifyRead(userId, [channelId]).catch(() => {});
    return null;
  }

  /**
   * POST /dm/requests/reject-batch — C75 Rev.7 "Tümünü reddet". Her kimlik tekil ret yolundan geçer
   * (aynı jenerik ret, aynı olay/bildirim kapatma; engelleme YOK). Bulunamayan ya da kullanıcının
   * olmayan istek sessizce atlanır: toplu işlemde bir öğe yüzünden hepsi düşmesin, varlık da sızmasın.
   */
  async rejectMessageRequestsBatch(userId: string, channelIds: string[]) {
    const rejected: string[] = [];
    for (const channelId of new Set(channelIds)) {
      try {
        await this.rejectMessageRequest(userId, channelId, false);
        rejected.push(channelId);
      } catch (e) {
        if (e instanceof NotFoundException || e instanceof ForbiddenException) continue;
        throw e;
      }
    }
    return { rejected };
  }
}
