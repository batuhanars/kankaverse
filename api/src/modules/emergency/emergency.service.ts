import { Injectable, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { VoiceService } from '../voice/voice.service';

/**
 * A4 — Acil Yardım / Çıkış Butonu (Panik). Sözleşme: contracts/SPRINT_A4_EMERGENCY_CONTRACT.md
 *
 * T&S karar fonksiyonu (R7). Kilitli sınırlar:
 *  - Her kullanıcı tetikleyebilir; minöre özel değil (snapshot isMinor taşır → triyaj önceliği).
 *  - Anında-çek: aktif ses oturumundan LiveKit removeParticipant (best-effort, rapordan BAĞIMSIZ).
 *  - Platform eskalasyonu: alarm yalnız isModerator (platform güvenliği) kullanıcılara gider.
 *    Yerel sunucu mod'u/operatörü bu raporu GÖRMEZ (moderasyon kuyruğu platform-isModerator-gated;
 *    guild-scoped rapor görünümü YOK) — istismarcı=operatör senaryosu yapısal kapalı.
 *  - Snapshot METADATA-only (kanal/katılımcı/yayıncı/zaman). İçerik/canlı-AV YAKALANMAZ (A2 hukuk-gated değil).
 */
@Injectable()
export class EmergencyService {
  constructor(
    private prisma: PrismaService,
    private voice: VoiceService,
    private realtime: RealtimeService,
  ) {}

  async trigger(presserId: string, channelId?: string): Promise<{ acknowledged: true; reportId: string }> {
    const presser = await this.prisma.user.findUnique({
      where: { id: presserId },
      select: { isMinor: true },
    });
    const isMinor = presser?.isMinor ?? false;
    const triggeredAt = new Date().toISOString();

    // 1) Aktif ses kanalını çöz: önce istemcinin verdiği channelId (gerçekten içindeyse), yoksa aktif VoiceSession.
    let activeChannelId: string | null = null;
    if (channelId) {
      const inGiven = await this.prisma.voiceSession.findFirst({
        where: { channelId, userId: presserId, leftAt: null },
        select: { id: true },
      });
      if (inGiven) activeChannelId = channelId;
    }
    if (!activeChannelId) {
      const active = await this.prisma.voiceSession.findFirst({
        where: { userId: presserId, leftAt: null },
        orderBy: { joinedAt: 'desc' },
        select: { channelId: true },
      });
      if (active) activeChannelId = active.channelId;
    }

    // 2) Bağlam (metadata-only) + rapor hedefi.
    let targetType: 'USER' | 'CHANNEL' = 'USER';
    let targetId = presserId;
    let guildId: string | null = null;
    let snapshot: Prisma.InputJsonObject = { presserId, isMinor, triggeredAt };

    if (activeChannelId) {
      const channel = await this.prisma.channel.findUnique({
        where: { id: activeChannelId },
        select: { name: true, guildId: true },
      });
      const ctx = await this.voice.captureVoiceContext(activeChannelId);
      guildId = channel?.guildId ?? null;
      targetType = 'CHANNEL';
      targetId = activeChannelId;
      snapshot = {
        presserId,
        isMinor,
        triggeredAt,
        channelId: activeChannelId,
        channelName: channel?.name ?? null,
        guildId,
        participants: ctx.participants,
        broadcasters: ctx.broadcasters,
      };
    }

    // 3) Rapor (HER ZAMAN — pull'dan bağımsız). priority 100 → kuyruğun en üstü. İçerik yok.
    const report = await this.prisma.report.create({
      data: {
        reporterId: presserId,
        reason: 'EMERGENCY',
        targetType,
        targetId,
        status: 'OPEN',
        priority: 100,
        contextSnapshot: snapshot,
      },
      select: { id: true },
    });

    // 4) Anında-çek (best-effort; rapor zaten oluştu). İstemci de lokal olarak görüşmeden ayrılır.
    if (activeChannelId) {
      await this.voice.pullSelfFromVoice(activeChannelId, presserId);
      this.realtime.emitToUser(presserId, 'emergency.pulled', { channelId: activeChannelId });
    }

    // 5) AuditLog.
    await this.prisma.auditLog.create({
      data: {
        actorId: presserId,
        action: 'emergency.triggered',
        entityType: activeChannelId ? 'channel' : 'user',
        entityId: targetId,
        metadata: { guildId, isMinor, reportId: report.id },
      },
    });

    // 6) Platform alarmı — yalnız isModerator (yerel mod BAYPAS). Anlık WS.
    const mods = await this.prisma.user.findMany({
      where: { isModerator: true, deletedAt: null },
      select: { id: true },
    });
    this.realtime.emitToUsers(
      mods.map((m) => m.id),
      'emergency.alert',
      { reportId: report.id, channelId: activeChannelId, guildId, isMinor, triggeredAt },
    );

    // Mağdura minimal yanıt + kendi raporunun id'si (gönüllü beyan için). Başka bağlam echo edilmez.
    return { acknowledged: true, reportId: report.id };
  }

  /**
   * B1b — Gönüllü beyan: mağdur kendi EMERGENCY raporuna metin açıklama ekler/günceller.
   * YALNIZ kendi raporu + reason EMERGENCY (yoksa jenerik 403 — varlık sızdırma yok).
   * Mağdurun kendi rızasıyla yazdığı beyan → A2 sessiz-içerik gating'ine GİRMEZ (gönüllü, kendi koruması).
   * Canlı ses "ifade alma" reddedildi — beyan yalnız metin, mağdurun temposunda.
   */
  async addStatement(userId: string, reportId: string, description: string): Promise<{ acknowledged: true }> {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: { reporterId: true, reason: true },
    });
    if (!report || report.reporterId !== userId || report.reason !== 'EMERGENCY') {
      throw new ForbiddenException({ message: 'Bu işlem için yetkin yok.', error: 'FORBIDDEN' });
    }

    await this.prisma.report.update({
      where: { id: reportId },
      data: { description: description.trim().slice(0, 2000) },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'emergency.statement_added',
        entityType: 'report',
        entityId: reportId,
        metadata: {},
      },
    });

    return { acknowledged: true };
  }
}
