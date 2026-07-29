import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { guildsApi, type GuildSummaryDto } from '@/api/guilds';
import { extractErrorMessage } from '@/api/errors';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/i18n';
import { theme } from '@/theme';

type LoadState = 'loading' | 'error' | 'ready';

// Ekran 3/3 (contract §8) — Ortam listesi: read-only, ikon + ad. Tıklama M1'e kadar iş yapmaz
// (bu yüzden satırlar Pressable DEĞİL, düz View — tıklanabilirlik hissi verilmez). "Çıkış Yap"
// bu ekranın başlığında durur (DoD §6 + M0'da ayrı ayarlar ekranı yok).
export default function GuildsScreen() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  const [state, setState] = useState<LoadState>('loading');
  const [guilds, setGuilds] = useState<GuildSummaryDto[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  // Effect'i yeniden tetiklemek için (retry) — React'ın önerdiği "veri çekme effect'i" deseni:
  // fetch mantığı effect gövdesine gömülü, dışarı sızan yeniden kullanılabilir bir fonksiyon yok.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    guildsApi
      .list()
      .then((list) => {
        if (cancelled) return;
        setGuilds(list);
        setState('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setErrorMessage(extractErrorMessage(e));
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  function retry() {
    setState('loading');
    setReloadToken((n) => n + 1);
  }

  async function onLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          title: t('mobile.guilds.title'),
          headerRight: () => (
            <Pressable onPress={onLogout} hitSlop={12}>
              <Text style={styles.logout}>{t('auth.logout')}</Text>
            </Pressable>
          ),
        }}
      />

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

      {state === 'ready' && guilds.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.empty}>{t('mobile.guilds.empty')}</Text>
        </View>
      )}

      {state === 'ready' && guilds.length > 0 && (
        <FlatList
          data={guilds}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              {item.iconUrl ? (
                <Image source={{ uri: item.iconUrl }} style={styles.icon} />
              ) : (
                <View style={[styles.icon, styles.iconFallback]}>
                  <Text style={styles.iconFallbackText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.name}>{item.name}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const ICON_SIZE = 44;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap * 1.5,
  },
  logout: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    marginRight: 4,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.base,
    textAlign: 'center',
    marginBottom: theme.layout.panelGap,
  },
  retryButton: {
    minHeight: theme.layout.control,
    paddingHorizontal: theme.layout.panelGap,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.base,
    textAlign: 'center',
  },
  list: {
    padding: theme.layout.panelGap,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
    marginBottom: 8,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: theme.radius.md,
    marginRight: 12,
  },
  iconFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
  name: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '500',
  },
});
