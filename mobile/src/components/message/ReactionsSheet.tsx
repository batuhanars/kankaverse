import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { messagesApi, type MessageAuthorDto, type MessageDto, type ReactionGroupDto } from '@/api/messages';
import { extractErrorMessage } from '@/api/errors';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  channelId: string;
  message: MessageDto;
  onClose: () => void;
  /** Kişiye dokunuş: çağıran taraf bu paneli kapatıp profil panelini açar. */
  onSelectUser: (user: MessageAuthorDto) => void;
}

interface Row {
  key: string;
  emoji: string;
  user: ReactionGroupDto['users'][number];
}

const ALL = 'ALL';
const AVATAR = 36;

/**
 * C46 §6.2 — "Kimler tepki verdi" alt paneli (mevcut sheet deseni: `Modal` + gerçek alt inset).
 * Üstte yatay emoji sekmeleri ("Tümü" + her emoji ve sayısı), altında kaydırmalı kişi listesi.
 * Veri panel açılınca bir kez çekilir (anlık görüntü; açıkken gelen olaylarla canlı güncellenmez).
 */
export function ReactionsSheet({ channelId, message, onClose, onSelectUser }: Props) {
  const bottomInset = useSheetInsets();
  const { height } = useWindowDimensions();
  const [groups, setGroups] = useState<ReactionGroupDto[] | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<string>(ALL);

  useEffect(() => {
    let cancelled = false;
    messagesApi
      .listReactions(channelId, message.id)
      .then((data) => {
        if (!cancelled) setGroups(data);
      })
      .catch((e) => {
        if (!cancelled) setError(extractErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, message.id]);

  const total = useMemo(() => (groups ?? []).reduce((sum, g) => sum + g.count, 0), [groups]);

  const rows = useMemo<Row[]>(() => {
    const source = tab === ALL ? (groups ?? []) : (groups ?? []).filter((g) => g.emoji === tab);
    return source.flatMap((g) => g.users.map((user) => ({ key: `${g.emoji}:${user.id}`, emoji: g.emoji, user })));
  }, [groups, tab]);

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { maxHeight: height * 0.7, paddingBottom: sheetBottomPadding(bottomInset) }]}
          onPress={() => {}}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>{t('reaction.whoReacted')}</Text>

          {!groups && !error && <ActivityIndicator color={theme.colors.accent500} style={styles.state} />}
          {!!error && <Text style={[styles.state, styles.error]}>{error}</Text>}

          {groups && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
                <Pressable onPress={() => setTab(ALL)} style={[styles.tab, tab === ALL && styles.tabActive]}>
                  <Text style={[styles.tabText, tab === ALL && styles.tabTextActive]}>
                    {t('reaction.all')} {total}
                  </Text>
                </Pressable>
                {groups.map((g) => (
                  <Pressable
                    key={g.emoji}
                    onPress={() => setTab(g.emoji)}
                    style={[styles.tab, tab === g.emoji && styles.tabActive]}
                  >
                    <Text style={[styles.tabText, tab === g.emoji && styles.tabTextActive]}>
                      {g.emoji} {g.count}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <FlatList
                data={rows}
                keyExtractor={(r) => r.key}
                style={styles.list}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.row}
                    onPress={() =>
                      onSelectUser({
                        id: item.user.id,
                        username: item.user.username,
                        avatarUrl: item.user.avatarUrl,
                      })
                    }
                  >
                    {item.user.avatarUrl ? (
                      <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarText}>{item.user.username.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={styles.name} numberOfLines={1}>
                      {item.user.displayName || item.user.username}
                    </Text>
                    <Text style={styles.rowEmoji}>{item.emoji}</Text>
                  </Pressable>
                )}
              />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.bgSidebar,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    marginTop: 10,
    marginBottom: 4,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 8,
    paddingBottom: 8,
  },
  state: {
    paddingVertical: 24,
    textAlign: 'center',
  },
  error: {
    color: theme.colors.danger,
    paddingHorizontal: theme.layout.panelGap,
  },
  tabsScroll: {
    flexGrow: 0,
  },
  tabs: {
    paddingHorizontal: theme.layout.panelGap,
    gap: 8,
    paddingBottom: 8,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabActive: {
    backgroundColor: theme.colors.accentSubtle,
    borderColor: theme.colors.accent500,
  },
  tabText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  tabTextActive: {
    color: theme.colors.accent500,
  },
  list: {
    flexShrink: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 10,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  name: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '500',
  },
  rowEmoji: {
    fontSize: 20,
  },
});
