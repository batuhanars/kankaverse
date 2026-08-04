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
 * 🔴 **R2 §A — kanal adı BURAYA geri döndü.** M2c turunda başlık native header'a taşınmıştı çünkü
 * "ekranda büyük ortalı başlık + BOŞ native header" üst üste ölü alan bırakıyordu. Sahip teşhisi
 * (2026-08-04): asıl sorun şeridin boş olmasıydı, başlığın yeri değil — yani semptom tedavi
 * edilmişti. Header tamamen kalkınca başlık kendi yerine döndü (Discord mantığı), ölü alan da
 * kaynağından kalktı. Ekran okuyucu için `accessibilityRole="header"`: native başlık gidince
 * ekranın adını duyuran tek satır bu.
 *
 * Yaş rozeti (`ageGated`) başlığın altında küçük bir işaret olarak kaldı.
 *
 * Görsel dil `GuildMenuSheet`in aksiyon şeridinden alındı (daire + alt etiket); o bileşen
 * BURADA import edilmedi çünkü tamamen farklı bir yüzey (alttan panel vs. tam ekran başlık) —
 * yalnız ölçüler tekrarlandı, kapsam dışı bir dosyaya dokunulmadı.
 */
export function ChannelDetailsHeader({ channel, muted, canManage, onSearch, onMute, onSettings }: Props) {
  return (
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
        #{channel.name}
      </Text>

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
  title: {
    alignSelf: 'center',
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    textAlign: 'center',
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
