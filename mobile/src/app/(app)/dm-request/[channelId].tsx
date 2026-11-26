import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useDmStore } from '@/stores/dm';
import { showToast } from '@/stores/toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RequestAvatar } from '@/components/dm/RequestAvatar';
import { extractErrorMessage } from '@/api/errors';
import { useRequestPreviews } from '@/components/home/useRequestPreviews';
import { dmRouteParams } from '@/utils/dmRoute';
import { formatDateTime } from '@/utils/formatDateTime';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * C75 Rev.7 — tek mesaj isteğinin detayı: mesajın tamamı + Kabul / Reddet / Reddet ve Engelle.
 * Bu ekranın açılması o isteği "görüldü" yapar (yalnız o isteği; sayfa listesi değil).
 *
 * 🔴 T&S (R7): "görüldü" alıcıya özeldir, istek sahibine okundu bilgisi GİTMEZ (sunucu `lastReadAt`e
 * dokunmaz). Ret jeneriktir, engelleyip engellemediğin karşı tarafa sızmaz.
 */
export default function DmRequestDetailScreen() {
  const router = useRouter();
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const item = useDmStore((s) => s.requests.find((r) => r.channelId === channelId) ?? null);
  const [acting, setActing] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  /** Ekrandan kendi eylemimizle çıkıyoruz: istek listeden düşünce ikinci kez geri gidilmesin. */
  const leaving = useRef(false);
  const everSeen = useRef(false);

  // Açılış: o istek görüldü. Store çift çağrıyı kendisi önler (görülmüşse sunucuya gitmez).
  useEffect(() => {
    if (item) void useDmStore.getState().markRequestSeen(item.channelId);
  }, [item]);

  // İstek başka cihazda çözüldüyse (ya da hiç yoksa) ekranda bayat içerik bırakma: listeye dön.
  useEffect(() => {
    if (item) {
      everSeen.current = true;
      return;
    }
    if (leaving.current) return;
    if (everSeen.current) {
      router.back();
      return;
    }
    // Store boşken (ör. uygulama soğuk açılıp doğrudan buraya gelindi) bir kez tazele.
    void useDmStore
      .getState()
      .refreshRequests()
      .then(() => {
        const found = useDmStore.getState().requests.some((r) => r.channelId === channelId);
        if (!found && !leaving.current) router.back();
      });
  }, [item, channelId, router]);

  const previewOf = useRequestPreviews(item ? [item] : []);

  async function accept() {
    if (!item) return;
    setActing(true);
    // Eylem bitince store isteği düşürür; o an "başka cihazda çözüldü" efekti geri gitmesin diye önceden.
    leaving.current = true;
    try {
      const channel = await useDmStore.getState().acceptRequest(item.channelId);
      router.replace(dmRouteParams(channel));
    } catch (e) {
      leaving.current = false;
      showToast(extractErrorMessage(e));
      setActing(false);
    }
  }

  async function reject(block: boolean) {
    if (!item) return;
    setActing(true);
    leaving.current = true; // bkz. accept
    try {
      await useDmStore.getState().rejectRequest(item.channelId, block);
      showToast(block ? t('messageRequests.blocked') : t('messageRequests.rejected'));
      router.back();
    } catch (e) {
      leaving.current = false;
      showToast(extractErrorMessage(e));
      setActing(false);
      setConfirmBlock(false);
    }
  }

  if (!item) {
    return (
      <View style={[styles.flex, styles.center]}>
        <Stack.Screen options={{ title: t('messageRequests.title') }} />
        <ActivityIndicator color={theme.colors.accent500} />
      </View>
    );
  }

  const name = item.requester?.username ?? t('notification.someone');
  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: name }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <RequestAvatar requester={item.requester} size={56} />
          <View style={styles.headerText}>
            <Text style={styles.username} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.time}>{formatDateTime(new Date(item.createdAt).getTime())}</Text>
          </View>
        </View>

        <View style={styles.messageBox}>
          <Text style={styles.messageLabel}>{t('messageRequests.messageLabel')}</Text>
          <Text style={styles.messageText} selectable>
            {previewOf(item)}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            disabled={acting}
            onPress={() => void accept()}
            style={[styles.acceptButton, acting && styles.disabled]}
          >
            <Text style={styles.acceptText}>{t('messageRequests.accept')}</Text>
          </Pressable>
          <Pressable
            disabled={acting}
            onPress={() => void reject(false)}
            style={[styles.rejectButton, acting && styles.disabled]}
          >
            <Text style={styles.rejectText}>{t('messageRequests.reject')}</Text>
          </Pressable>
        </View>
        {/* Görsel ağırlığı Reddet'ten DÜŞÜK: tehlike renginde düz metin, ama 44dp dokunma hedefi. */}
        <Pressable
          disabled={acting}
          onPress={() => setConfirmBlock(true)}
          style={[styles.blockButton, acting && styles.disabled]}
          accessibilityRole="button"
        >
          <Text style={styles.blockText}>{t('messageRequests.rejectBlock')}</Text>
        </Pressable>
        <Text style={styles.privacyNote}>{t('messageRequests.privacyNote')}</Text>
      </ScrollView>

      {confirmBlock && (
        <ConfirmDialog
          title={t('messageRequests.blockConfirmTitle')}
          message={t('messageRequests.blockConfirmMessage', { name })}
          confirmLabel={t('messageRequests.rejectBlock')}
          loading={acting}
          onConfirm={() => void reject(true)}
          onCancel={() => setConfirmBlock(false)}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: theme.layout.panelGap,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '600',
  },
  time: {
    marginTop: 2,
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
  messageBox: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.bgElevated,
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 12,
    marginBottom: 24,
  },
  messageLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  messageText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  acceptButton: {
    flex: 1,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  rejectButton: {
    flex: 1,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
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
  privacyNote: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    textAlign: 'center',
  },
});
