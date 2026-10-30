import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShareTargetList, type ShareTarget } from '@/components/share/ShareTargetList';
import { SharePreview } from '@/components/share/SharePreview';
import { useShareIntentStore, type SharePayload } from '@/stores/shareIntent';
import { sendShare, type ShareFailure, type UploadedMap } from '@/utils/shareSend';
import { t } from '@/i18n';
import { theme } from '@/theme';
import { MAX_ATTACHMENTS_PER_MESSAGE } from '@/utils/attachmentUpload';

// C41 - "Nereye gönderilsin?" Başka uygulamadan paylaşılan içerik bellekte (`stores/shareIntent`)
// bekler; hedef seçilip gönderilince (ya da vazgeçilince) silinir. Yönlendirme `(app)/_layout.tsx`te.
function ShareBody({ payload }: { payload: SharePayload }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<ShareTarget | null>(null);
  const [note, setNote] = useState(payload.text ?? '');
  const [sending, setSending] = useState(false);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  // Klavye payı: MessageScreen'de cihazda ölçülerek kurulan formülün aynısı (KAV Android edge-to-edge'de güvenilmez,
  // not alanı klavyenin arkasında kalıyordu). Pay = klavye yüksekliği + alt güvenli alan; klavye kapalıyken alt güvenli alan.
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(Math.round(e.endCoordinates.height)));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const bottomPad = keyboardHeight > 0 ? keyboardHeight + insets.bottom : insets.bottom;
  const [failures, setFailures] = useState<ShareFailure[]>([]);
  // Yeniden denemede başarıyla yüklenmiş dosyalar tekrar yüklenmez.
  const uploaded = useRef<UploadedMap>(new Map());
  // Mesaj gitti ama bazı dosyalar gidemedi: ikinci kez göndermek yerine sohbet açılır.
  const [partiallySent, setPartiallySent] = useState(false);

  const hasContent = payload.files.length > 0 || note.trim().length > 0;
  const canSend = !!target && hasContent && !sending && !partiallySent;

  async function onSend() {
    if (!target || !canSend) return;
    setSending(true);
    setError('');
    setFailures([]);
    const res = await sendShare({
      channelId: target.id,
      files: payload.files,
      note,
      uploaded: uploaded.current,
      onLabel: setLabel,
    });
    setSending(false);
    setLabel('');
    if (res.sent && res.failures.length === 0) {
      useShareIntentStore.getState().clear();
      router.replace(target.href);
      return;
    }
    setFailures(res.failures);
    setPartiallySent(!!res.sent);
    if (res.sendError) setError(res.sendError);
  }

  return (
    <View style={[styles.flex, { paddingBottom: bottomPad }]}>
      <Stack.Screen options={{ title: t('mobile.share.title') }} />
      <SharePreview files={payload.files} text={payload.files.length ? null : payload.text} />
      {payload.truncated ? (
        <Text style={styles.warn}>{t('mobile.share.truncated', { count: MAX_ATTACHMENTS_PER_MESSAGE })}</Text>
      ) : null}

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={theme.colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('mobile.share.searchPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.searchInput}
        />
      </View>

      <View style={styles.flex}>
        <ShareTargetList query={query} selectedId={target?.id ?? null} disabled={sending} onSelect={setTarget} />
      </View>

      <View style={styles.footer}>
        {failures.length > 0 ? (
          <View>
            <Text style={styles.error}>
              {t(partiallySent ? 'mobile.share.partialTitle' : 'mobile.share.failedTitle')}
            </Text>
            {failures.map((f, i) => (
              <Text key={`${i}-${f.name}`} style={styles.failure}>
                {f.name}: {f.reason}
              </Text>
            ))}
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {sending ? <Text style={styles.progress}>{label || t('mobile.share.sending')}</Text> : null}

        <TextInput
          value={note}
          onChangeText={setNote}
          editable={!sending}
          multiline
          placeholder={t(payload.files.length ? 'mobile.share.notePlaceholder' : 'mobile.share.textPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.noteInput}
        />
        <View style={styles.actions}>
          {partiallySent && target ? (
            <Pressable
              onPress={() => {
                useShareIntentStore.getState().clear();
                router.replace(target.href);
              }}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>{t('mobile.share.openChat')}</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onSend}
            disabled={!canSend}
            style={[styles.send, !canSend && styles.sendOff]}
            accessibilityRole="button"
          >
            {sending ? (
              <ActivityIndicator color={theme.colors.textPrimary} />
            ) : (
              <Text style={styles.sendText}>{t('mobile.share.send')}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function ShareScreen() {
  const router = useRouter();
  const payload = useShareIntentStore((s) => s.payload);

  // Ekrandan çıkış (geri, başarı, vazgeçme) paylaşımı bellekten siler.
  useEffect(() => () => useShareIntentStore.getState().clear(), []);

  // Paylaşım yoksa (örn. süreç yeniden başladı) ekranın içeriği kalmaz: geri dön.
  useEffect(() => {
    if (!payload) {
      if (router.canGoBack()) router.back();
      else router.replace('/home');
    }
  }, [payload, router]);

  if (!payload) return null;
  // `key`: ikinci bir paylaşım gelirse ekran durumu sıfırlanır.
  return <ShareBody key={payload.id} payload={payload} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  warn: {
    color: theme.colors.warning,
    fontSize: theme.fontSize.sm,
    marginHorizontal: theme.layout.panelGap,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: theme.layout.panelGap,
    marginBottom: 4,
    paddingHorizontal: 14,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgSidebar,
  },
  searchInput: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
  footer: {
    padding: theme.layout.panelGap,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.bgSidebar,
  },
  noteInput: {
    maxHeight: 120,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  send: {
    minWidth: 110,
    minHeight: theme.layout.inputMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent600,
    paddingHorizontal: 18,
  },
  sendOff: { opacity: 0.4 },
  sendText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base, fontWeight: '700' },
  secondary: {
    minHeight: theme.layout.inputMinHeight,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryText: { color: theme.colors.accent400, fontSize: theme.fontSize.base, fontWeight: '600' },
  progress: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
  failure: { color: theme.colors.textBody, fontSize: theme.fontSize.sm },
});
