import { ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { verifyFrankingTag } from '../e2ee/e2ee-franking.util';
import { GroupVisibility, isHiddenBeforeJoin, toPeriods } from '../../common/utils/pre-join.util';
import { fromB64 } from '../e2ee/e2ee.util';
import { ReportEvidenceItemDto } from './dto/create-report.dto';

/** E4 §3.3: şikâyet edilen mesajın önündeki bağlam mesajı sayısı (sahip kararı 2026-11-11). */
const CONTEXT_MESSAGES = 5;

/** `ReportEvidence` satırı (reportId hariç; rapor oluşturulurken iç içe yazılır). */
export type EvidenceRow = Omit<Prisma.ReportEvidenceUncheckedCreateInput, 'reportId' | 'id'>;

const EVIDENCE_MESSAGE_SELECT = {
  id: true,
  channelId: true,
  authorId: true,
  content: true,
  encrypted: true,
  senderDeviceId: true,
  frankingTag: true,
  createdAt: true,
  // Ek = YALNIZ referans (id/tür/boyut/depolama anahtarı); dosya kopyalanmaz (§1.3)
  attachments: { select: { id: true, contentType: true, size: true, storageKey: true } },
} satisfies Prisma.MessageSelect;

type EvidenceMessage = Prisma.MessageGetPayload<{ select: typeof EVIDENCE_MESSAGE_SELECT }>;

/** Şikâyetçinin görme penceresi: `clearedAt` alt sınır; `leftAt` yalnız eski grup üyesinde üst sınır (aksi null). */
type EvidenceWindow = {
  clearedAt: Date | null;
  leftAt: Date | null;
  /** C65: yalnız önceki üyelik dönemi olan GROUP_DM üyesinde dolu (aksi null = bugünkü davranış). */
  visibility: GroupVisibility | null;
};

function invalidEvidence(message: string): HttpException {
  return new HttpException(
    { message, error: 'REPORT_EVIDENCE_INVALID' },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

/**
 * E4 — mesaj şikâyetinde kanıt (hedef + önceki 5 mesaj). 🔴 R7: şifreli sohbet içeriği yalnız
 * şikâyetçinin ilettiği kadarıyla ve parmak izi (franking) doğrulamasıyla sunucuya girer.
 */
@Injectable()
export class ReportEvidenceService {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
  ) {}

  /**
   * Hedef mesaj için kanıt satırlarını üretir. Hedef yoksa kanıt yok (şikâyet bugünkü gibi
   * referansla oluşur). Şifresiz hedefte `evidence` YOK SAYILIR.
   */
  async build(
    reporterId: string,
    targetMessageId: string,
    evidence: ReportEvidenceItemDto[] | undefined,
  ): Promise<EvidenceRow[]> {
    const target = await this.prisma.message.findUnique({
      where: { id: targetMessageId },
      select: EVIDENCE_MESSAGE_SELECT,
    });
    if (!target) return [];

    // Rev.1 §3.6: erişim kapısı HER mesaj şikâyetinde (şifreli/şifresiz). Tahmin edilen mesaj kimliğiyle
    // başkalarının özel yazışması kuyruğa taşınamaz. PENDING mesaj isteğinde alıcı da kanal üyesidir
    // (requireChannelAccess dmRequestStatus'a bakmaz), istek mesajını şikâyet edebilir.
    const window = await this.requireAccess(reporterId, target);

    return target.encrypted
      ? this.fromReporter(target, evidence ?? [], window)
      : this.fromServer(target, window);
  }

  /**
   * Şikâyetçi kanala erişebilmeli (mevcut kapı: 403) ve hedef, "sohbeti temizle" (`clearedAt`)
   * tarihinden sonra olmalı (aksi 422). Döner: şikâyetçinin görme penceresi.
   *
   * 🔴 R7 (C62 §2.3.c): `requireChannelAccess` NOT_CHANNEL_MEMBER verirse ve çağıranın grup DM ayrılma kaydı
   * varsa (eski üye; çıkarılan kişi çoğu zaman mağdurdur) pencere `leftAt`e kadar açılır: hedef ve kanıta girecek
   * her satır `createdAt <= leftAt` olmalı. Kaydı olmayan yabancı bugünkü 403'ü aynen alır; başka hatalar yayılır.
   */
  private async requireAccess(
    reporterId: string,
    target: EvidenceMessage,
  ): Promise<EvidenceWindow> {
    let clearedAt: Date | null;
    let leftAt: Date | null = null;
    let joinedAt: Date | null = null;
    let channelType: string | undefined;
    try {
      const channel = await this.membership.requireChannelAccess(reporterId, target.channelId);
      channelType = channel?.type;
      const member = await this.prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId: target.channelId, userId: reporterId } },
        select: { clearedAt: true, createdAt: true },
      });
      clearedAt = member?.clearedAt ?? null;
      joinedAt = member?.createdAt ?? null;
    } catch (err) {
      if (
        !(err instanceof ForbiddenException) ||
        (err.getResponse() as { error?: string }).error !== 'NOT_CHANNEL_MEMBER'
      ) {
        throw err;
      }
      try {
        const { channel, window } = await this.membership.requireGroupHistoryAccess(
          reporterId,
          target.channelId,
        );
        channelType = channel?.type;
        clearedAt = window.clearedAt;
        leftAt = window.leftAt;
        joinedAt = window.joinedAt;
      } catch {
        throw err;
      }
    }
    if ((clearedAt && target.createdAt <= clearedAt) || (leftAt && target.createdAt > leftAt)) {
      throw invalidEvidence('Şikâyet edilen mesaj erişilemiyor.');
    }
    // C65: önceki dönemi olan üyede dönemler arası (dışarıdayken atılmış) şifreli mesaj kanıta girmez.
    let visibility: GroupVisibility | null = null;
    if (channelType === 'GROUP_DM' && joinedAt) {
      const rows = await this.prisma.groupDmPastPeriod.findMany({
        where: { channelId: target.channelId, userId: reporterId },
        select: { joinedAt: true, leftAt: true },
      });
      if ((rows ?? []).length > 0) visibility = { joinedAt, periods: toPeriods(rows) };
    }
    if (target.encrypted && isHiddenBeforeJoin(target, visibility)) {
      throw invalidEvidence('Şikâyet edilen mesaj erişilemiyor.');
    }
    return { clearedAt, leftAt, visibility };
  }

  /** Şifresiz: hedef (silinmiş olsa da) + aynı kanalda ondan önceki 5 silinmemiş mesaj; sunucu kaydı. */
  private async fromServer(
    target: EvidenceMessage,
    { clearedAt, leftAt }: EvidenceWindow,
  ): Promise<EvidenceRow[]> {
    const context = await this.prisma.message.findMany({
      where: {
        channelId: target.channelId,
        deletedAt: null,
        encrypted: false,
        id: { not: target.id },
        // şikâyetçinin göremediği (temizlediği) mesaj bağlama girmez
        // eski üye: leftAt sonrası hiçbir satır bağlama girmez (hedef zaten <= leftAt; sınır savunma derinliği)
        createdAt: {
          lt: target.createdAt,
          ...(clearedAt ? { gt: clearedAt } : {}),
          ...(leftAt ? { lte: leftAt } : {}),
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: CONTEXT_MESSAGES,
      select: EVIDENCE_MESSAGE_SELECT,
    });
    return [
      this.row(target, target.content, 'server', true, true),
      ...context.map((m) => this.row(m, m.content, 'server', true, false)),
    ];
  }

  /**
   * Şifreli: şikâyetçinin ilettiği çözülmüş mesajlar. İçerik doğrulanamasa da saklanır
   * (`verified:false`); karar verirken buna göre tartılır. Kanal/üyelik ihlali → reddedilir.
   */
  private async fromReporter(
    target: EvidenceMessage,
    items: ReportEvidenceItemDto[],
    { clearedAt, leftAt, visibility }: EvidenceWindow,
  ): Promise<EvidenceRow[]> {
    if (items.length === 0) return []; // kanıt iletilmedi: moderatör "kanıt iletilmedi" görür

    const ids = items.map((i) => i.messageId);
    if (new Set(ids).size !== ids.length)
      throw invalidEvidence('Kanıt listesinde yinelenen mesaj var.');
    if (!ids.includes(target.id)) {
      throw invalidEvidence('Şikâyet edilen mesaj kanıt listesinde olmalı.');
    }

    const found = await this.prisma.message.findMany({
      where: { id: { in: ids } },
      select: EVIDENCE_MESSAGE_SELECT,
    });
    const byId = new Map(found.map((m) => [m.id, m]));

    return items.map((item) => {
      const msg = byId.get(item.messageId);
      if (
        !msg ||
        msg.channelId !== target.channelId ||
        !msg.encrypted ||
        (clearedAt && msg.createdAt <= clearedAt) ||
        (leftAt && msg.createdAt > leftAt) ||
        isHiddenBeforeJoin(msg, visibility)
      ) {
        throw invalidEvidence('Kanıt mesajlarından biri bu sohbete ait değil ya da erişilemiyor.');
      }
      return this.row(
        msg,
        item.body,
        'reporter',
        this.isAuthentic(msg, item),
        msg.id === target.id,
      );
    });
  }

  /**
   * HMAC(fk, canon) kayıtlı `frankingTag` ile eşleşiyor mu. `canon` içindeki `senderDeviceId`
   * SUNUCU kaydındaki değerdir (şikâyetçinin beyanı değil); kanal da sunucu kaydından.
   * `fk`, tag ya da gönderen cihaz yoksa (v1 mesaj) doğrulanamaz → false.
   */
  private isAuthentic(msg: EvidenceMessage, item: ReportEvidenceItemDto): boolean {
    if (!item.fk || !msg.frankingTag || !msg.senderDeviceId) return false;
    return verifyFrankingTag(fromB64(item.fk), msg.frankingTag, {
      channelId: msg.channelId,
      senderDeviceId: msg.senderDeviceId,
      body: item.body,
      sentAt: item.sentAt,
    });
  }

  private row(
    msg: EvidenceMessage,
    content: string,
    source: 'server' | 'reporter',
    verified: boolean,
    isTarget: boolean,
  ): EvidenceRow {
    return {
      messageId: msg.id,
      authorId: msg.authorId,
      channelId: msg.channelId,
      content,
      attachments: msg.attachments,
      messageAt: msg.createdAt,
      source,
      verified,
      isTarget,
    };
  }
}
