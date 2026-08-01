import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { channelsApi, ChannelType, type ChannelSummaryDto } from '@/api/channels';
import { categoriesApi, type CategoryDto } from '@/api/categories';
import { extractErrorMessage } from '@/api/errors';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1e — Ortam Ayarları > Kanallar (sahip kararı 2026-08-01).
 *
 * 🔴 **PM önerisi bu ekranı koymamaktı** (kanal CRUD zaten ortam panelinde ve kanal satırına uzun
 * basışta; ayarlara ikinci kapı açmak aynı işi iki yerden yapmak olur). Sahip "her yerden
 * erişilsin, tek yere koyarsak erişimi kısıtlarız" diyerek koymayı seçti — karar sahibin.
 *
 * Endişe şu şekilde karşılandı: bu ekran **düzenlemeyi yeniden yazmıyor**. Liste gösterir,
 * dokunulan kanalı/kategoriyi mevcut `channel-edit` / `category-edit` / `channel-new` ekranlarına
 * yollar. Yani **iki giriş, tek uygulama** — davranış ayrışamaz.
 *
 * Ses kanalları listelenmez (`GUILD_TEXT` süzgeci): mobil ses kanallarını hiçbir yerde
 * göstermiyor, burada göstermek "girilemeyen satır" olurdu (M1d-B Tuzak 2 kararı).
 */
export default function GuildChannelsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const guildId = params.id;

  const [channels, setChannels] = useState<ChannelSummaryDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  // Sidebar ile AYNI çekim ve aynı sıralama — iki yüzey aynı listeyi farklı sırada göstermesin.
  useFocusEffect(
    useCallback(() => {
      Promise.all([channelsApi.listByGuild(guildId), categoriesApi.listByGuild(guildId)])
        .then(([channelList, categoryList]) => {
          setChannels(
            channelList
              .filter((c) => c.type === ChannelType.GUILD_TEXT)
              .sort((a, b) => a.position - b.position),
          );
          setCategories([...categoryList].sort((a, b) => a.position - b.position));
          setState('ready');
        })
        .catch((e) => {
          setErrorMessage(extractErrorMessage(e));
          setState('error');
        });
    }, [guildId]),
  );

  function openChannel(c: ChannelSummaryDto) {
    router.push({
      pathname: '/channel-edit',
      params: { id: c.id, name: c.name ?? '', ageGated: String(c.ageGated) },
    });
  }

  function openCategory(c: CategoryDto) {
    router.push({ pathname: '/category-edit', params: { guildId, id: c.id, name: c.name } });
  }

  const uncategorized = channels.filter((c) => !c.categoryId);

  return (
    <View style={styles.flex}>
      {/* `channel.textChannels` web'de zaten "METİN KANALLARI" — yeni anahtar açılmadı. */}
      <Stack.Screen options={{ title: t('channel.textChannels') }} />

      {state === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {state === 'error' && (
        <View style={styles.center}>
          <Text style={styles.error}>{errorMessage}</Text>
        </View>
      )}

      {state === 'ready' && (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.actions}>
            <Pressable
              style={styles.actionButton}
              onPress={() => router.push({ pathname: '/channel-new', params: { guildId } })}
            >
              <Ionicons name="add" size={18} color={theme.colors.textPrimary} />
              <Text style={styles.actionText}>{t('channel.createTitle')}</Text>
            </Pressable>
            <Pressable
              style={styles.actionButton}
              onPress={() => router.push({ pathname: '/category-edit', params: { guildId } })}
            >
              <Ionicons name="add" size={18} color={theme.colors.textPrimary} />
              <Text style={styles.actionText}>{t('category.createTitle')}</Text>
            </Pressable>
          </View>

          {/* Kategorisiz kanallar en üstte, başlıksız — sidebar okumasıyla aynı. */}
          {uncategorized.length > 0 && (
            <View style={styles.group}>
              {uncategorized.map((c) => (
                <Pressable key={c.id} style={styles.row} onPress={() => openChannel(c)}>
                  <Ionicons name="chatbubble-outline" size={18} color={theme.colors.textMuted} />
                  <Text style={styles.rowText}>{c.name}</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </Pressable>
              ))}
            </View>
          )}

          {categories.map((cat) => {
            const inCat = channels.filter((c) => c.categoryId === cat.id);
            return (
              <View key={cat.id}>
                <Pressable style={styles.categoryHeader} onPress={() => openCategory(cat)}>
                  <Text style={styles.categoryName}>{cat.name.toLocaleUpperCase('tr')}</Text>
                  <Ionicons name="settings-outline" size={16} color={theme.colors.textMuted} />
                </Pressable>
                <View style={styles.group}>
                  {inCat.length === 0 ? (
                    <Text style={styles.emptyRow}>{t('channel.noChannels')}</Text>
                  ) : (
                    inCat.map((c) => (
                      <Pressable key={c.id} style={styles.row} onPress={() => openChannel(c)}>
                        <Ionicons name="chatbubble-outline" size={18} color={theme.colors.textMuted} />
                        <Text style={styles.rowText}>{c.name}</Text>
                        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                      </Pressable>
                    ))
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
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
  },
  body: {
    padding: theme.layout.panelGap,
    paddingBottom: theme.layout.panelGap * 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: theme.layout.controlSm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgSidebar,
    paddingHorizontal: 10,
  },
  actionText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  categoryName: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  group: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgSidebar,
    overflow: 'hidden',
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: theme.layout.panelGap,
  },
  rowText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
  },
  emptyRow: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    padding: theme.layout.panelGap,
  },
});
