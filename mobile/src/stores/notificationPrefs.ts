import { create } from 'zustand';
import {
  notificationsApi,
  NotificationLevel,
  type NotificationPrefDto,
  type NotifTargetType,
  type SetNotificationPrefBody,
} from '@/api/notifications';

/**
 * Sprint M2b — bildirim tercihleri (sustur + seviye) deposu. Web `stores/notificationPrefs.ts`
 * (Pinia) ile aynı model, zustand'a taşındı: `prefs` map (`${targetType}:${targetId}` anahtarlı),
 * `load()` oturum açılışında bir kez (`(app)/_layout.tsx`), `setPref` iyimser yazar.
 *
 * §3 çözümleme kuralı (backend `shouldNotifyChannel` ile birebir): CHANNEL kaydı varsa TAMAMEN o
 * kazanır (kendi `muted` değeri de dahil, GUILD'e bakılmaz); yoksa GUILD kaydı; o da yoksa varsayılan
 * (susturulmamış, `ALL`). `resolvePref` bu sırayı uygulayan SAF fonksiyon — hem store metodları hem
 * `stores/unread.ts` `useTotalPing` (guild bazlı filtre) AYNI mantığı buradan çağırır; iki yerde
 * ayrışmasın diye tek kaynak.
 */
function prefKey(targetType: NotifTargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}

function isActiveMute(pref: NotificationPrefDto | undefined): boolean {
  if (!pref?.muted) return false;
  // Süreli sustur: bitiş geçmişse artık susturulmuş sayılmaz (backend de temizlemez, yok sayar).
  if (pref.mutedUntil && new Date(pref.mutedUntil).getTime() <= Date.now()) return false;
  return true;
}

export interface ResolvedNotificationPref {
  muted: boolean;
  level: NotificationLevel;
}

export function resolvePref(
  prefs: Record<string, NotificationPrefDto>,
  targetType: NotifTargetType,
  targetId: string,
  guildId?: string | null,
): ResolvedNotificationPref {
  const own = prefs[prefKey(targetType, targetId)];
  if (own) return { muted: isActiveMute(own), level: own.level };
  if (targetType === 'CHANNEL' && guildId) {
    const guildPref = prefs[prefKey('GUILD', guildId)];
    if (guildPref) return { muted: isActiveMute(guildPref), level: guildPref.level };
  }
  return { muted: false, level: NotificationLevel.ALL };
}

/**
 * Sprint M2b §10 R2-1 — ortam rozetinin **canlı soket** kaynağının uyguladığı tablo. Backend
 * `api/src/modules/guilds/guilds.service.ts` `resolveChannelBadgeEffect` ile BİREBİR aynı: yalnız
 * kanalın KENDİ tercihi (GUILD'e fallback YOK — guild seviyesi rail görünürlüğünde istemcide ayrıca
 * uygulanıyor, burada da uygulansa çift süzgeç olur). `stores/unread.ts` `bumpChannel` bunu kullanır;
 * REST (`GET /guilds`) zaten backend'de aynı tabloyla hesaplanıyor — iki kaynak böyle örtüşür.
 */
export function channelBadgeEffect(
  prefs: Record<string, NotificationPrefDto>,
  channelId: string,
): { countUnread: boolean; countMention: boolean } {
  const pref = prefs[prefKey('CHANNEL', channelId)];
  if (!pref) return { countUnread: true, countMention: true }; // varsayılan: ALL, susturulmamış
  if (isActiveMute(pref)) return { countUnread: false, countMention: false };
  if (pref.level === NotificationLevel.NONE) return { countUnread: false, countMention: false };
  if (pref.level === NotificationLevel.MENTIONS) return { countUnread: false, countMention: true };
  return { countUnread: true, countMention: true }; // ALL
}

interface NotificationPrefsState {
  prefs: Record<string, NotificationPrefDto>;

  /** Oturum açılışında BİR KEZ çağrılır (`(app)/_layout.tsx`) — mevcut tercihleri map'e doldurur. */
  load: () => Promise<void>;

  /**
   * İyimser yaz: PUT beklenmeden yerel state güncellenir, hata olursa ÖNCEKİ değere geri alınır
   * (§4.4 "seçim eski hâline döner"). Hata çağırana fırlatılır — kullanıcıya Türkçe mesaj göstermek
   * (veya sessiz yutmak) çağıranın kararı (menü sheet'lerinde sessiz, ayarlar ekranında görünür).
   */
  setPref: (body: SetNotificationPrefBody) => Promise<void>;

  /** Hedefin KENDİ kaydı susturulmuş mu (GUILD'e düşmez) — menü panellerinin "Sustur"/"Kaldır" etiketi. */
  isMuted: (targetType: NotifTargetType, targetId: string) => boolean;
  /** Hedefin KENDİ `mutedUntil`'i (ham ISO, süre kontrolü yok) — etiket metni bunu biçimlendirir. */
  mutedUntilFor: (targetType: NotifTargetType, targetId: string) => string | null;
  /** Efektif seviye — CHANNEL için kayıt yoksa GUILD'e düşer (§3). */
  effectiveLevel: (targetType: NotifTargetType, targetId: string, guildId?: string | null) => NotificationLevel;
  /** Efektif sustur durumu — CHANNEL için kayıt yoksa GUILD'in kendi mute'una düşer (§3). */
  effectiveMuted: (targetType: NotifTargetType, targetId: string, guildId?: string | null) => boolean;
  /** R14 — ortam düzeyi bastırma bayrakları; kayıt yoksa `false` (bastırma kapalı). */
  suppressEveryone: (guildId: string) => boolean;
  suppressEvents: (guildId: string) => boolean;
  /** `effectiveMuted` + `effectiveLevel`'in birleşimi (sözleşme §6 `resolve` imzası). */
  resolve: (targetType: NotifTargetType, targetId: string, guildId?: string | null) => ResolvedNotificationPref;

  /** Oturum sonu — bir sonraki kullanıcı öncekinin tercihlerini görmesin (unread/dm store aynı desen). */
  reset: () => void;
}

export const useNotificationPrefsStore = create<NotificationPrefsState>((set, get) => ({
  prefs: {},

  async load() {
    const list = await notificationsApi.getPrefs();
    set({ prefs: Object.fromEntries(list.map((p) => [prefKey(p.targetType, p.targetId), p])) });
  },

  async setPref(body) {
    const k = prefKey(body.targetType, body.targetId);
    const prev = get().prefs[k];
    const optimistic: NotificationPrefDto = {
      targetType: body.targetType,
      targetId: body.targetId,
      muted: body.muted ?? prev?.muted ?? false,
      mutedUntil: 'mutedUntil' in body ? (body.mutedUntil ?? null) : (prev?.mutedUntil ?? null),
      level: body.level ?? prev?.level ?? NotificationLevel.ALL,
      suppressEveryone: body.suppressEveryone ?? prev?.suppressEveryone ?? false,
      suppressEvents: body.suppressEvents ?? prev?.suppressEvents ?? false,
    };
    set((s) => ({ prefs: { ...s.prefs, [k]: optimistic } }));
    try {
      const saved = await notificationsApi.setPref(body);
      set((s) => ({ prefs: { ...s.prefs, [k]: saved } }));
    } catch (e) {
      set((s) => {
        const next = { ...s.prefs };
        if (prev) next[k] = prev;
        else delete next[k];
        return { prefs: next };
      });
      throw e;
    }
  },

  isMuted(targetType, targetId) {
    return isActiveMute(get().prefs[prefKey(targetType, targetId)]);
  },

  mutedUntilFor(targetType, targetId) {
    return get().prefs[prefKey(targetType, targetId)]?.mutedUntil ?? null;
  },

  effectiveLevel(targetType, targetId, guildId) {
    return resolvePref(get().prefs, targetType, targetId, guildId).level;
  },

  effectiveMuted(targetType, targetId, guildId) {
    return resolvePref(get().prefs, targetType, targetId, guildId).muted;
  },

  suppressEveryone(guildId) {
    return get().prefs[prefKey('GUILD', guildId)]?.suppressEveryone ?? false;
  },

  suppressEvents(guildId) {
    return get().prefs[prefKey('GUILD', guildId)]?.suppressEvents ?? false;
  },

  resolve(targetType, targetId, guildId) {
    return resolvePref(get().prefs, targetType, targetId, guildId);
  },

  reset() {
    set({ prefs: {} });
  },
}));
