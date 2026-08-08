import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoTrack } from '@livekit/react-native';
import type { TrackPublication } from 'livekit-client';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  name: string;
  avatarUrl: string | null;
  /** Konuşan kutucuk yeşil kenarlık (per-participant `IsSpeakingChanged`, web dersi: aggregate
   *  ActiveSpeakersChanged mute/unmute döngüsünde kaçıyor — bkz. `stores/voice.ts` `attachSpeaking`). */
  speaking: boolean;
  micOff: boolean;
  /** §4 — karşı taraf henüz katılmadıysa kutucuk soluk durur. M4z §E ile grup DM'de odada
   *  olmayan üyeler için de kullanılır (orada `ringing` verilmez). */
  dimmed?: boolean;
  /** §4 — davet gönderildi, karşı taraf henüz katılmadı: "Çalıyor…" göstergesi. */
  ringing?: boolean;
  /**
   * M4d §3 — video track yayını varsa avatar YERİNE bu çizilir; kalan her şey (ad, mikrofon rozeti,
   * konuşma halkası, dimmed, ringing) AYNI yerinde kalır (sözleşme: "yeni bir kutucuk bileşeni
   * yazılmaz"). Yalnız `.track` gerçekten varsa video sayılır — publication'ın kendisi (mute'lu bir
   * publication `track`i temizler, bkz. `stores/voice.ts` `wireRoom`).
   */
  videoPublication?: TrackPublication | null;
  /** §3 — yalnız yerel ÖN kamera önizlemesinde true (kullanıcı kendini aynada gördüğü gibi görür;
   *  arka kameraya geçilince aynalama kalkar). Uzak taraf için hiç geçilmez. */
  mirror?: boolean;
}

const AVATAR_SIZE = 88;

export function ParticipantTile({
  name,
  avatarUrl,
  speaking,
  micOff,
  dimmed,
  ringing,
  videoPublication,
  mirror,
}: Props) {
  const hasVideo = !!videoPublication?.track;
  return (
    <View style={[styles.tile, dimmed && styles.tileDimmed]}>
      <View style={[styles.avatarWrap, speaking && styles.avatarSpeaking]}>
        {hasVideo ? (
          // `trackRef`in tipi (`@livekit/components-react`) bu projede kurulu değil (yalnız RN
          // paketi kurulu, §0 — sıfır yeni bağımlılık kuralı); VideoTrack çalışma zamanında yalnız
          // `publication.track`/`publication.trackSid` okuyor, `as any` bu iki alanı taşıyan
          // publication'ı geçirmek için yeterli ve güvenli.
          <VideoTrack
            trackRef={{ publication: videoPublication } as any}
            style={styles.avatarVideo}
            mirror={mirror}
            objectFit="cover"
          />
        ) : avatarUrl ? (
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
  // M4d §3 — `avatar` ile AYNI ölçü; `VideoTrack`'in kendi `style` prop'u tek obje kabul ediyor
  // (StyleSheet dizisi birleştirilemiyor), o yüzden `overflow:hidden` ayrı bir girdi.
  avatarVideo: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
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
});
