import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type PresenceStatus = 'online' | 'away' | 'dnd' | 'offline';
export type ActiveStatus = 'online' | 'away' | 'dnd';

interface PresenceEntry {
  connectionCount: number;
  status: ActiveStatus;
}

/**
 * 🫀 Presence Görünürlük Karar Fonksiyonu — T&S karar yüzeyi (Sprint 6.2, R7).
 *
 * Bellek-içi presence (V1 tek-instance, PM kararı 2026-06-13). Şema/migration YOK.
 * Socket.IO Redis adapter yayını instance'lar arası dağıtır; çok-instance'a geçilince
 * yalnız connectionCount Redis'e taşınır (gelecek borç, over-engineering yapma).
 *
 * canSeePresence kural sırası (fail-closed — R7 insan incelemesi zorunlu):
 *  1. viewerId === targetId → true (kendi durumunu görür)
 *  2. UserBlock (her iki yön) → false (engel arkadaşlıktan önce gelir — T&S sertleştirme)
 *  3. Karşılıklı arkadaş (ACCEPTED) → true
 *  4. target isMinor=true → false (minör yalnız arkadaşa görünür; buraya geldiyse arkadaş değil)
 *  5. target yetişkin + ortak guild → true
 *  6. Aksi → false
 *
 * NOT: Kural 2 (engel → false) contract'ta açıkça yazılmamıştı; T&S sertleştirmesi
 * olarak eklendi (görevde: "engelli taraf presence göremez — T&S sertleştirme").
 * PM R7 incelemesinde bu sapma notunu oku.
 */
@Injectable()
export class PresenceService {
  /** Yalnız bağlı kullanıcılar; bağlantısı olmayanlar map'te bulunmaz. */
  private readonly state = new Map<string, PresenceEntry>();

  constructor(private prisma: PrismaService) {}

  // ── Bellek-içi durum yönetimi ───────────────────────────────────────────────

  /**
   * Bağlantı ekle. İlk bağlantıda status=online; count döner (bilgi amaçlı).
   * Dönüş: etkin presence durumu.
   */
  connect(userId: string): ActiveStatus {
    const entry = this.state.get(userId);
    if (entry) {
      entry.connectionCount++;
      return entry.status;
    }
    this.state.set(userId, { connectionCount: 1, status: 'online' });
    return 'online';
  }

  /**
   * Bağlantı kapat. Dönüş: artık tamamen offline mi (true = son bağlantı kapandı).
   */
  disconnect(userId: string): boolean {
    const entry = this.state.get(userId);
    if (!entry) return false;
    entry.connectionCount--;
    if (entry.connectionCount <= 0) {
      this.state.delete(userId);
      return true;
    }
    return false;
  }

  /**
   * Durum güncelle — yalnız bağlıyken (count > 0) işlev yapar.
   * Dönüş: uygulanan durum (bağlı değilse 'offline' döner, güncelleme olmaz).
   */
  setStatus(userId: string, status: ActiveStatus): PresenceStatus {
    const entry = this.state.get(userId);
    if (!entry) return 'offline';
    entry.status = status;
    return status;
  }

  /** Anlık durum. Bağlantısı yoksa 'offline'. */
  getStatus(userId: string): PresenceStatus {
    const entry = this.state.get(userId);
    return entry ? entry.status : 'offline';
  }

  // ── T&S karar fonksiyonları (R7) ───────────────────────────────────────────

  /**
   * Bir kullanıcının başka bir kullanıcının presence'ını görüp göremeyeceğini belirler.
   * Fail-closed: ilişki belirsizse false döner.
   *
   * Bu fonksiyon R7 kapsamındadır — satır-satır insan incelemesi zorunlu.
   */
  async canSeePresence(viewerId: string, targetId: string): Promise<boolean> {
    // Kural 1: kendini her zaman görür
    if (viewerId === targetId) return true;

    // Kural 2: engel (her iki yön) — T&S sertleştirme, arkadaşlıktan önce
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: targetId },
          { blockerId: targetId, blockedId: viewerId },
        ],
      },
      select: { id: true },
    });
    if (block) return false;

    // Kural 3: karşılıklı arkadaş (ACCEPTED)
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: viewerId, addresseeId: targetId },
          { requesterId: targetId, addresseeId: viewerId },
        ],
      },
      select: { id: true },
    });
    if (friendship) return true;

    // Kural 4: target minör → false (minör yalnız arkadaşa görünür; buraya geldiyse arkadaş değil)
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { isMinor: true },
    });
    if (!target) return false; // silinmiş/yok → fail-closed
    if (target.isMinor) return false;

    // Kural 5: target yetişkin + ortak guild
    const sharedGuild = await this.prisma.guildMember.findFirst({
      where: {
        userId: viewerId,
        guild: {
          deletedAt: null,
          members: { some: { userId: targetId } },
        },
      },
      select: { id: true },
    });
    if (sharedGuild) return true;

    // Kural 6: fail-closed
    return false;
  }

  /**
   * userId'nin arkadaşları ∪ ortak-guild üyeleri — presence görünürlük
   * kararları için aday havuzu. userId'nin kendisi dahil değil.
   *
   * Bu havuz yön-bağımsızdır: hem "userId'yi görebilecekler" hem de
   * "userId'nin görebileceği kişiler" için filtreleme tabanı sağlar.
   */
  private async candidatePool(userId: string): Promise<Set<string>> {
    // Aday küme 1: kabul edilmiş arkadaşlar
    const friendships = await this.prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      select: { requesterId: true, addresseeId: true },
    });
    const friendIds = friendships.map((f) =>
      f.requesterId === userId ? f.addresseeId : f.requesterId,
    );

    // Aday küme 2: ortak guild üyeleri
    const guilds = await this.prisma.guildMember.findMany({
      where: { userId, guild: { deletedAt: null } },
      select: { guildId: true },
    });
    const guildIds = guilds.map((g) => g.guildId);

    let sharedGuildMemberIds: string[] = [];
    if (guildIds.length > 0) {
      const members = await this.prisma.guildMember.findMany({
        where: { guildId: { in: guildIds }, userId: { not: userId } },
        select: { userId: true },
      });
      sharedGuildMemberIds = members.map((m) => m.userId);
    }

    // Birleştir + dedup; userId'nin kendisi dışarıda
    const pool = new Set([...friendIds, ...sharedGuildMemberIds]);
    pool.delete(userId);
    return pool;
  }

  /**
   * userId'nin presence'ını GÖRMEYE İZİNLİ kullanıcı id listesi döner.
   * Aday küme = candidatePool(userId);
   * her aday için canSeePresence(aday, userId) filtresi uygulanır.
   *
   * audienceFor ve canSeePresence aynı kuralın iki yönüdür — canSeePresence
   * tek-kaynak olarak korunur (DRY).
   */
  async audienceFor(userId: string): Promise<string[]> {
    const candidateSet = await this.candidatePool(userId);

    // canSeePresence filtresi (tek-kaynak kural uygulaması)
    const results = await Promise.all(
      [...candidateSet].map(async (candidateId) => {
        const allowed = await this.canSeePresence(candidateId, userId);
        return allowed ? candidateId : null;
      }),
    );

    return results.filter((id): id is string => id !== null);
  }

  /**
   * viewerId'nin GÖREBILDIĞI online kullanıcıların durum listesini döner.
   * Snapshot üretimi için doğru kaynak (ters yön: canSeePresence(viewerId, aday)).
   *
   * Dönen dizi yalnız aktif (online/away/dnd) kullanıcıları içerir.
   */
  async visibleOnlineFor(
    viewerId: string,
  ): Promise<Array<{ userId: string; status: ActiveStatus }>> {
    const candidateSet = await this.candidatePool(viewerId);

    const results = await Promise.all(
      [...candidateSet].map(async (candidateId) => {
        const candidateStatus = this.getStatus(candidateId);
        if (candidateStatus === 'offline') return null;

        const canSee = await this.canSeePresence(viewerId, candidateId);
        if (!canSee) return null;

        return { userId: candidateId, status: candidateStatus };
      }),
    );

    return results.filter(
      (entry): entry is { userId: string; status: ActiveStatus } => entry !== null,
    );
  }
}
