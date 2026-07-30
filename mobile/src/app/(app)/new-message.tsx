import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFriendsStore } from '@/stores/friends';
import { useDmStore } from '@/stores/dm';
import type { FriendDto } from '@/api/friends';
import { FriendPickerList } from '@/components/FriendPickerList';
import { extractErrorMessage } from '@/api/errors';
import { dmRouteParams } from '@/utils/dmRoute';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1b Revizyon R2 (§13) — "Yeni Mesaj" ekranı, FAB'ın açtığı hedef. Sahip Discord mobilde
// gezinip bulguladı: eski new-chat.tsx'in örtük davranışı (1 seçim → DM, 2+ seçim → grup) kaldırıldı.
// Burada bir kankaya dokunmak DAİMA `POST /dm/channels` ile DM açar (kanal zaten varsa sunucu
// mevcut olanı döner, kopya kutucuk açılmaz — R2 bunu değiştirmedi); grup kurma ayrı bir ekrana
// taşındı (/new-group), kart içindeki "Yeni Grup" satırı oraya götürür.
export default function NewMessageScreen() {
  const router = useRouter();
  const friends = useFriendsStore((s) => s.friends);
  const fetchFriends = useFriendsStore((s) => s.fetchAll);
  const createChannel = useDmStore((s) => s.createChannel);

  const [query, setQuery] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  async function onSelect(friend: FriendDto) {
    if (openingId) return;
    setOpeningId(friend.user.id);
    setError('');
    try {
      const channel = await createChannel(friend.user.id);
      router.replace(dmRouteParams(channel));
    } catch (e) {
      setError(extractErrorMessage(e));
      setOpeningId(null);
    }
  }

  return (
    // Sözleşme §13 — arama girişi `behavior="padding"` sarmalayıcısı ister (§8.2/1 dersi: Android'de
    // edge-to-edge açıkken sarmalayıcısız hiçbir şey klavyeden kaçmıyor).
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stack.Screen options={{ title: t('mobile.newMessage.title') }} />

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={theme.colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('friends.searchFriends')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.searchInput}
        />
      </View>

      <View style={styles.card}>
        <Pressable onPress={() => router.push('/new-group')} style={styles.actionRow}>
          <Ionicons name="people" size={20} color={theme.colors.textPrimary} />
          <Text style={styles.actionText}>{t('mobile.newMessage.newGroupRow')}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable onPress={() => router.push('/friends-add')} style={styles.actionRow}>
          <Ionicons name="person-add" size={20} color={theme.colors.textPrimary} />
          <Text style={styles.actionText}>{t('mobile.newMessage.addFriendRow')}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FriendPickerList
        friends={friends}
        query={query}
        selection={{ mode: 'single', onSelect, busyId: openingId }}
        emptyComponent={<Text style={styles.empty}>{t('friends.noFriends')}</Text>}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: theme.layout.panelGap,
    marginBottom: 8,
    paddingHorizontal: 14,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgSidebar,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
  },
  card: {
    marginHorizontal: theme.layout.panelGap,
    marginBottom: 8,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgSidebar,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: theme.layout.panelGap,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.borderSubtle,
    marginLeft: theme.layout.panelGap + 20 + 12,
  },
  actionText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginBottom: 8,
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.base,
    textAlign: 'center',
  },
});
