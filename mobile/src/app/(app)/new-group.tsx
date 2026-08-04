import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useFriendsStore } from '@/stores/friends';
import { useDmStore } from '@/stores/dm';
import type { FriendDto } from '@/api/friends';
import { FriendPickerList } from '@/components/FriendPickerList';
import { SelectedFriendsField } from '@/components/SelectedFriendsField';
import { extractErrorMessage } from '@/api/errors';
import { dmRouteParams } from '@/utils/dmRoute';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sözleşme §13 🔴 tuzak #1 — sayaç "n/10" DEĞİL "n/9". Discord kendini sayıp 1/10 gösteriyor;
// bizim sunucu `api/src/modules/dm/dto/create-group-dm.dto.ts` `@ArrayMaxSize(9)` ile 9 BAŞKA üye
// kabul ediyor (+ kendisi = 10 kişi toplam). Sınır DOSYADAN doğrulandı, Discord'un sayısı
// kopyalanmadı. Seçim bu sabite ulaşınca (§13/4) FriendPickerList `maxReached` ile daha fazla
// seçime izin vermiyor.
const GROUP_MEMBER_LIMIT = 9;

// Sprint M1b Revizyon R2 (§13) — Grup DM kurma, "Yeni Mesaj" ekranından adı konmuş ayrı bir giriş
// (eskiden new-chat.tsx'te örtük bir 2+ seçim dalıydı). Yönetim (ad değiştir/üye ekle-çıkar/ayrıl/
// sil) M3b §2.4 ile DM detay ekranının ⋯ menüsünde, bu ekran yalnız KURMA.
export default function NewGroupScreen() {
  const router = useRouter();
  const friends = useFriendsStore((s) => s.friends);
  const fetchFriends = useFriendsStore((s) => s.fetchAll);
  const createGroup = useDmStore((s) => s.createGroup);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else if (next.size < GROUP_MEMBER_LIMIT) next.add(userId);
      return next;
    });
  }

  // R3 — kişi seçilince (eklenirken) arama metni temizlenir, kişi çipe döner (Discord deseni).
  // Çipten çıkarırken (zaten seçiliyken tekrar dokununca) metni temizlemeye gerek yok, o yüzden
  // yalnız "daha önce seçili değildi" dalında çağrılır.
  function onToggleFriend(userId: string) {
    const wasSelected = selected.has(userId);
    toggle(userId);
    if (!wasSelected) setQuery('');
  }

  // Seçim sırası korunur (Set insertion order) — çip satırı kullanıcının seçtiği sırayla akar.
  const selectedFriends = useMemo(
    () =>
      Array.from(selected)
        .map((id) => friends.find((f) => f.user.id === id))
        .filter((f): f is FriendDto => Boolean(f)),
    [selected, friends],
  );

  async function onCreate() {
    if (selected.size === 0 || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      // Sözleşme §3.3 🔴 T&S — grup kurma minöre kapalı (`GROUP_MINOR_FORBIDDEN`) + üyeler kanka
      // olmak zorunda (`NOT_FRIEND`). Sunucu bu retleri jenerik verir; istemci sebebi tahmin
      // ETMEZ, extractErrorMessage sunucunun Türkçe mesajını gösterir (statü sızdırmaz).
      // R3 — grup adsız kurulur (`name` DTO'da opsiyonel); adlandırma DM detayının ⋯ menüsünde.
      const channel = await createGroup(Array.from(selected));
      router.replace(dmRouteParams(channel));
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  const canCreate = selected.size > 0 && !submitting;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stack.Screen options={{ title: t('mobile.newGroup.title') }} />

      <View style={styles.headerRow}>
        <Text style={styles.counter}>
          {t('mobile.newGroup.memberCount', { n: selected.size, max: GROUP_MEMBER_LIMIT })}
        </Text>
        <Pressable
          onPress={onCreate}
          disabled={!canCreate}
          style={[styles.createButton, !canCreate && styles.disabled]}
        >
          {submitting ? (
            <ActivityIndicator color={theme.colors.textPrimary} />
          ) : (
            <Text style={styles.createButtonText}>{t('mobile.newGroup.create')}</Text>
          )}
        </Pressable>
      </View>

      <SelectedFriendsField
        selectedFriends={selectedFriends}
        query={query}
        onChangeQuery={setQuery}
        onRemove={onToggleFriend}
        placeholder={t('friends.searchFriends')}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FriendPickerList
        friends={friends}
        query={query}
        selection={{
          mode: 'multi',
          selectedIds: selected,
          onToggle: onToggleFriend,
          maxReached: selected.size >= GROUP_MEMBER_LIMIT,
        }}
        emptyComponent={
          // Sözleşme §13/5 — grup ekranında boş durum + kanka ekleme yönlendirmesi (sahte satır
          // değil, gerçek bir hedefe giden buton).
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>{t('friends.noFriends')}</Text>
            <Pressable onPress={() => router.push('/friends-add')} style={styles.emptyAddButton}>
              <Text style={styles.emptyAddButtonText}>{t('friends.add')}</Text>
            </Pressable>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: theme.layout.panelGap,
    paddingBottom: 10,
  },
  counter: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  createButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  createButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: 12,
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.base,
    textAlign: 'center',
  },
  emptyAddButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyAddButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
});
