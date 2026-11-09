import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PushService } from '../push/push.service';

/**
 * 1-1 DM arama sinyalleri: kabul / reddet / iptal. WS (`voice:call_*`) ve HTTP (`POST /voice/calls/:id/reject`)
 * AYNI fonksiyonu çağırır; yetki kapısı (`otherDmMember`) tek yerde yaşar (C53 §2.3, R7).
 *
 * R7 kapısı: çağıran kanalın ÜYESİ değilse karşı taraf bulunamaz (null) → olay YAYILMAZ, push gitmez.
 * Tek sorgu hem üyeliği doğrular hem karşı tarafı bulur.
 */
@Injectable()
export class CallSignalService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
    private push: PushService,
  ) {}

  // R7 (DM-1): çağıran kanalın üyesi DEĞİLSE null → sahte accept/reject/cancel relay'i engellenir.
  async otherDmMember(channelId: string, userId: string): Promise<string | null> {
    const members = await this.prisma.channelMember.findMany({
      where: { channelId },
      select: { userId: true },
    });
    if (!members.some((m) => m.userId === userId)) return null; // çağıran üye değil
    const other = members.find((m) => m.userId !== userId);
    return other?.userId ?? null;
  }

  /** Arayana `voice.call_accepted`; callee'nin diğer cihazlarının zili susar. Dönüş: olay yayıldı mı. */
  async accept(channelId: string, userId: string): Promise<boolean> {
    const other = await this.otherDmMember(channelId, userId);
    if (!other) return false;
    this.realtime.emitToUser(other, 'voice.call_accepted', { channelId });
    void this.push.sendCallEnd(userId, channelId);
    return true;
  }

  /** Arayana `voice.call_rejected`; callee'nin diğer cihazlarının zili susar. Dönüş: olay yayıldı mı. */
  async reject(channelId: string, userId: string): Promise<boolean> {
    const other = await this.otherDmMember(channelId, userId);
    if (!other) return false;
    this.realtime.emitToUser(other, 'voice.call_rejected', { channelId });
    void this.push.sendCallEnd(userId, channelId);
    return true;
  }

  /** Callee'ye `voice.call_canceled`; kapalı uygulamadaki zili `call_end` push'u susturur. */
  async cancel(channelId: string, userId: string): Promise<boolean> {
    const other = await this.otherDmMember(channelId, userId);
    if (!other) return false;
    this.realtime.emitToUser(other, 'voice.call_canceled', { channelId });
    void this.push.sendCallEnd(other, channelId);
    return true;
  }
}
