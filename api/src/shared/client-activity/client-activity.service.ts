import { Injectable, Logger } from '@nestjs/common';
import { RealtimeService } from '../realtime/realtime.service';
import { classifyPushType } from './push-suppression';

export type ClientKind = 'web' | 'desktop' | 'mobile' | 'unknown';

interface ConnectionEntry {
  userId: string;
  client: ClientKind;
  active: boolean;
}

/** Handshake `auth.client` değerini tanınan türe çevirir; aksi `unknown`. */
export function parseClientKind(raw: unknown): ClientKind {
  return raw === 'web' || raw === 'desktop' || raw === 'mobile' ? raw : 'unknown';
}

/**
 * C76 §2.2 — bağlantı başına "bu istemcinin başında biri var mı" bilgisi (bellek içi, şema yok;
 * PresenceService ile aynı tek-instance ilkesi). PresenceService'ten BAĞIMSIZDIR: manuel
 * Rahatsız Etmeyin/Boşta seçimleri bu kuralı etkilemez. `unknown` bağlantı hiçbir sorguya katılmaz.
 */
@Injectable()
export class ClientActivityService {
  private readonly logger = new Logger(ClientActivityService.name);
  private readonly connections = new Map<string, ConnectionEntry>();
  private readonly warnedTypes = new Set<string>();

  constructor(private realtime: RealtimeService) {}

  /**
   * C76 Rev.1: web/desktop `active: false` başlar (tepsiye gizli açılan pencere aktif sayılmasın;
   * istemci bağlanınca gerçek değeri yollar). Mobil ön planda bağlanır → `active: true`.
   */
  register(connectionId: string, userId: string, client: ClientKind): void {
    const before = this.isMobileForeground(userId);
    this.connections.set(connectionId, { userId, client, active: client === 'mobile' });
    this.emitMobileTransition(userId, before);
  }

  unregister(connectionId: string): void {
    const entry = this.connections.get(connectionId);
    if (!entry) return;
    const before = this.isMobileForeground(entry.userId);
    this.connections.delete(connectionId);
    this.emitMobileTransition(entry.userId, before);
  }

  setActive(connectionId: string, active: boolean): void {
    const entry = this.connections.get(connectionId);
    if (!entry || entry.active === active) return;
    const before = this.isMobileForeground(entry.userId);
    entry.active = active;
    this.emitMobileTransition(entry.userId, before);
  }

  /** web/desktop türünde en az bir aktif bağlantı var mı. */
  isDesktopActive(userId: string): boolean {
    return this.anyActive(userId, (c) => c === 'web' || c === 'desktop');
  }

  /** mobile türünde en az bir aktif (ön plan) bağlantı var mı. */
  isMobileForeground(userId: string): boolean {
    return this.anyActive(userId, (c) => c === 'mobile');
  }

  /**
   * §2.3 — push alıcı süzgeci (tek yer). `type` = push `data.type`. Aktif masaüstü/web'i olan
   * VE telefonu ön planda olmayan alıcılar bastırılan türlerde çıkarılır (Rev.1); arama ve
   * E2EE_TRANSFER her zaman geçer.
   */
  filterPushRecipients(userIds: string[], type: string | undefined): string[] {
    const decision = classifyPushType(type);
    if (decision === 'unclassified' && type && !this.warnedTypes.has(type)) {
      this.warnedTypes.add(type);
      this.logger.warn(`Sınıflandırılmamış push türü '${type}': bastırılmıyor (push-suppression.ts)`);
    }
    if (decision !== 'suppress') return userIds;
    return userIds.filter((id) => !(this.isDesktopActive(id) && !this.isMobileForeground(id)));
  }

  private anyActive(userId: string, kind: (c: ClientKind) => boolean): boolean {
    for (const entry of this.connections.values()) {
      if (entry.userId === userId && entry.active && kind(entry.client)) return true;
    }
    return false;
  }

  private emitMobileTransition(userId: string, before: boolean): void {
    const after = this.isMobileForeground(userId);
    if (before !== after) {
      this.realtime.emitToUser(userId, 'client:mobile_foreground', { active: after });
    }
  }
}
