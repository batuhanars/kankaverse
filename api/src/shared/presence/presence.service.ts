import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { GamesService, ResolvedGame } from '../games/games.service';

export type PresenceStatus = 'online' | 'away' | 'dnd' | 'offline';
export type ActiveStatus = 'online' | 'away' | 'dnd';
/**
 * Bir BAĞLANTININ kendi başına söyleyebileceği tek şey: bu pencerenin başında biri var mı.
 * `dnd` bilinçli olarak yok — o bir tercih, pencerenin değil hesabın niteliği (bkz. PresenceEntry).
 */
export type ConnectionStatus = 'online' | 'away';

interface PresenceEntry {
  /**
   * Kullanıcının BİLEREK seçtiği durum (UserCard). Hesap kapsamlıdır: hangi pencereden seçilirse
   * seçilsin hepsi için geçerlidir ve hareketsizlik onu EZEMEZ.
   */
  manual: ActiveStatus;
  /** connectionId (socket.id) → o bağlantının hareketsizlik durumu. Boşalınca kayıt silinir. */
  connections: Map<string, ConnectionStatus>;
  /**
   * C31b §2.3 — connectionId → o bağlantının bildirdiği `Game.id`. Hesabın etkin oyunu EN SON set
   * edilen bağlantınınki (set'te önce silinip sonra yazılır, Map ekleme sırası = güncellik sırası).
   * Bağlantı düşünce kaydı silinir. Şema yok (presence ile aynı ilke).
   * C31e: `startedAt` (epoch ms) oyun DEĞİŞİNCE yenilenir, aynı oyun tekrar set edilince korunur.
   */
  games: Map<string, { gameId: string; startedAt: number }>;
}

/**
 * 🫀 Presence Görünürlük Karar Fonksiyonu — T&S karar yüzeyi (Sprint 6.2, R7).
 *
 * Bellek-içi presence (V1 tek-instance, PM kararı 2026-06-13). Şema/migration YOK.
 * Socket.IO Redis adapter yayını instance'lar arası dağıtır; çok-instance'a geçilince
 * yalnız bağlantı kayıtları (`PresenceEntry`) Redis'e taşınır (gelecek borç, over-engineering yapma).
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
  private readonly logger = new Logger(PresenceService.name);

  /** Yalnız bağlı kullanıcılar; bağlantısı olmayanlar map'te bulunmaz. */
  private readonly state = new Map<string, PresenceEntry>();

  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
    private games: GamesService,
  ) {
    // C31c: simge sonradan yazılınca oynayanlara güncel oyun nesnesi aynı kitleye yeniden yayılır
    // (kitle kuralı değişmez, `broadcastActivity` aynı süzgeçten geçer).
    this.games.onIconReady?.((gameId) => void this.rebroadcastGame(gameId));
  }

  private async rebroadcastGame(gameId: string): Promise<void> {
    for (const userId of [...this.state.keys()]) {
      if (this.activeGameId(userId) === gameId) await this.broadcastActivity(userId);
    }
  }

  // ── Bellek-içi durum yönetimi ───────────────────────────────────────────────

  /**
   * 🔴 Kusur düzeltmesi (sahip bulgusu 2026-08-12, cihaz turu): durum ÖNCEDEN hesap başına TEK bir
   * alandı (`{ connectionCount, status }`). Bir hesabın kaç penceresi varsa hepsi o tek alanı
   * paylaşıyordu ve son yazan kazanıyordu — sistem tepsisinde unutulmuş bir masaüstü penceresi
   * 5 dakika sonra "boşta" yazınca, kullanıcı başka bir pencerede aktif yazışıyor olsa bile
   * herkese boşta görünüyordu. Öndeki pencere bunu düzeltemiyordu: web yalnız "boşta → aktif"
   * GEÇİŞİNDE haber veriyor, hiç boşta olmamış bir pencerede o geçiş hiç yaşanmıyor. Kullanıcının
   * kendi ekranı da yalan söylüyordu (kendi durumu sunucudan gelmiyor, istemci belleğinden okunuyor).
   *
   * Doğru model iki katmanlı ve ayrımın kendisi çözüm:
   *  - `manual` (hesap): bilinçli seçim. Hareketsizlik bunu EZEMEZ — "rahatsız etmeyin" diyen biri
   *    başka bir pencerede fare oynattı diye müsait sayılamaz.
   *  - `connections` (bağlantı başına): yalnız "bu pencerenin başında biri var mı". Hesap, HERHANGİ
   *    bir penceresi aktifse aktiftir. Tepsideki pencere boşta desin, elindeki telefon aktifse
   *    kullanıcı oradadır.
   *
   * Dönüş: hesabın ETKİN durumu.
   */
  connect(userId: string, connectionId: string): ActiveStatus {
    const entry = this.state.get(userId);
    if (entry) {
      entry.connections.set(connectionId, 'online');
      return this.effective(entry);
    }
    const fresh: PresenceEntry = {
      manual: 'online',
      connections: new Map([[connectionId, 'online']]),
      games: new Map(),
    };
    this.state.set(userId, fresh);
    return this.effective(fresh);
  }

  /**
   * Bağlantı kapat. Dönüş: artık tamamen offline mi (true = son bağlantı kapandı).
   *
   * Kayıt son bağlantıyla birlikte SİLİNİR, yani `manual` seçimi de sıfırlanır — bu davranış
   * eskisiyle aynı (bellek-içi presence oturum boyu yaşamıyor); istemci yeniden bağlanınca
   * manuel seçimini geri uyguluyor (`useSocket.ts` connect kancası).
   */
  disconnect(userId: string, connectionId: string): boolean {
    const entry = this.state.get(userId);
    if (!entry) return false;
    // C31f: kopan bağlantının oyunu "son oynanan" olarak yazılır (dnd'de yazılmaz, bkz. recordRecentGame).
    const ended = entry.games.get(connectionId);
    if (ended) this.recordRecentGame(userId, ended.gameId, this.effective(entry));
    entry.connections.delete(connectionId);
    entry.games.delete(connectionId);
    if (entry.connections.size === 0) {
      this.state.delete(userId);
      return true;
    }
    return false;
  }

  /**
   * Durum güncelle — yalnız bağlıyken işlev yapar.
   * Dönüş: uygulanan ETKİN durum (bağlı değilse 'offline' döner, güncelleme olmaz).
   *
   * `auto: true` → hareketsizlik otomasyonu: yalnız İLGİLİ BAĞLANTIYI etkiler, hesabın manuel
   * seçimine dokunmaz. `auto` verilmezse seçim MANUELDİR (hesap kapsamlı) — eski istemciler bu
   * alanı hiç göndermiyor, onlar için davranış bugünküyle aynı kalır (geriye dönük uyum).
   */
  setStatus(
    userId: string,
    status: ActiveStatus,
    opts?: { connectionId?: string; auto?: boolean },
  ): PresenceStatus {
    const entry = this.state.get(userId);
    if (!entry) return 'offline';

    if (opts?.auto) {
      // 'dnd' bir bağlantının söyleyebileceği şey değil; otomasyon yalnız aktiflik bildirir.
      if (status === 'dnd') return this.effective(entry);
      const connectionId = opts.connectionId;
      if (connectionId && entry.connections.has(connectionId)) {
        entry.connections.set(connectionId, status);
      }
      return this.effective(entry);
    }

    entry.manual = status;
    // Manuel "çevrimiçi" seçimi o pencerenin bayat 'away' işaretini de temizler: kullanıcı
    // kutucuğa dokunacak kadar oradaysa o pencere hareketsiz değildir.
    if (status === 'online' && opts?.connectionId && entry.connections.has(opts.connectionId)) {
      entry.connections.set(opts.connectionId, 'online');
    }
    return this.effective(entry);
  }

  /**
   * C31b — bağlantının oyununu kaydet/sil (`null`). Bağlantı kayıtlı değilse false (yok sayılır).
   * Görünürlük BURADA değil: kayıt yalnız bellektir, kimin göreceği `canSeeActivity`'de.
   */
  setGame(userId: string, connectionId: string, gameId: string | null): boolean {
    const entry = this.state.get(userId);
    if (!entry || !entry.connections.has(connectionId)) return false;
    const previous = entry.games.get(connectionId);
    // C31f: biten ya da DEĞİŞEN oyun "son oynanan" olarak yazılır; aynı oyunun yeniden bildirimi yazılmaz.
    if (previous && previous.gameId !== gameId) {
      this.recordRecentGame(userId, previous.gameId, this.effective(entry));
    }
    entry.games.delete(connectionId);
    if (gameId) {
      const startedAt = previous?.gameId === gameId ? previous.startedAt : Date.now();
      entry.games.set(connectionId, { gameId, startedAt });
    }
    return true;
  }

  /**
   * C31f (R7/KVKK) — bir oyunun SON OYNANMA anını kalıcı yazar. Fire-and-forget: presence akışını
   * bloklamaz, hata yutulur ve loglanır. Yazım şartları sunucu otoritesidir, istemci değeri sayılmaz:
   *  - kullanıcı minör DEĞİL, `showRecentActivity` açık ve oyun paylaşımı etkin (`showGameActivity ?? !isMinor`)
   *  - anlık durum `dnd` DEĞİL (rahatsız etmeyin diyen oyununu hiçbir yoldan yaymaz, §2.5 ile tutarlı)
   * Biri yanlışsa HİÇ yazılmaz. Süre/oturum tutulmaz: (userId, gameId) başına tek satır, yalnız zaman damgası.
   */
  private recordRecentGame(userId: string, gameId: string, status: ActiveStatus): void {
    if (status === 'dnd') return;
    void this.writeRecentGame(userId, gameId).catch((err: unknown) =>
      this.logger.warn(`Son etkinlik yazılamadı (${userId}): ${(err as Error).message}`),
    );
  }

  private async writeRecentGame(userId: string, gameId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isMinor: true, showRecentActivity: true, showGameActivity: true },
    });
    if (!user || user.isMinor || !user.showRecentActivity) return;
    if (!(user.showGameActivity ?? !user.isMinor)) return;
    const lastPlayedAt = new Date();
    await this.prisma.recentGame.upsert({
      where: { userId_gameId: { userId, gameId } },
      create: { userId, gameId, lastPlayedAt },
      update: { lastPlayedAt },
    });
  }

  /** Ayar kapatılınca bütün bağlantıların oyun kaydı silinir (yeniden açınca bayat oyun sızmasın). */
  clearGames(userId: string): void {
    this.state.get(userId)?.games.clear();
  }

  /**
   * Hesabın etkin oyun kimliği: en son set edilen bağlantınınki. `dnd`'de ve çevrimdışıyken null
   * (§2.5: rahatsız etmeyin diyen oyununu da yaymaz).
   */
  activeGameId(userId: string): string | null {
    return this.activeGame(userId)?.gameId ?? null;
  }

  /** C31e: etkin oyunun kimliği + başlangıç zamanı (epoch ms). */
  private activeGame(userId: string): { gameId: string; startedAt: number } | null {
    const entry = this.state.get(userId);
    if (!entry || this.effective(entry) === 'dnd') return null;
    let latest: { gameId: string; startedAt: number } | null = null;
    for (const game of entry.games.values()) latest = game;
    return latest;
  }

  /**
   * Hesabın etkin durumu: bilinçli seçim varsa o, yoksa "herhangi bir pencere aktif mi".
   * Tek karar noktası — connect/setStatus/getStatus üçü de buradan geçiyor.
   */
  private effective(entry: PresenceEntry): ActiveStatus {
    if (entry.manual !== 'online') return entry.manual;
    for (const connectionStatus of entry.connections.values()) {
      if (connectionStatus === 'online') return 'online';
    }
    return 'away';
  }

  /** Anlık durum. Bağlantısı yoksa 'offline'. */
  getStatus(userId: string): PresenceStatus {
    const entry = this.state.get(userId);
    return entry ? this.effective(entry) : 'offline';
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

  // ── C31b §2.5 — oyun etkinliği görünürlüğü (R7) ────────────────────────────

  /** Hedefin oyun paylaşım ayarı ve yaşı. Kayıt yoksa null (fail-closed). */
  private async activityGate(
    targetId: string,
  ): Promise<{ enabled: boolean; isMinor: boolean } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { isMinor: true, showGameActivity: true },
    });
    if (!user) return null;
    // null = yaşa göre varsayılan: yetişkin açık, minör kapalı (sözleşme §0).
    return { enabled: user.showGameActivity ?? !user.isMinor, isMinor: user.isMinor };
  }

  /** Etkin "oyunumu göster" ayarı (sunucu otoritesi: istemci değeri hiçbir yerde güvenilmez). */
  async gameActivityEnabled(userId: string): Promise<boolean> {
    const gate = await this.activityGate(userId);
    return gate?.enabled ?? false;
  }

  private async areFriends(a: string, b: string): Promise<boolean> {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: a, addresseeId: b },
          { requesterId: b, addresseeId: a },
        ],
      },
      select: { id: true },
    });
    return friendship !== null;
  }

  /**
   * `canSeePresence`'ın ÜZERİNE binen ek şartlar (presence kuralı çağıran tarafta zaten geçti):
   *  a. viewer === target → true (kendi oyununu görür; ayar kapalıysa zaten kaydedilmez/yayılmaz)
   *  b. hedefin etkin ayarı kapalı → false
   *  c. hedef minör → yalnız karşılıklı kanka (canSeePresence kural 3-4 ile örtüşür; savunma derinliği)
   */
  private async activityConditions(viewerId: string, targetId: string): Promise<boolean> {
    if (viewerId === targetId) return true;
    const gate = await this.activityGate(targetId);
    if (!gate || !gate.enabled) return false;
    if (gate.isMinor) return this.areFriends(viewerId, targetId);
    return true;
  }

  /**
   * canSeeActivity(viewer, target) = canSeePresence(viewer, target) && etkinAyar(target)
   *   && (target.isMinor ? karşılıklıKanka : true)
   *
   * Yeni bir görünürlük kuralı DEĞİL: presence kuralının (engel, kanka, minör, ortak ortam) tamamı
   * `canSeePresence`'tan aynen geçer, buraya yalnız ek şartlar gelir. Fail-closed.
   * `dnd`/çevrimdışı hâli bellek tarafında (`activeGameId`) ele alınır, ilişki kuralı değildir.
   */
  async canSeeActivity(viewerId: string, targetId: string): Promise<boolean> {
    if (!(await this.canSeePresence(viewerId, targetId))) return false;
    return this.activityConditions(viewerId, targetId);
  }

  /**
   * userId'nin OYUNUNU görmeye izinli kullanıcılar: presence kitlesi (`audienceFor` → canSeePresence)
   * ∩ ek şartlar. Aynı kuralın kitle yönüdür; ayar ve yaş hedefe ait olduğundan bir kez okunur.
   */
  async activityAudienceFor(userId: string): Promise<string[]> {
    const gate = await this.activityGate(userId);
    if (!gate || !gate.enabled) return [];
    const audience = await this.audienceFor(userId);
    if (!gate.isMinor) return audience;
    const friendFlags = await Promise.all(audience.map((id) => this.areFriends(id, userId)));
    return audience.filter((_, i) => friendFlags[i]);
  }

  /** Şu an yayılabilir oyun: dnd/çevrimdışı/ayar kapalı/gizli oyun → null. */
  async currentGameFor(userId: string): Promise<(ResolvedGame & { startedAt: string }) | null> {
    const active = this.activeGame(userId);
    if (!active) return null;
    const gate = await this.activityGate(userId);
    if (!gate || !gate.enabled) return null;
    const game = await this.games.visibleById(active.gameId);
    return game ? { ...game, startedAt: new Date(active.startedAt).toISOString() } : null;
  }

  /**
   * `activity:update { userId, game }` yayını. Oyun VARSA yalnız `activityAudienceFor` kitlesine
   * (+ kullanıcının kendi pencerelerine); oyun YOKSA (kapatıldı, ayar kapandı, dnd, bağlantı koptu)
   * daha geniş presence kitlesine gider: "oyun yok" bilgisi bir şey ifşa etmez, bayat satırı
   * ise herkesten temizler.
   */
  async broadcastActivity(userId: string): Promise<void> {
    const game = await this.currentGameFor(userId);
    const audience = game ? await this.activityAudienceFor(userId) : await this.audienceFor(userId);
    for (const recipientId of [...audience, userId]) {
      this.realtime.emitToUser(recipientId, 'activity:update', { userId, game });
    }
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
  async visibleOnlineFor(viewerId: string): Promise<
    Array<{
      userId: string;
      status: ActiveStatus;
      gameId?: string;
      gameName?: string;
      gameIconUrl?: string | null;
      gameStartedAt?: string;
      gameStoreUrl?: string | null;
    }>
  > {
    const candidateSet = await this.candidatePool(viewerId);

    const results = await Promise.all(
      [...candidateSet].map(async (candidateId) => {
        const candidateStatus = this.getStatus(candidateId);
        if (candidateStatus === 'offline') return null;

        const canSee = await this.canSeePresence(viewerId, candidateId);
        if (!canSee) return null;

        // C31b: oyun satırı aynı kuraldan geçer (presence geçti + ek şartlar), ad tablodan gelir.
        const state: {
          userId: string;
          status: ActiveStatus;
          gameId?: string;
          gameName?: string;
          gameIconUrl?: string | null;
          gameStartedAt?: string;
          gameStoreUrl?: string | null;
        } = { userId: candidateId, status: candidateStatus };
        const active = this.activeGame(candidateId);
        if (active && (await this.activityConditions(viewerId, candidateId))) {
          const game = await this.games.visibleById(active.gameId);
          if (game) {
            state.gameId = game.id;
            state.gameName = game.name;
            state.gameIconUrl = game.iconUrl;
            state.gameStartedAt = new Date(active.startedAt).toISOString();
            state.gameStoreUrl = game.storeUrl;
          }
        }
        return state;
      }),
    );

    return results.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }
}
