import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FriendDto } from '@/api/friends';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  /** Seçilme sırasına göre (Set insertion order korunur — çağıran taraf `Array.from(selected)` verir). */
  selectedFriends: FriendDto[];
  query: string;
  onChangeQuery: (query: string) => void;
  onRemove: (userId: string) => void;
  placeholder: string;
}

/**
 * R3 revizyonu — grup kurma arama çubuğu "çipli" hâle geliyor (sahip Discord referansı verdi):
 * seçili kişiler avatar+kullanıcı adı çipi olarak çubuğun İÇİNDE görünür, yanında yazılabilir alan
 * kalır. Yalnız `new-group.tsx`'in çoklu-seçim arama satırının yerini alıyor — `new-message.tsx`
 * tek-seçim akışında kullanılmıyor (tek seçimde çip kavramı anlamsız, seçilen kişi zaten ekranı
 * kapatıp DM'e gidiyor). `FriendPickerList` bu yüzden kırılmadı: o hâlâ süzülmüş listeyi + seçim
 * kutusunu çiziyor, bu bileşen yalnız üstteki arama/çip satırını çiziyor.
 */
export function SelectedFriendsField({ selectedFriends, query, onChangeQuery, onRemove, placeholder }: Props) {
  function onKeyPress(e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    // "Boş alanda backspace son çipi kaldırırsa iyi olur" (R3 §3, opsiyonel ama tek satırlık iş) —
    // yalnız yazı alanı BOŞKEN tetiklenir, yoksa normal metin silme sırasında son seçimi kaybederdik.
    if (e.nativeEvent.key === 'Backspace' && query.length === 0 && selectedFriends.length > 0) {
      onRemove(selectedFriends[selectedFriends.length - 1].user.id);
    }
  }

  return (
    <View style={styles.row}>
      <Ionicons name="search" size={18} color={theme.colors.textMuted} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
      >
        {selectedFriends.map((friend) => (
          <Pressable
            key={friend.user.id}
            onPress={() => onRemove(friend.user.id)}
            style={styles.chip}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.newGroup.removeSelected', { username: friend.user.username })}
          >
            {friend.user.avatarUrl ? (
              <Image source={{ uri: friend.user.avatarUrl }} style={styles.chipAvatar} />
            ) : (
              <View style={[styles.chipAvatar, styles.chipAvatarFallback]}>
                <Text style={styles.chipAvatarText}>{friend.user.username.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.chipName} numberOfLines={1}>
              {friend.user.username}
            </Text>
            <Ionicons name="close" size={12} color={theme.colors.textSecondary} />
          </Pressable>
        ))}
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          onKeyPress={onKeyPress}
          placeholder={selectedFriends.length === 0 ? placeholder : undefined}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: theme.layout.panelGap,
    marginBottom: 8,
    paddingHorizontal: 12,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgSidebar,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexGrow: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.accentSubtle,
  },
  chipAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  chipAvatarFallback: {
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipAvatarText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  chipName: {
    maxWidth: 110,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  input: {
    minWidth: 60,
    flexGrow: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    paddingVertical: 0,
  },
});
