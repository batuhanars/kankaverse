import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon, Text as SvgText } from 'react-native-svg';
import type { InvitePreviewDto } from '@/api/guilds';
import { hexPoints } from './hexShape';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Davetiye kartı — web `InviteAcceptView.vue`nin mobil karşılığı (sahip kararı 2026-08-01).
 *
 * Kod ZATEN bilindiğinde (bildirimden ya da linkten gelindi) kullanıcıya kod kutusu göstermek
 * gereksiz sürtünmedir: bildiği bir şeyi düzenlemesi istenmiş olur. Web bu yolda input göstermiyor,
 * doğrudan "seni davet ettiler → Katıl" kartını gösteriyor; mobil de aynısını yapar.
 *
 * `join-guild` ekranından ayrı dosya olmasının sebebi 300 satır eşiği: ekran iki modlu hâle gelince
 * eşiği aştı ve sözleşmenin kendi kuralı ihlal olacaktı.
 *
 * 🔴 T&S: bu kart bir KAPI DEĞİL. `adultsOnly` rozeti bilgilendirmedir; "minörsen Katıl'ı gizle"
 * YAPILMAZ — yaş kararı sunucunundur (Sprint 7A, R7). Ret sebebi de sunucunun Türkçe mesajından
 * gösterilir, koda göre metin uydurulmaz.
 */
interface Props {
  preview: InvitePreviewDto | null;
  /** Önizleme sürüyor. */
  loading: boolean;
  /** Önizleme çözülemedi ya da davet geçersiz döndü. Katılma reddi bu değildir. */
  invalid: boolean;
  /** Sunucudan gelen hata mesajı (önizleme ya da katılma). */
  errorMessage: string;
  joining: boolean;
  onJoin: () => void;
  onGoHome: () => void;
}

const HEX = 72;

/** Web `InviteAcceptView.guildInitial` ile aynı kural: ilk iki kelimenin baş harfleri. */
function guildInitial(name: string): string {
  return name
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

export function InviteAcceptCard({
  preview,
  loading,
  invalid,
  errorMessage,
  joining,
  onJoin,
  onGoHome,
}: Props) {
  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={theme.colors.accent500} />
        <Text style={styles.muted}>{t('inviteAccept.loading')}</Text>
      </View>
    );
  }

  if (invalid || !preview) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{t('inviteAccept.invalidTitle')}</Text>
        <Text style={styles.muted}>{errorMessage || t('inviteAccept.invalidDesc')}</Text>
        <Pressable onPress={onGoHome} style={[styles.button, styles.buttonStretch]}>
          <Text style={styles.buttonText}>{t('inviteAccept.goHome')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.muted}>{t('inviteAccept.youInvited')}</Text>

      {/* Altıgen + baş harfler: web ile aynı silüet (hexShape) ve aynı baş-harf kuralı. Sunucu
          önizlemede ortam ikonu DÖNMÜYOR (yalnız guildName/adultsOnly/valid) — web de bu yüzden
          baş harf gösteriyor; mobil olmayan alanı beklemiyor. */}
      <Svg width={HEX} height={HEX} viewBox={`0 0 ${HEX} ${HEX}`}>
        <Polygon points={hexPoints(HEX)} fill={theme.colors.bgElevated} />
        <SvgText
          x={HEX / 2}
          y={HEX / 2}
          textAnchor="middle"
          alignmentBaseline="central"
          fontSize={theme.fontSize.xl}
          fontWeight="700"
          fill={theme.colors.textSecondary}
        >
          {guildInitial(preview.guildName)}
        </SvgText>
      </Svg>

      <View style={styles.nameRow}>
        <Text style={styles.title} numberOfLines={2}>
          {preview.guildName}
        </Text>
        {preview.adultsOnly && (
          <View style={styles.adultsBadge}>
            <Text style={styles.adultsBadgeText}>{t('invite.adultsOnlyBadge')}</Text>
          </View>
        )}
      </View>

      {/* Katılma reddi (18+ kapısı, yasak, arada geçersizleşmiş davet) — sunucunun mesajı. Kart
          EKRANDA KALIR: kullanıcı neye katılmaya çalıştığını görmeye devam etmeli. */}
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <Pressable
        onPress={onJoin}
        disabled={joining}
        style={[styles.button, styles.buttonStretch, joining && styles.buttonDisabled]}
      >
        {joining ? (
          <ActivityIndicator color={theme.colors.textPrimary} />
        ) : (
          <Text style={styles.buttonText}>{t('inviteAccept.join')}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Gölge YOK (tasarım sistemi): katman ayrımı zemin tonu + ince kenarlıkla.
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap * 1.5,
    gap: 14,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    textAlign: 'center',
  },
  muted: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  adultsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.danger,
  },
  adultsBadgeText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
  button: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  // Kart ortalanmış olduğu için düğme içerik genişliğine büzülürdü; web'deki tam genişlik karşılığı.
  buttonStretch: {
    alignSelf: 'stretch',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
});
