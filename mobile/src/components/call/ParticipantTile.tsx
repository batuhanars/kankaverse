import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoTrack } from '@livekit/react-native';
import type { TrackPublication } from 'livekit-client';
import { t } from '@/i18n';
import { theme } from '@/theme';

type Variant = 'card' | 'full' | 'corner';

interface Props {
  name: string;
  avatarUrl: string | null;
  /** Konuşan kutucuk yeşil kenarlık (per-participant `IsSpeakingChanged`, web dersi: aggregate
   *  ActiveSpeakersChanged mute/unmute döngüsünde kaçıyor — bkz. `stores/voice.ts` `attachSpeaking`).
   *  `'full'` varyantında HİÇ çizilmez (§3-R: "tek kişilik alanda anlamsız") — bileşen bunu kendi
   *  içinde kapılar, çağıran taraf değerin ne olduğuna bakmadan gerçek konuşma durumunu geçebilir. */
  speaking: boolean;
  micOff: boolean;
  /** §4 — karşı taraf henüz katılmadıysa kutucuk soluk durur. M4z §E ile grup DM'de odada
   *  olmayan üyeler için de kullanılır (orada `ringing` verilmez). Yalnız `'card'` varyantında anlamlı. */
  dimmed?: boolean;
  /** §4 — davet gönderildi, karşı taraf henüz katılmadı: "Çalıyor…" göstergesi. */
  ringing?: boolean;
  /**
   * M4d §3 — video track yayını varsa avatar YERİNE bu çizilir. Yalnız `.track` gerçekten varsa
   * video sayılır — publication'ın kendisi (mute'lu bir publication `track`i temizler, bkz.
   * `stores/voice.ts` `wireRoom`).
   */
  videoPublication?: TrackPublication | null;
  /** §3 — yalnız yerel ÖN kamera önizlemesinde true (kullanıcı kendini aynada gördüğü gibi görür;
   *  arka kameraya geçilince aynalama kalkar). Uzak taraf için hiç geçilmez. */
  mirror?: boolean;
  /**
   * M4d §3-R — düzen kamera durumundan TÜRETİLİR (`call.tsx`), bu bileşen kendi başına bir düzen
   * state'i TUTMAZ; hangi varyantın çizileceğine çağıran taraf karar verir.
   * - `'card'` (varsayılan) — bugünkü iki-kutucuk/ızgara kartı, sözleşme §3, videosuz davranışı
   *   HİÇ değişmedi. M4e §3.2 🔴 — `videoPublication` geldiğinde (grup DM ızgarası) dairesel avatar
   *   yerine dikey dikdörtgene yakın bir video karesi çizilir; yeni bir varyant EKLENMEDİ.
   * - `'full'` — kamera açıkken karşı taraf için TAM ALAN: video varsa uçtan uca kaplar, yoksa
   *   bugünkü avatar+ad büyütülmüş halde ortalanır. Mikrofon rozeti + "Çalıyor…" korunur, konuşma
   *   halkası YOK.
   * - `'corner'` — sağ üst köşedeki küçük kendi-önizleme karesi. Yalnız kamera açıkken çağrılır
   *   (kapı çağıran tarafta — kapalıyken köşe kutusu hiç render edilmez). Ad/ringing yok, konuşma
   *   halkası VAR (§3-R: "iki-kutucuk düzeninde bugünkü gibi kalır").
   */
  variant?: Variant;
}

const AVATAR_SIZE = 88;
// §3-R — "büyük ortalanmış avatar" (video yoksa tam-alan karşı taraf görünümü).
const FULL_AVATAR_SIZE = 160;
// §3-R — sağ üst köşedeki küçük kendi-önizleme karesi (Discord'daki PIP oranına yakın dikey kare).
const CORNER_WIDTH = 96;
const CORNER_HEIGHT = 128;

export function ParticipantTile({
  name,
  avatarUrl,
  speaking,
  micOff,
  dimmed,
  ringing,
  videoPublication,
  mirror,
  variant = 'card',
}: Props) {
  const hasVideo = !!videoPublication?.track;
  // `trackRef`in tipi (`@livekit/components-react`) bu projede kurulu değil (yalnız RN paketi
  // kurulu, §0 — sıfır yeni bağımlılık kuralı); VideoTrack çalışma zamanında yalnız
  // `publication.track`/`publication.trackSid` okuyor, `as any` bu iki alanı taşıyan publication'ı
  // geçirmek için yeterli ve güvenli.
  const trackRef = { publication: videoPublication } as any;

  if (variant === 'full') {
    return (
      <View style={styles.fullWrap}>
        {hasVideo ? (
          <VideoTrack trackRef={trackRef} style={styles.fullVideo} mirror={mirror} objectFit="cover" />
        ) : (
          <View style={styles.fullCentered}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.fullAvatar} />
            ) : (
              <View style={[styles.fullAvatar, styles.avatarFallback]}>
                <Text style={styles.fullAvatarFallbackText}>{name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.fullName} numberOfLines={1}>
              {name}
            </Text>
          </View>
        )}
        {micOff && (
          <View style={styles.fullMicBadge}>
            <Ionicons name="mic-off" size={16} color={theme.colors.textPrimary} />
          </View>
        )}
        {ringing && <Text style={styles.fullRinging}>{t('mobile.call.ringing')}</Text>}
      </View>
    );
  }

  if (variant === 'corner') {
    return (
      <View style={[styles.cornerWrap, speaking && styles.cornerSpeaking]}>
        {hasVideo ? (
          <VideoTrack trackRef={trackRef} style={styles.cornerFill} mirror={mirror} objectFit="cover" />
        ) : avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.cornerFill} />
        ) : (
          <View style={[styles.cornerFill, styles.avatarFallback]}>
            <Text style={styles.avatarFallbackText}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>
    );
  }

  // 'card' — sözleşme §3, HİÇ VİDEOSUZ davranış değişmedi (iki-kutucuk DM + ızgara guild/grup).
  // M4e §3.2 🔴 — video geldiğinde (grup DM ızgarası) avatarın dairesel çerçevesi yerine dikey
  // dikdörtgene yakın bir video karesi çizilir (yüz görünsün); ad + mikrofon rozeti + konuşma
  // kenarlığı AYNI yerinde kalır, yeni bir varyant EKLENMEDİ.
  return (
    <View style={[styles.tile, dimmed && styles.tileDimmed]}>
      {hasVideo ? (
        <View style={[styles.videoWrap, speaking && styles.videoSpeaking]}>
          <VideoTrack trackRef={trackRef} style={styles.videoFill} mirror={mirror} objectFit="cover" />
          {micOff && (
            <View style={styles.videoMicBadge}>
              <Ionicons name="mic-off" size={14} color={theme.colors.textPrimary} />
            </View>
          )}
        </View>
      ) : (
        <View style={[styles.avatarWrap, speaking && styles.avatarSpeaking]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarFallbackText}>{name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          {micOff && (
            <View style={styles.micBadge}>
              <Ionicons name="mic-off" size={14} color={theme.colors.textPrimary} />
            </View>
          )}
        </View>
      )}
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      {ringing && <Text style={styles.ringing}>{t('mobile.call.ringing')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
  },
  tileDimmed: {
    opacity: 0.5,
  },
  avatarWrap: {
    width: AVATAR_SIZE + 6,
    height: AVATAR_SIZE + 6,
    borderRadius: (AVATAR_SIZE + 6) / 2,
    borderWidth: 3,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSpeaking: {
    borderColor: theme.colors.online,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
  },
  micBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.bgElevated,
  },
  name: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
  },
  ringing: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },

  // ── M4e §3.2 'card' + video — grup DM ızgarasında dikey dikdörtgene yakın video karesi ──────
  videoWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
    backgroundColor: theme.colors.bgElevated,
  },
  videoSpeaking: {
    borderColor: theme.colors.online,
  },
  videoFill: {
    width: '100%',
    height: '100%',
  },
  videoMicBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.bgElevated,
  },

  // ── §3-R 'full' — kamera açıkken karşı tarafın tam-alan görünümü ─────────────
  fullWrap: {
    flex: 1,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullVideo: {
    width: '100%',
    height: '100%',
  },
  fullCentered: {
    alignItems: 'center',
    gap: 12,
  },
  fullAvatar: {
    width: FULL_AVATAR_SIZE,
    height: FULL_AVATAR_SIZE,
    borderRadius: FULL_AVATAR_SIZE / 2,
  },
  fullAvatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: 40,
    fontWeight: '700',
  },
  fullName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
  },
  fullMicBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullRinging: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },

  // ── §3-R 'corner' — sağ üst köşedeki küçük kendi-önizleme karesi ─────────────
  cornerWrap: {
    width: CORNER_WIDTH,
    height: CORNER_HEIGHT,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
    backgroundColor: theme.colors.bgElevated,
  },
  cornerSpeaking: {
    borderColor: theme.colors.online,
  },
  cornerFill: {
    width: '100%',
    height: '100%',
  },
});
