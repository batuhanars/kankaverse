import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useAuthStore } from '@/stores/auth';
import { useFriendsStore } from '@/stores/friends';
import { type FriendRequestDto } from '@/api/friends';
import { extractErrorMessage } from '@/api/errors';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1b contract §3.1 — Arkadaş Ekle tam ekran. M1a'da yeri hazırlanan geniş butondan açılır
// (DmSidebar). Kendi kod + kod-gir + bekleyen istekler tek ekranda.
//
// 🔴 Kullanıcı adıyla arama/ekleme YOK: sunucuda böyle bir uç yok (`users.controller.ts` yalnız
// `:id/card`) ve bu bir T&S duruşudur (brief §4 "ulaşımı zorlaştır"). Değişmesi kurul + sahip
// kararı ister — sözleşme §3.1.
//
// "Kopyala" + "Paylaş" — dev doğru davranıp bağımlılık için DURDU, PM `expo-clipboard`'ı onayladı
// (2026-07-30): birinci-parti Expo modülü, Expo Go ile birlikte geliyor → dev build gerektirmiyor,
// `expo-secure-store` ile aynı sınıf. `Share` React Native çekirdeğinde, ek bağımlılık yok.
export default function FriendsAddScreen() {
  const authUser = useAuthStore((s) => s.user);
  const requests = useFriendsStore((s) => s.requests);
  const state = useFriendsStore((s) => s.state);
  const errorMessage = useFriendsStore((s) => s.errorMessage);
  const fetchAll = useFriendsStore((s) => s.fetchAll);
  const sendRequest = useFriendsStore((s) => s.sendRequest);
  const acceptRequest = useFriendsStore((s) => s.acceptRequest);
  const declineRequest = useFriendsStore((s) => s.declineRequest);

  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendSuccess, setSendSuccess] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ekrandan çıkılırken bekleyen "kopyalandı" zamanlayıcısı temizlenir (unmount sonrası setState yok).
  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
  }, []);

  const load = useCallback(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    load();
  }, [load]);

  function retry() {
    useFriendsStore.setState({ state: 'loading' });
    load();
  }

  async function onSend() {
    const trimmed = code.trim().toUpperCase();
    setSendError('');
    setSendSuccess('');
    // Sözleşme §2 🔴 — `friendCode` TAM 6 KARAKTER (`send-friend-request.dto.ts` `@Length(6,6)`).
    // İstemci önden aynı kuralı uygular (ağ isteği israf edilmez), sunucu son karar mercii kalır.
    if (trimmed.length !== 6) {
      setSendError(t('friends.errors.INVALID_CODE'));
      return;
    }
    setSending(true);
    try {
      await sendRequest(trimmed);
      setCode('');
      setSendSuccess(t('friends.requestSent'));
    } catch (e) {
      setSendError(extractErrorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function onShare() {
    if (!authUser?.friendCode) return;
    try {
      await Share.share({ message: t('mobile.friends.shareMessage', { code: authUser.friendCode }) });
    } catch {
      // kullanıcı paylaşımı iptal etti / sistem paylaşım sayfasını açamadı — sessizce geç
    }
  }

  async function onCopy() {
    if (!authUser?.friendCode) return;
    // Yalnız KODU kopyala (paylaşımdaki tam cümleyi değil) — kullanıcı kodu bir alana yapıştıracak.
    await Clipboard.setStringAsync(authUser.friendCode);
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 1800);
  }

  async function onAccept(id: string) {
    setActingId(id);
    try {
      await acceptRequest(id);
    } catch {
      // liste yeniden çekilemedi — kullanıcı satırı tekrar dener
    } finally {
      setActingId(null);
    }
  }

  async function onDecline(id: string) {
    setActingId(id);
    try {
      await declineRequest(id);
    } catch {
      // sessiz — satır kalır, tekrar denenebilir
    } finally {
      setActingId(null);
    }
  }

  const incoming = requests.filter((r) => r.direction === 'incoming');
  const outgoing = requests.filter((r) => r.direction === 'outgoing');
  const noRequests = state === 'ready' && incoming.length === 0 && outgoing.length === 0;

  function renderRequestRow(item: FriendRequestDto, kind: 'incoming' | 'outgoing') {
    const busy = actingId === item.id;
    return (
      <View key={item.id} style={styles.requestRow}>
        {item.user.avatarUrl ? (
          <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarFallbackText}>{item.user.username.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.requestName} numberOfLines={1}>
          {item.user.username}
        </Text>
        {kind === 'incoming' ? (
          <View style={styles.requestActions}>
            <Pressable disabled={busy} onPress={() => onAccept(item.id)} style={styles.acceptButton}>
              <Text style={styles.acceptText}>{t('friends.accept')}</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={() => onDecline(item.id)} style={styles.declineButton}>
              <Text style={styles.declineText}>{t('friends.decline')}</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.pendingLabel}>{t('friends.pending')}</Text>
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stack.Screen options={{ title: t('friends.addTitle') }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Kendi kodum */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{t('friends.myCode')}</Text>
          <Text style={styles.codeText}>{authUser?.friendCode ?? ''}</Text>
          <View style={styles.codeActions}>
            {/* Metinler web'in mevcut anahtarlarından (`friends.copy`/`friends.copied`) — yeni anahtar
                eklenmedi, aynı bağlamın Türkçesi orada zaten kararlaştırılmış. */}
            <Pressable onPress={onCopy} style={styles.copyButton}>
              <Text style={styles.copyButtonText}>{copied ? t('friends.copied') : t('friends.copy')}</Text>
            </Pressable>
            <Pressable onPress={onShare} style={styles.shareButton}>
              <Text style={styles.shareButtonText}>{t('mobile.friends.share')}</Text>
            </Pressable>
          </View>
        </View>

        {/* Kod gir */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{t('friends.addDescription')}</Text>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder={t('friends.codePlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            style={styles.codeInput}
          />
          {sendError ? <Text style={styles.error}>{sendError}</Text> : null}
          {sendSuccess ? <Text style={styles.success}>{sendSuccess}</Text> : null}
          <Pressable
            onPress={onSend}
            disabled={sending || code.trim().length === 0}
            style={[styles.sendButton, (sending || code.trim().length === 0) && styles.disabled]}
          >
            {sending ? (
              <ActivityIndicator color={theme.colors.textPrimary} />
            ) : (
              <Text style={styles.sendButtonText}>{t('friends.addButton')}</Text>
            )}
          </Pressable>
        </View>

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

        {noRequests && <Text style={styles.empty}>{t('friends.noPending')}</Text>}

        {incoming.length > 0 && (
          <View>
            <Text style={styles.sectionLabel}>{t('friends.incoming')}</Text>
            {incoming.map((r) => renderRequestRow(r, 'incoming'))}
          </View>
        )}

        {outgoing.length > 0 && (
          <View>
            <Text style={styles.sectionLabel}>{t('friends.outgoing')}</Text>
            {outgoing.map((r) => renderRequestRow(r, 'outgoing'))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  content: {
    padding: theme.layout.panelGap,
  },
  card: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgSidebar,
    padding: theme.layout.panelGap,
    marginBottom: 16,
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  codeText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 12,
  },
  codeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  copyButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  shareButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  codeInput: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgContent,
    color: theme.colors.textPrimary,
    paddingHorizontal: 14,
    fontSize: theme.fontSize.base,
    letterSpacing: 2,
    marginBottom: 10,
  },
  sendButton: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    marginBottom: 8,
  },
  success: {
    color: theme.colors.success,
    fontSize: theme.fontSize.sm,
    marginBottom: 8,
  },
  center: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  retryButton: {
    marginTop: 10,
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 16,
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
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingVertical: 12,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
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
  requestName: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  declineButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  pendingLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
});
