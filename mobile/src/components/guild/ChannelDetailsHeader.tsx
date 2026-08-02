import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChannelSummaryDto } from '@/api/channels';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  channel: ChannelSummaryDto;
  muted: boolean;
  /** Ayarlar düğmesi yalnız bununla — yetkisizde HİÇ render edilmez (disabled gösterilmez). */
  canManage: boolean;
  onSearch: () => void;
  onMute: () => void;
  onSettings: () => void;
}

/**
 * Sprint M2c contract §4.2 — üç yuvarlak aksiyon (Ara·Sustur·Ayarlar). `channel-details.tsx`den
 * ayrıldı — dosya 300 satır eşiğini aşıyordu (kök CLAUDE.md "dosya 300+ satır → düzelt" sinyali),
 * bu bölüm saf sunum, kendi state'i yok.
 *
 * 🔴 Sahip cihaz turu revizesi — kanal adı BURADA değil, native header'a taşındı (`channel-details.tsx`
 * `Stack.Screen options.title`): ekranda büyük ortalı başlık + boş native header üst üste ölü alan
 * bırakıyordu. Yaş rozeti (`ageGated`) native başlığa sıkıştırılmadı (kısa alan, kırpılırdı) — burada,
 * aksiyon şeridinin ÜSTÜNDE küçük bir işaret olarak kaldı.
 *
 * Görsel dil `GuildMenuSheet`in aksiyon şeridinden alındı (daire + alt etiket); o bileşen
 * BURADA import edilmedi çünkü tamamen farklı bir yüzey (alttan panel vs. tam ekran başlık) —
 * yalnız ölçüler tekrarlandı, kapsam dışı bir dosyaya dokunulmadı.
 */
export function ChannelDetailsHeader({ channel, muted, canManage, onSearch, onMute, onSettings }: Props) {
  return (
    <View style={styles.header}>
      {channel.ageGated && (
        <Text style={styles.ageBadge} numberOfLines={1}>
          {t('channel.ageGatedBadge')}
        </Text>
      )}

      <View style={styles.actionRow}>
        <Pressable style={styles.action} onPress={onSearch}>
          <View style={styles.actionCircle}>
            <Ionicons name="search" size={20} color={theme.colors.textPrimary} />
          </View>
          <Text style={styles.actionLabel}>{t('common.search')}</Text>
        </Pressable>

        <Pressable style={styles.action} onPress={onMute}>
          <View style={styles.actionCircle}>
            <Ionicons
              name={muted ? 'volume-high-outline' : 'volume-mute-outline'}
              size={20}
              color={theme.colors.textPrimary}
            />
          </View>
          <Text style={styles.actionLabel}>
            {muted ? t('mobile.notif.unmute') : t('mobile.channelDetails.muteAction')}
          </Text>
        </Pressable>

        {canManage && (
          <Pressable style={styles.action} onPress={onSettings}>
            <View style={styles.actionCircle}>
              <Ionicons name="settings-outline" size={20} color={theme.colors.textPrimary} />
            </View>
            <Text style={styles.actionLabel}>{t('common.settings')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 10,
  },
  ageBadge: {
    alignSelf: 'center',
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
  },
  action: {
    alignItems: 'center',
    gap: 6,
  },
  actionCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
  },
});
