import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { verifyFrankingTag } from '../e2ee/e2ee-franking.util';
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
    return target.encrypted
      ? this.fromReporter(reporterId, target, evidence ?? [])
      : this.fromServer(target);
  }

  /** Şifresiz: hedef (silinmiş olsa da) + aynı kanalda ondan önceki 5 silinmemiş mesaj; sunucu kaydı. */
  private async fromServer(target: EvidenceMessage): Promise<EvidenceRow[]> {
    const context = await this.prisma.message.findMany({
      where: {
        channelId: target.channelId,
        deletedAt: null,
        encrypted: false,
        id: { not: target.id },
        createdAt: { lt: target.createdAt },
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
    reporterId: string,
    target: EvidenceMessage,
    items: ReportEvidenceItemDto[],
  ): Promise<EvidenceRow[]> {
    if (items.length === 0) return []; // kanıt iletilmedi: moderatör "kanıt iletilmedi" görür

    // Şikâyetçi bu kanalın üyesi olmalı (mevcut kapı: 403 NOT_CHANNEL_MEMBER)
    await this.membership.requireChannelAccess(reporterId, target.channelId);

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

    // Şikâyetçinin "sohbeti temizle" tarihinden önceki mesajlara erişimi yoktur
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: target.channelId, userId: reporterId } },
      select: { clearedAt: true },
    });

    return items.map((item) => {
      const msg = byId.get(item.messageId);
      if (
        !msg ||
        msg.channelId !== target.channelId ||
        !msg.encrypted ||
        (member?.clearedAt && msg.createdAt <= member.clearedAt)
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
