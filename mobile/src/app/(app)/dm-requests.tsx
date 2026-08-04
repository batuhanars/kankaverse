import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { dmApi, type MessageRequestDto } from '@/api/dm';
import { useDmStore } from '@/stores/dm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { extractErrorMessage } from '@/api/errors';
import { dmRouteParams } from '@/utils/dmRoute';
import { t } from '@/i18n';
import { theme } from '@/theme';

type LoadState = 'loading' | 'error' | 'ready';

// Sprint M1a contract §5 ekran 4 + §0 — DM istekleri: liste + kabul/ret. Backend uçları hazır
// (contract girişi: mobilde görünmezse kullanıcı isteği hiç göremez — "dilsizlik" T&S açısından
// kabul edilemez).
//
// Sprint M3b R6 (sahip onaylı) — üçüncü aksiyon **Reddet ve Engelle** geldi. M1a'da "web'de var ama
// DoD yalnız kabul/ret istiyor" diye atlanmıştı; oysa engellemenin gerçekten gerektiği an tam burası:
// yabancı biri mesaj isteğiyle taciz ediyorsa kullanıcı reddedip geçmek zorunda kalmamalı. Yeni uç
// YOK — `dmApi.rejectRequest`in `block` parametresi M1a'dan beri duruyordu, hep `false` geçiliyordu.
export default function DmRequestsScreen() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>('loading');
  const [items, setItems] = useState<MessageRequestDto[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);
  /** Engelleme onayı bekleyen istek — `null` ise diyalog kapalı. Kullanıcı adı mesajda geçiyor. */
  const [blockTarget, setBlockTarget] = useState<MessageRequestDto | null>(null);

  // react-hooks/set-state-in-effect — bkz. home.tsx fetchGuilds yorumu.
  const fetchRequests = useCallback(() => {
    dmApi
      .listRequests()
      .then((list) => {
        setItems(list);
        setState('ready');
      })
      .catch((e) => {
        setErrorMessage(extractErrorMessage(e));
        setState('error');
      });
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  function retry() {
    setState('loading');
    fetchRequests();
  }

  /**
   * İsteği kabul et → sohbete git. 🔴 `reject` ile **aynı kalıp**: mutasyon `useDmStore` üzerinden
   * gidiyor, doğrudan `dmApi` değil. Store `requestCount` rozetini ve kanal listesini tazeliyor —
   * kabul edilen kanal `PENDING`ten çıktığı için artık DM listesinde de anında görünüyor.
   *
   * Yönlendirme, store'un **döndürdüğü kanalla** yapılıyor: `dmRouteParams` (projedeki tek route
   * kurucusu) `canMessage`/`selfBlocked` gibi T&S bayraklarını sunucunun verdiği değerlerle taşıyor.
   * Eskiden bu ekran onları elle `'true'`/`'false'` diye gömüyordu — istemcinin kendi kararını
   * vermesi demekti; artık gömülü varsayım yok.
   */
  async function accept(item: MessageRequestDto) {
    setActingId(item.channelId);
    setErrorMessage('');
    setNotice('');
    try {
      const channel = await useDmStore.getState().acceptRequest(item.channelId);
      setItems((prev) => prev.filter((r) => r.channelId !== item.channelId));
      router.push(dmRouteParams(channel));
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setActingId(null);
    }
  }

  /**
   * Reddet (ve isteğe bağlı engelle). 🔴 Mutasyon artık `useDmStore` üzerinden gidiyor, doğrudan
   * `dmApi` değil (M1d-0 dersi): sunucu isteği düşürünce store'un `requestCount` rozeti ve engelleme
   * sonrası DM bayrakları (`canMessage`/`selfBlocked`) tazelenmeli — o yan etkinin sahibi store.
   * Yerel liste yine de anında süzülüyor, kullanıcı sunucu turunu beklemesin.
   *
   * 🔴 T&S: ret **jenerik** — karşı taraf bilgilendirilmez (`privacyNote` ekranda duruyor) ve
   * engelleyip engellemediğin ona sızmaz; iki yol da sunucuda aynı sessiz sonucu üretir.
   */
  async function reject(item: MessageRequestDto, block: boolean) {
    setActingId(item.channelId);
    setErrorMessage('');
    setNotice('');
    try {
      await useDmStore.getState().rejectRequest(item.channelId, block);
      setItems((prev) => prev.filter((r) => r.channelId !== item.channelId));
      setBlockTarget(null);
      setNotice(block ? t('messageRequests.blocked') : t('messageRequests.rejected'));
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setActingId(null);
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('messageRequests.title') }} />

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

      {/* Aksiyon geri bildirimi. Liste ekranı bir toast yüzeyine sahip değil (mobilde toast store
          yok); başarı ve hata aynı yerde, ayrı renkte gösteriliyor. */}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {state === 'ready' && errorMessage ? <Text style={styles.actionError}>{errorMessage}</Text> : null}

      {state === 'ready' && items.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>{t('messageRequests.emptyTitle')}</Text>
          <Text style={styles.emptyHint}>{t('messageRequests.emptyHint')}</Text>
        </View>
      )}

      {state === 'ready' && items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.channelId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const busy = actingId === item.channelId;
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  {item.requester?.avatarUrl ? (
                    <Image source={{ uri: item.requester.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarFallbackText}>
                        {(item.requester?.username ?? '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.username}>{item.requester?.username ?? t('notification.someone')}</Text>
                </View>
                {item.preview ? (
                  <Text style={styles.preview} numberOfLines={2}>
                    {item.preview}
                  </Text>
                ) : null}
                <View style={styles.actions}>
                  <Pressable disabled={busy} onPress={() => accept(item)} style={[styles.acceptButton, busy && styles.disabled]}>
                    <Text style={styles.acceptText}>{t('messageRequests.accept')}</Text>
                  </Pressable>
                  <Pressable disabled={busy} onPress={() => reject(item, false)} style={[styles.rejectButton, busy && styles.disabled]}>
                    <Text style={styles.rejectText}>{t('messageRequests.reject')}</Text>
                  </Pressable>
                </View>
                {/* 🔴 Görsel ağırlığı Reddet'ten DÜŞÜK (web ile aynı): dolu/kenarlıklı düğme değil,
                    tehlike renginde düz metin. Yıkıcı ve geri alınması zahmetli bir aksiyona
                    yanlışlıkla basılmasın. Dokunma hedefi yine de 44dp — silik olması küçük olması
                    demek değil. */}
                <Pressable
                  disabled={busy}
                  onPress={() => setBlockTarget(item)}
                  style={[styles.blockButton, busy && styles.disabled]}
                  accessibilityRole="button"
                  accessibilityLabel={t('messageRequests.rejectBlock')}
                >
                  <Text style={styles.blockText}>{t('messageRequests.rejectBlock')}</Text>
                </Pressable>
                <Text style={styles.privacyNote}>{t('messageRequests.privacyNote')}</Text>
              </View>
            );
          }}
        />
      )}

      {blockTarget && (
        <ConfirmDialog
          title={t('messageRequests.blockConfirmTitle')}
          message={t('messageRequests.blockConfirmMessage', {
            name: blockTarget.requester?.username ?? t('notification.someone'),
          })}
          confirmLabel={t('messageRequests.rejectBlock')}
          loading={actingId === blockTarget.channelId}
          onConfirm={() => reject(blockTarget, true)}
          onCancel={() => setBlockTarget(null)}
        />
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
    paddingHorizontal: theme.layout.panelGap * 1.5,
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
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptyHint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
  list: {
    padding: theme.layout.panelGap,
  },
  card: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgSidebar,
    padding: theme.layout.panelGap,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  username: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  preview: {
    color: theme.colors.textBody,
    fontSize: theme.fontSize.sm,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  acceptButton: {
    flex: 1,
    minHeight: theme.layout.controlSm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  rejectButton: {
    flex: 1,
    minHeight: theme.layout.controlSm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  // Düz metin düğme — zemini/kenarlığı yok (Reddet'ten silik), ama 44dp dokunma hedefi korunuyor.
  blockButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  blockText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  notice: {
    color: theme.colors.success,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 10,
  },
  actionError: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 10,
  },
  privacyNote: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    textAlign: 'center',
  },
});
