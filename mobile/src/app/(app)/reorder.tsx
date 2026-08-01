import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ReorderableList, { reorderItems, useReorderableDrag } from 'react-native-reorderable-list';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { channelsApi, ChannelType } from '@/api/channels';
import { categoriesApi } from '@/api/categories';
import { rolesApi } from '@/api/roles';
import { extractErrorMessage } from '@/api/errors';
import { t } from '@/i18n';
import { theme } from '@/theme';

type Kind = 'channels' | 'categories' | 'roles';

interface Row {
  id: string;
  label: string;
  color?: string;
}

/**
 * Sprint M1i — **sürükle-bırak sıralama** (kanal · kategori · rol).
 *
 * Üç uç da aynı gövdeyi alıyor (`{ id, position }[]`), üç liste de aynı etkileşimi istiyor →
 * tek ekran, `kind` parametresiyle. Üç ayrı ekran yazmak aynı kodu üç kez yazmak olurdu.
 *
 * 🔴 **Kütüphane seçimi bilinçli:** `react-native-draggable-flatlist` DEĞİL. Onun peer bildirimi
 * `reanimated >=2.8.0` diyor — bugün uygulamayı çökerten `reanimated-color-picker`'ın (`>=2.0.0`)
 * aynı deseni ve son sürümü eski. `react-native-reorderable-list` `>=3.12.0` istiyor, yani modern
 * Reanimated'a karşı bakım görüyor; ayrıca kaldırılan `addWhitelistedNativeProps` API'sini
 * çağırmadığı **doğrulandı** (kaynak tarandı, peer aralığına güvenilmedi).
 *
 * `GestureHandlerRootView` sarmalayıcısı ŞART — jest tanınmazsa sürükleme sessizce çalışmaz
 * (rol renk seçicide öğrenilen ders).
 *
 * Kaydetme **bırakınca** olur, ayrı bir "Kaydet" yok: sıralama tek hamlelik bir iş, onay istemek
 * her sürüklemeye ikinci bir dokunuş ekler. Sunucu reddederse liste eski hâline döner ve sebep yazılır.
 */
export default function ReorderScreen() {
  const { guildId, kind, categoryId } = useLocalSearchParams<{
    guildId: string;
    kind: Kind;
    categoryId?: string;
  }>();

  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!guildId) return;
    const fetch =
      kind === 'categories'
        ? categoriesApi
            .listByGuild(guildId)
            .then((list) =>
              [...list].sort((a, b) => a.position - b.position).map((c) => ({ id: c.id, label: c.name })),
            )
        : kind === 'roles'
          ? rolesApi.listByGuild(guildId).then((list) =>
              [...list]
                // 🔴 `@everyone` listeden ÇIKARILIR: sunucu onu sıralamaya kabul etmiyor
                // (`reorderRoles` "@everyone hariç"). Sürüklenebilir gösterip reddettirmek yerine
                // hiç göstermemek doğru.
                .filter((r) => !r.isEveryone)
                .sort((a, b) => b.position - a.position)
                .map((r) => ({ id: r.id, label: r.name, color: r.color })),
            )
          : channelsApi.listByGuild(guildId).then((list) =>
              list
                .filter((c) => c.type === ChannelType.GUILD_TEXT)
                .filter((c) => (categoryId ? c.categoryId === categoryId : !c.categoryId))
                .sort((a, b) => a.position - b.position)
                .map((c) => ({ id: c.id, label: c.name ?? '' })),
            );

    fetch
      .then((list) => {
        setRows(list);
        setState('ready');
      })
      .catch((e) => {
        setErrorMessage(extractErrorMessage(e));
        setState('error');
      });
  }, [guildId, kind, categoryId]);

  useEffect(load, [load]);

  async function persist(next: Row[]) {
    const previous = rows;
    setRows(next);
    setSaving(true);
    setErrorMessage('');
    const items = next.map((r, i) => ({ id: r.id, position: i }));
    try {
      if (kind === 'categories') await categoriesApi.reorder(guildId, items);
      else if (kind === 'roles') await rolesApi.reorder(guildId, items);
      else await channelsApi.reorder(guildId, items);
    } catch (e) {
      // Sunucu reddetti → görüntü gerçeğe geri döner. Yetkisiz kullanıcıya "sıraladım" yalanı
      // söylenmez (yetki kapısı sunucuda: OWNER/ADMIN).
      setRows(previous);
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <Stack.Screen options={{ title: t('mobile.reorder.title') }} />

      {state === 'loading' ? (
        <ActivityIndicator color={theme.colors.accent500} style={styles.spinner} />
      ) : state === 'error' ? (
        <Text style={styles.error}>{errorMessage}</Text>
      ) : (
        <>
          <Text style={styles.hint}>{t('mobile.reorder.hint')}</Text>
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          {saving ? <ActivityIndicator color={theme.colors.textMuted} style={styles.savingBar} /> : null}

          <ReorderableList
            data={rows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onReorder={({ from, to }) => persist(reorderItems(rows, from, to))}
            ListEmptyComponent={<Text style={styles.empty}>{t('mobile.reorder.empty')}</Text>}
            renderItem={({ item }) => <ReorderRow row={item} />}
          />
        </>
      )}
    </GestureHandlerRootView>
  );
}

/**
 * Sürüklenebilir satır. `useReorderableDrag` **liste öğesinin içinden** çağrılmak zorunda —
 * bu yüzden ayrı bir bileşen; ekranın gövdesinde çağrılamaz.
 *
 * Satırın TAMAMI tutamaç (uzun basış): ayrı bir tutamaç ikonuna basmak dokunma hedefini
 * küçültürdü. İkon yine duruyor ama yalnız ipucu olarak.
 */
function ReorderRow({ row }: { row: Row }) {
  const drag = useReorderableDrag();
  return (
    <Pressable onLongPress={drag} delayLongPress={200} style={styles.row}>
      <Ionicons name="reorder-three" size={20} color={theme.colors.textMuted} />
      {row.color ? <View style={[styles.dot, { backgroundColor: row.color }]} /> : null}
      <Text style={styles.label} numberOfLines={1}>
        {row.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  spinner: { marginTop: theme.layout.panelGap * 2 },
  savingBar: { marginBottom: 4 },
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 12,
  },
  list: { padding: theme.layout.panelGap, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  label: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginTop: theme.layout.panelGap,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 10,
  },
});
