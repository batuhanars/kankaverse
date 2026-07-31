import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { channelsApi, ChannelType, type ChannelSummaryDto } from '@/api/channels';
import { extractErrorMessage } from '@/api/errors';
import { t } from '@/i18n';
import { theme } from '@/theme';

type LoadState = 'loading' | 'error' | 'ready';

interface Props {
  guildId: string;
  guildName: string;
  /**
   * Sözleşme §8.1-A/1 "seçili kanal vurgusu". Mobilde içerik AYRI tam ekran (contract §2), yani
   * sidebar'da kalıcı "açık kanal" yok — vurgu **en son açılan** kanalı işaretler. Kanal ekranından
   * geri dönen kullanıcı nerede kaldığını görür. Ortam değişince eşleşme olmaz, hiçbir satır
   * vurgulanmaz (id'ler ortamlar arası tekil).
   */
  selectedChannelId?: string;
  onOpenChannel: (channel: ChannelSummaryDto) => void;
  /**
   * Sprint M1d §2.4 — "Davet Et" girişi. **Yalnız yetkiliye (OWNER/ADMIN) verilir**; çağıran
   * (home.tsx) yetkisizde bu prop'u HİÇ geçmez, bu yüzden düğme render edilmez. Disabled düğme
   * gösterilmiyor: yapamayacağın şeyi görmek bilgi değil gürültüdür (M1b grup yönetimi deseni).
   */
  onOpenInvite?: () => void;
}

// Sprint M1a contract §0 + §2 — yalnız GUILD_TEXT kanalları listelenir. Sözleşme metni:
// "Ses kanalı satırları listede görünür ama girilemez" cümlesi DEĞİL geçerli — tam tersi: "kanal
// listesi yalnız metin kanallarını gösterir". Ses satırlarını gösterip dokununca hiçbir şey
// yapmamak "boş yüzey" (mobile/CLAUDE.md yasağı) olurdu; bu yüzden GUILD_VOICE baştan süzülür.
export function ChannelSidebar({ guildId, guildName, selectedChannelId, onOpenChannel, onOpenInvite }: Props) {
  const [state, setState] = useState<LoadState>('loading');
  const [channels, setChannels] = useState<ChannelSummaryDto[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  // react-hooks/set-state-in-effect — bkz. home.tsx fetchGuilds yorumu: effect senkron setState
  // çağırmaz (ilk değer 'loading'), yalnız fetch başlatır; "tekrar dene" effect dışında 'loading'i
  // senkron set edip fetch'i tetikler.
  const fetchChannels = useCallback(() => {
    channelsApi
      .listByGuild(guildId)
      .then((list) => {
        const textOnly = list
          .filter((c) => c.type === ChannelType.GUILD_TEXT)
          .sort((a, b) => a.position - b.position);
        setChannels(textOnly);
        setState('ready');
      })
      .catch((e) => {
        setErrorMessage(extractErrorMessage(e));
        setState('error');
      });
  }, [guildId]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  function retry() {
    setState('loading');
    fetchChannels();
  }

  return (
    <View style={styles.flex}>
      <View style={styles.headerRow}>
        <Text style={styles.header} numberOfLines={1}>
          {guildName}
        </Text>
        {onOpenInvite && (
          <Pressable
            onPress={onOpenInvite}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('guild.join')}
          >
            <Ionicons name="person-add-outline" size={18} color={theme.colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {state === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {state === 'error' && (
        <View style={styles.center}>
          <Text style={styles.error}>{errorMessage}</Text>
          <Pressable onPress={retry} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      )}

      {state === 'ready' && channels.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.empty}>{t('channel.noChannels')}</Text>
        </View>
      )}

      {state === 'ready' && channels.length > 0 && (
        <FlatList
          data={channels}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const selected = item.id === selectedChannelId;
            return (
              <Pressable
                onPress={() => onOpenChannel(item)}
                style={[styles.row, selected && styles.rowSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.hash, selected && styles.hashSelected]}>#</Text>
                <Text
                  style={[styles.name, item.unreadCount > 0 && styles.nameUnread, selected && styles.nameSelected]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                {item.unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgSidebar,
  },
  // Başlık + davet ikonu tek satırda. Yatay dolgu satıra taşındı ki ikon panelin sağ kenarına
  // hizalansın; başlığın kendi dolgusu kaldırıldı (iki kez uygulanmasın).
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 14,
    paddingBottom: 10,
  },
  header: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: 8,
    paddingBottom: 20,
  },
  // Sözleşme §8.1-A/1 — kanal satırı belirginleşti: rahat satır yüksekliği (dokunma hedefi 40dp,
  // aralarında 2dp ritim boşluğu) + `#` ön eki net + metin `textBody`'ye çıktı. Ayırıcı çizgi
  // KONMADI: sözleşme "Discord'daki karşılığı" diyor, Discord ritim+dolgu ile ayırır, çizgiyle değil.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 2,
    borderRadius: theme.radius.md,
  },
  rowSelected: {
    backgroundColor: theme.colors.bgElevated,
  },
  hash: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.lg,
    marginRight: 7,
    fontWeight: '600',
  },
  hashSelected: {
    color: theme.colors.accent500,
  },
  name: {
    flex: 1,
    color: theme.colors.textBody,
    fontSize: theme.fontSize.md,
    fontWeight: '500',
  },
  nameUnread: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
  nameSelected: {
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    // Gömülü '#fff' idi — tema disiplini gereği token'a çevrildi (danger zemin üzerinde okunur).
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
});
