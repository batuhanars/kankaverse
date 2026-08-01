import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import ReorderableList, { reorderItems } from 'react-native-reorderable-list';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { rolesApi } from '@/api/roles';
import { extractErrorMessage } from '@/api/errors';
import { ReorderRow, type ReorderRowData } from '@/components/guild/ReorderRow';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1i — **rol hiyerarşisi sıralaması** (sürükle-bırak).
 *
 * 🔴 **Kanal/kategori sıralaması BİLİNÇLİ OLARAK YOK** (sahip kararı 2026-08-01). Yapılmıştı ve
 * çalışıyordu, sonra kaldırıldı; sebebi kod değil kapsam:
 * - **Discord mobilde de koymamış**, yalnız rollerde var. Bizden çok daha fazla kullanım verisine
 *   bakan bir ekibin kararı; kanal sırası kurulum anında bir kez yapılan bir iş.
 * - Web'de zaten var ve doğal yeri orası.
 * - Tek ekranda beş revize turu döndü — harcanan emek özelliğin değerini aştı.
 *
 * Geri istenirse git geçmişinde duruyor (birleşik liste + `reorderModel.ts`, 2026-08-01).
 * Rol sırası KALIYOR: hiyerarşi bir yetki kavramı, moderasyon sırasında mobilden ayarlanıyor.
 *
 * 🔴 **Rol pozisyonu TERSTİR.** Roller `position` DESC gösteriliyor (en üstteki en yetkili); ilk
 * sürümde en üste `position: 0` yazıp hiyerarşiyi baş aşağı çevirmiştim — "sıralama yansımıyor"
 * bulgusunun sebebi buydu. Listenin başı **en yüksek** pozisyondur.
 *
 * `GestureHandlerRootView` şart — jest tanınmazsa sürükleme sessizce çalışmaz (rol renk
 * seçicisinde öğrenilen ders). Kaydetme bırakınca olur, ayrı "Kaydet" yok.
 */
export default function ReorderScreen() {
  const { guildId } = useLocalSearchParams<{ guildId: string }>();

  const [rows, setRows] = useState<ReorderRowData[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    if (!guildId) return;
    rolesApi
      .listByGuild(guildId)
      .then((list) => {
        setRows(
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
  }, [guildId]);

  useEffect(load, [load]);

  async function onReorder(from: number, to: number) {
    const previous = rows;
    const next = reorderItems(rows, from, to);
    setRows(next);
    setErrorMessage('');
    // 🔴 TERS eşleme — listenin başı en YÜKSEK pozisyon.
    const items = next.map((r, i) => ({ id: r.id, position: next.length - 1 - i }));
    try {
      await rolesApi.reorder(guildId, items);
    } catch (e) {
      // Sunucu reddetti (yetki / hiyerarşi) → görüntü gerçeğe döner, sebep yazılır.
      setErrorMessage(extractErrorMessage(e));
      setRows(previous);
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
          <Text style={styles.hint}>{t('mobile.reorder.rolesHint')}</Text>
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <ReorderableList
            data={rows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onReorder={({ from, to }) => onReorder(from, to)}
            ListEmptyComponent={<Text style={styles.empty}>{t('mobile.reorder.empty')}</Text>}
            renderItem={({ item }) => <ReorderRow row={item} />}
          />
        </>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  spinner: { marginTop: theme.layout.panelGap * 2 },
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 12,
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
    paddingTop: 8,
  },
});
