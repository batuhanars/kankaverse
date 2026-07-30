import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { dmApi, type DmChannelDto } from '@/api/dm';
import { extractErrorMessage } from '@/api/errors';
import { useAuthStore } from '@/stores/auth';
import { formatMentionsPlain } from '@/utils/mentions';
import { t } from '@/i18n';
import { theme } from '@/theme';

type LoadState = 'loading' | 'error' | 'ready';

interface Props {
  onOpenDm: (channel: DmChannelDto) => void;
  onOpenRequests: () => void;
}

function displayName(ch: DmChannelDto): string {
  if (ch.type === 'DM') return ch.otherUser.username;
  if (ch.name) return ch.name;
  const names = ch.members.map((m) => m.username);
  return names.length <= 3 ? names.join(', ') : names.slice(0, 2).join(', ') + ` +${names.length - 2}`;
}

function avatarSource(ch: DmChannelDto): string | null {
  return ch.type === 'DM' ? ch.otherUser.avatarUrl : (ch.members[0]?.avatarUrl ?? null);
}

// Sprint M1a contract §5 ekran 1 — DM listesi (son mesaj önizleme + okunmamış) + "Mesaj İstekleri"
// girişi (rozetli). C9 kuralı web/DmList.vue ile aynı: bekleyen giden istek (`requestStatus ===
// 'PENDING'`) normal listede GÖRÜNMEZ, istek kutusuna gider (dev deneyimi: gönderenin ekranında
// kendi bekleyen isteği iki kez görünmesin).
export function DmSidebar({ onOpenDm, onOpenRequests }: Props) {
  const authUser = useAuthStore((s) => s.user);
  const [state, setState] = useState<LoadState>('loading');
  const [channels, setChannels] = useState<DmChannelDto[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  // react-hooks/set-state-in-effect — bkz. home.tsx fetchGuilds yorumu.
  const fetchDms = useCallback(() => {
    Promise.all([dmApi.listChannels(), dmApi.listRequests()])
      .then(([list, requests]) => {
        setChannels(list.filter((c) => !(c.type === 'DM' && c.requestStatus === 'PENDING')));
        setRequestCount(requests.length);
        setState('ready');
      })
      .catch((e) => {
        setErrorMessage(extractErrorMessage(e));
        setState('error');
      });
  }, []);

  useEffect(() => {
    fetchDms();
  }, [fetchDms]);

  function retry() {
    setState('loading');
    fetchDms();
  }

  function resolver(ch: DmChannelDto) {
    return (id: string): string | undefined => {
      if (id === authUser?.id) return authUser.username;
      if (ch.type === 'DM') return id === ch.otherUser.id ? ch.otherUser.username : undefined;
      return ch.members.find((m) => m.id === id)?.username;
    };
  }

  return (
    <View style={styles.flex}>
      {/* Sözleşme §8.1-A/3 — web'in küçük soluk bölüm etiketi (`dm.sectionHeader` = "MESAJLAR")
          mobilde ekran başlığı işi görüyor, o yüzden büyük+kalın "Mesajlar" (`mobile.home.dmEntry`).
          Web'in kendi anahtarına dokunulmadı; orada hâlâ sidebar bölüm etiketi. */}
      <Text style={styles.header}>{t('mobile.home.dmEntry')}</Text>

      {requestCount > 0 && (
        <Pressable onPress={onOpenRequests} style={styles.requestRow}>
          <Text style={styles.requestText}>{t('notification.messageRequests', { n: requestCount })}</Text>
        </Pressable>
      )}

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
          <Text style={styles.empty}>{t('dm.noDms')}</Text>
        </View>
      )}

      {state === 'ready' && channels.length > 0 && (
        <FlatList
          data={channels}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const avatar = avatarSource(item);
            const name = displayName(item);
            const preview = item.lastMessage
              ? formatMentionsPlain(item.lastMessage.content, resolver(item), t('mention.unknown'))
              : '';
            return (
              <Pressable onPress={() => onOpenDm(item)} style={styles.row}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarFallbackText}>{name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.rowBody}>
                  <Text style={[styles.name, item.unread && styles.nameUnread]} numberOfLines={1}>
                    {name}
                  </Text>
                  {preview ? (
                    <Text style={styles.preview} numberOfLines={1}>
                      {preview}
                    </Text>
                  ) : null}
                </View>
                {item.unread && <View style={styles.unreadDot} />}
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
  header: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 14,
    paddingBottom: 10,
  },
  requestRow: {
    marginHorizontal: 10,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accentSubtle,
  },
  requestText: {
    color: theme.colors.accent400,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: theme.radius.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
  },
  nameUnread: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
  preview: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accent500,
    marginLeft: 6,
  },
});
