import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import ReorderableList, { ScrollViewContainer, reorderItems } from 'react-native-reorderable-list';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { channelsApi, ChannelType, type ChannelSummaryDto } from '@/api/channels';
import { categoriesApi, type CategoryDto } from '@/api/categories';
import { rolesApi } from '@/api/roles';
import { extractErrorMessage } from '@/api/errors';
import { ReorderRow, type ReorderRowData } from '@/components/guild/ReorderRow';
import { ReorderSection } from '@/components/guild/ReorderSection';
import { t } from '@/i18n';
import { theme } from '@/theme';

/** `guild` = kategoriler + kanallar birlikte · `roles` = rol hiyerarşisi. */
type Kind = 'guild' | 'roles';

/**
 * Sprint M1i — **sürükle-bırak sıralama**.
 *
 * 🔴 **R1 (sahip bulgusu 2026-08-01):** ilk sürümde kategori sıralaması ayrı bir düğmede, kanal
 * sıralaması ise her kategori başlığının yanında dağınık duruyordu — sahip "kanal sıralama yok mu"
 * diye sordu, çünkü göremiyordu. Artık **tek ekran, tek giriş** (sağ üstte ikon, Roller ekranıyla
 * aynı dil): kategoriler ve her kategorinin kanalları aynı yerde, her biri kendi içinde sürüklenir.
 *
 * 🔴 **Rol pozisyonu TERSTİR.** Roller ekranda `position` DESC gösteriliyor (en üstteki en
 * yetkili). İlk sürümde en üste `position: 0` yazıyordum, yani hiyerarşiyi baş aşağı çeviriyordum —
 * "rol sıralaması yansımıyor" bulgusunun sebebi buydu. Kanal/kategoride ilk sıra 0'dır, rolde
 * **son** sıradır.
 *
 * Kütüphane seçimi (`react-native-reorderable-list`, `draggable-flatlist` DEĞİL) `ReorderRow`da
 * anlatıldı; `GestureHandlerRootView` sarmalayıcısı şart (rol renk seçicide öğrenilen ders).
 *
 * Kaydetme **bırakınca** olur, ayrı "Kaydet" yok. Sunucu reddederse liste eski hâline döner.
 */
export default function ReorderScreen() {
  const { guildId, kind } = useLocalSearchParams<{ guildId: string; kind: Kind }>();

  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [channels, setChannels] = useState<ChannelSummaryDto[]>([]);
  const [roles, setRoles] = useState<ReorderRowData[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    if (!guildId) return;
    if (kind === 'roles') {
      rolesApi
        .listByGuild(guildId)
        .then((list) => {
          setRoles(
            list
              // 🔴 `@everyone` listede YOK: sunucu onu sıralamaya kabul etmiyor (`isEveryone: false`
              // şartı). Sürüklenebilir gösterip reddettirmek yerine hiç göstermemek doğru.
              .filter((r) => !r.isEveryone)
              .sort((a, b) => b.position - a.position)
              .map((r) => ({ id: r.id, label: r.name, color: r.color })),
          );
          setState('ready');
        })
        .catch((e) => {
          setErrorMessage(extractErrorMessage(e));
          setState('error');
        });
      return;
    }

    Promise.all([categoriesApi.listByGuild(guildId), channelsApi.listByGuild(guildId)])
      .then(([cats, chans]) => {
        setCategories([...cats].sort((a, b) => a.position - b.position));
        setChannels(
          chans
            .filter((c) => c.type === ChannelType.GUILD_TEXT)
            .sort((a, b) => a.position - b.position),
        );
        setState('ready');
      })
      .catch((e) => {
        setErrorMessage(extractErrorMessage(e));
        setState('error');
      });
  }, [guildId, kind]);

  useEffect(load, [load]);

  /** Sunucu reddederse çağıran geri alsın diye fırlatmaz, `false` döner. */
  async function persist(fn: () => Promise<unknown>): Promise<boolean> {
    setErrorMessage('');
    try {
      await fn();
      return true;
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
      return false;
    }
  }

  async function saveCategories(next: ReorderRowData[]) {
    const previous = categories;
    const byId = new Map(categories.map((c) => [c.id, c]));
    setCategories(next.map((r) => byId.get(r.id)).filter((c): c is CategoryDto => !!c));
    const ok = await persist(() =>
      categoriesApi.reorder(
        guildId,
        next.map((r, i) => ({ id: r.id, position: i })),
      ),
    );
    if (!ok) setCategories(previous);
  }

  /**
   * 🔴 Bırakılan yer hem SIRAYI hem KATEGORİYİ belirler (sahip revizesi 2026-08-01).
   *
   * Sebep: kenar çubuğu kanalları önce kategoriye göre gruplayıp sonra kendi içinde `position`a
   * göre sıralıyor. Yani farklı kategorilerdeki iki kanalın bağıl sırası **hiçbir şey ifade
   * etmiyor** — düz liste, kategoriler arası sürüklemeyi mümkün göstererek yapamayacağı bir şeyi
   * vaat ediyordu. Artık vaat ediyor ve yapıyor.
   *
   * Kural basit ve tahmin edilebilir: **kanal, üstüne düştüğü satırın kategorisine katılır.** En
   * başa bırakılırsa kategorisiz olur — kenar çubuğu da kategorisizleri en üstte gösteriyor, yani
   * ekrandaki yer gerçekteki yerle aynı anlama geliyor.
   */
  async function saveChannels(next: ReorderRowData[], movedId: string) {
    const previous = channels;
    const byId = new Map(channels.map((c) => [c.id, c]));
    const movedIndex = next.findIndex((r) => r.id === movedId);
    const above = movedIndex > 0 ? byId.get(next[movedIndex - 1].id) : null;
    const newCategoryId = movedIndex === 0 ? null : (above?.categoryId ?? null);

    const reordered = next
      .map((r) => byId.get(r.id))
      .filter((c): c is ChannelSummaryDto => !!c)
      .map((c) => (c.id === movedId ? { ...c, categoryId: newCategoryId } : c));
    setChannels(reordered);

    const ok = await persist(() =>
      channelsApi.reorder(
        guildId,
        next.map((r, i) =>
          // `categoryId` YALNIZ taşınan kanal için gönderilir; diğerleri sırası değişse bile
          // kendi kategorisinde kalır (uç: undefined → değişmez).
          r.id === movedId
            ? { id: r.id, position: i, categoryId: newCategoryId }
            : { id: r.id, position: i },
        ),
      ),
    );
    if (!ok) setChannels(previous);
  }

  async function saveRoles(next: ReorderRowData[]) {
    const previous = roles;
    setRoles(next);
    // 🔴 TERS eşleme — listenin başı en YÜKSEK pozisyon. Bkz. dosya başındaki not.
    const items = next.map((r, i) => ({ id: r.id, position: next.length - 1 - i }));
    const ok = await persist(() => rolesApi.reorder(guildId, items));
    if (!ok) setRoles(previous);
  }

  /**
   * Düz kanal listesi — **kenar çubuğuyla AYNI sırada**: önce kategorisizler, sonra kategoriler
   * kendi sıralarında, her biri kendi içinde `position`a göre. Ekrandaki sıra gerçekteki sırayla
   * birebir olmazsa "sürükledim ama değişmedi" hissi doğar.
   */
  const categoryName = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.name ?? '') : t('mobile.reorder.uncategorized');

  const inCategory = (id: string | null) =>
    channels.filter((c) => c.categoryId === id).sort((a, b) => a.position - b.position);

  const channelRows: ReorderRowData[] = [
    ...inCategory(null),
    ...categories.flatMap((cat) => inCategory(cat.id)),
  ].map((c) => ({ id: c.id, label: c.name ?? '', sublabel: categoryName(c.categoryId) }));

  return (
    <GestureHandlerRootView style={styles.flex}>
      <Stack.Screen options={{ title: t('mobile.reorder.title') }} />

      {state === 'loading' ? (
        <ActivityIndicator color={theme.colors.accent500} style={styles.spinner} />
      ) : state === 'error' ? (
        <Text style={styles.error}>{errorMessage}</Text>
      ) : kind === 'roles' ? (
        <>
          <Text style={styles.hint}>{t('mobile.reorder.rolesHint')}</Text>
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          <ReorderableList
            data={roles}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onReorder={({ from, to }) => saveRoles(reorderItems(roles, from, to))}
            ListEmptyComponent={<Text style={styles.empty}>{t('mobile.reorder.empty')}</Text>}
            renderItem={({ item }) => <ReorderRow row={item} />}
          />
        </>
      ) : (
        // `ScrollViewContainer` — iç içe sürüklenebilir listelerin ortak kaydırma kabı. Normal
        // ScrollView kullanılırsa iç listelerin sürüklemesi dış kaydırmayla çakışır.
        <ScrollViewContainer contentContainerStyle={styles.body}>
          <Text style={styles.hint}>{t('mobile.reorder.channelsHint')}</Text>
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <ReorderSection
            title={t('mobile.reorder.categoriesSection')}
            rows={categories.map((c) => ({ id: c.id, label: c.name }))}
            onReorder={(next) => saveCategories(next)}
            emptyHint={t('mobile.reorder.noCategories')}
          />

          {/* 🔴 Kanal listesi TEK ve DÜZ (sahip revizesi 2026-08-01): önce kategorilere bölünmüştü
              ve tek bir işi (kanal sırası) üç ayrı listeye dağıtıyordu — asıl kafa karıştıran oydu.
              Kanalın hangi kategoride olduğunu satırın kendisi söylüyor.

              Bölmeden sıralamak GEÇERLİ: sunucu `position`ı düz bir sayı olarak tutuyor, kenar
              çubuğu ise kanalları önce kategoriye göre grupluyor, sonra kendi içinde position'a
              göre sıralıyor. Yani kategoriler arası mutlak değerler önemsiz, kategori İÇİNDEKİ
              bağıl sıra önemli — düz listede sürüklerken korunan da bu. */}
          <ReorderSection
            title={t('mobile.reorder.channelsSection')}
            rows={channelRows}
            onReorder={(nextRows, movedId) => saveChannels(nextRows, movedId)}
            emptyHint={t('channel.noChannels')}
          />

        </ScrollViewContainer>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  spinner: { marginTop: theme.layout.panelGap * 2 },
  body: { paddingVertical: 12, paddingBottom: theme.layout.panelGap * 2 },
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
    paddingHorizontal: theme.layout.panelGap,
    paddingBottom: 12,
  },
  list: { padding: theme.layout.panelGap, gap: 8 },
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
    paddingBottom: 8,
  },
});
