import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Platform,
  ToastAndroid,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { aiVideoApi, type AiVideoDto } from '@/api/aiVideo';
import type { PickedProfileMedia } from '@/utils/animatedMedia';
import { useAuthStore } from '@/stores/auth';
import { useAiVideoViewerStore } from '@/stores/aiVideoViewer';
import { ConfirmDialog } from '../ConfirmDialog';
import { EmailVerificationBanner } from '../EmailVerificationBanner';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { t } from '@/i18n';
import { theme } from '@/theme';
import { AiVideoCostBar } from './AiVideoCostBar';
import { AiVideoForm } from './AiVideoForm';
import { AiVideoPreview } from './AiVideoPreview';
import { AiVideoTargetPicker } from './AiVideoTargetPicker';
import { AiVideoProgress } from './AiVideoProgress';
import { AiVideoRecentList } from './AiVideoRecentList';
import { useAiVideo } from './useAiVideo';
import { useAiVideoActions } from './useAiVideoActions';

interface Props {
  visible: boolean;
  /**
   * chat: mesaj kutusundan (Kaydet ve gönder) · media: profil/ortam görseli (Kullan) ·
   * view: bildirimden (C49): izle + kaydet + hedef seçip gönder (R1), kullan yok.
   */
  mode: 'chat' | 'media' | 'view';
  /** view: açılışta bu üretim getirilir; tamamlanmışsa önizleme açık gelir. */
  initialId?: string | null;
  onClose: () => void;
  onSend?: (attachmentId: string) => void;
  onUse?: (media: Extract<PickedProfileMedia, { kind: 'video' }>) => void;
}

/** Klavye açıkken alt güvenli alan payı gereksiz (klavye zaten örtüyor). */
function useKeyboardVisible(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setShown(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setShown(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return shown;
}

/**
 * Sprint C14d: yapay zeka video alt sayfası (web `AiVideoDialog`). İki görünüm, aynı anda biri: form
 * (seçici / istem / ilerleme / son üretimler, düğmesiz) ve önizleme (tek videonun düğmeleri).
 * Gövde yalnız sayfa AÇIKKEN monte edilir: kapanınca yoklama durur, seçenekler sayfa her açılışında tazelenir.
 */
export function AiVideoSheet({ visible, ...rest }: Props) {
  // Android geri tuşu: önce iç katman (hedef seçici) kapanır, işlenmediyse sayfa.
  const backRef = useRef<() => boolean>(() => false);
  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={() => {
        if (!backRef.current()) rest.onClose();
      }}
    >
      {visible ? <SheetBody {...rest} backRef={backRef} /> : null}
    </Modal>
  );
}

function SheetBody({
  mode,
  initialId,
  onClose,
  onSend,
  onUse,
  backRef,
}: Omit<Props, 'visible'> & { backRef: MutableRefObject<() => boolean> }) {
  const { height } = useWindowDimensions();
  const bottomInset = useSheetInsets();
  const keyboard = useKeyboardVisible();
  const ai = useAiVideo();
  const unverified = useAuthStore((s) => s.user?.emailVerified === false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [picking, setPicking] = useState(false);
  const [sendingTo, setSendingTo] = useState(false);
  const [pickError, setPickError] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  backRef.current = () => {
    if (!picking) return false;
    setPicking(false);
    setPickError('');
    return true;
  };
  const promptY = useRef(0);
  const actions = useAiVideoActions({
    mode,
    setBusy: ai.setBusy,
    setError: ai.setError,
    onSend: (id) => onSend?.(id),
    onUse: (m) => onUse?.(m),
  });
  const { row } = actions;

  // C49: açık sayfa sayısı (sohbet/medya/view hepsi). Ön plan bildirim süzgeci okur.
  // C49 R3: sayfa kapanırken süren üretim varsa kısa bilgi (ToastAndroid; iOS'ta Alert yedeği).
  useEffect(() => {
    useAiVideoViewerStore.getState().sheetOpened();
    return () => {
      const store = useAiVideoViewerStore.getState();
      store.sheetClosed();
      if (store.activeId === null) return;
      if (Platform.OS === 'android') ToastAndroid.show(t('aiVideo.backgroundNote'), ToastAndroid.LONG);
      else Alert.alert(t('aiVideo.backgroundNote'));
    };
  }, []);

  // C49 R3: süren üretim varsa form onu ilerleme ekranı olarak açar (liste yüklenince bir kez).
  const autoOpened = useRef(false);
  const activeRow = ai.recent.find((r) => r.status === 'QUEUED' || r.status === 'RUNNING');
  useEffect(() => {
    if (autoOpened.current || !activeRow || ai.job) return;
    autoOpened.current = true;
    ai.open(activeRow);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız süren satır bulununca
  }, [activeRow?.id]);

  // C49: bildirimden gelen kimlik. COMPLETED ise önizleme açık gelir; FAILED/süren/bulunamadı ise normal form.
  useEffect(() => {
    if (!initialId) return;
    let cancelled = false;
    aiVideoApi
      .get(initialId)
      .then((r) => {
        if (!cancelled && r.status === 'COMPLETED' && r.videoUrl) actions.show(r);
      })
      .catch(() => {
        /* silinmiş ya da ağ hatası: normal form açık kalır */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız kimlik değişince
  }, [initialId]);
  const form = ai.form;
  const modelLabel = form.options?.models.find((m) => m.key === row?.model)?.label;
  // Boş istem yalnız tek görsel kipinde serbest (referans kipinde sunucu 400 AI_VIDEO_PROMPT_REQUIRED).
  const promptOk = ai.prompt.trim().length > 0 || ai.refs.mode === 'image';
  const canSubmit = !ai.busy && promptOk && !ai.refs.uploading && !ai.refs.failed;
  const others = ai.recent.filter((r) => r.id !== ai.job?.id);

  // Yoklamayla biten üretim önizlemeye geçer (form kapanır).
  const doneRow = ai.job?.status === 'COMPLETED' && ai.job.videoUrl ? ai.job : null;
  useEffect(() => {
    if (doneRow) actions.show(doneRow);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız biten satır değişince
  }, [doneRow?.id]);

  /** C49 R1: seçilen hedefe gönder; başarıda seçici + sayfa kapanır, kısa bilgi. */
  async function sendToTarget(channelId: string) {
    setSendingTo(true);
    setPickError('');
    const err = await actions.sendTo(channelId);
    setSendingTo(false);
    if (err) {
      setPickError(err);
      return;
    }
    setPicking(false);
    onClose();
    Alert.alert(t('aiVideo.sent'));
  }

  function newOne() {
    ai.reset();
    actions.show(null);
  }

  async function onRemove(id: string) {
    await ai.remove(id);
    if (row?.id === id) actions.show(null);
  }

  async function onClear() {
    setConfirmClear(false);
    await ai.clearAll();
    actions.show(null);
  }

  /** Biten satır → önizleme (taze adres); süren → forma ilerleme. Başarısız satır dokunulmaz. */
  function onOpen(r: AiVideoDto) {
    if (r.status === 'COMPLETED' && r.videoUrl) void actions.showFresh(r);
    else if (r.status === 'QUEUED' || r.status === 'RUNNING') ai.open(r);
  }

  return (
    <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
      <Pressable style={styles.tap} onPress={onClose} />
      <View style={[styles.sheet, { maxHeight: height * 0.92 }]}>
        <View style={styles.head}>
          <Text style={styles.title}>{t(row ? 'aiVideo.previewTitle' : 'aiVideo.title')}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
          </Pressable>
        </View>
        {unverified ? <EmailVerificationBanner /> : null}
        {/* Sayfa klavyeyle küçülünce istem görünür alana alınır. Kaydırma küçülmeden önce yapılsa sınıra takılırdı. */}
        <ScrollView
          ref={scrollRef}
          onLayout={() => {
            if (keyboard && !row && !ai.job) scrollRef.current?.scrollTo({ y: promptY.current, animated: true });
          }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {row ? (
            <AiVideoPreview
              row={row}
              mode={mode}
              busy={ai.busy}
              error={ai.error}
              modelLabel={modelLabel}
              onSave={() => void actions.save()}
              onPrimary={() => (mode === 'view' ? setPicking(true) : void actions.primary())}
              onNew={newOne}
              onDelete={() => void onRemove(row.id)}
            />
          ) : (
            <>
              {ai.job ? (
                <AiVideoProgress job={ai.job} working={ai.working} saving={ai.saving} elapsedSec={ai.elapsedSec} onNew={newOne} />
              ) : (
                <AiVideoForm ai={ai} onPromptLayout={(y) => (promptY.current = y)} />
              )}
              {/* Form açıkken hata alttaki sabit alanda (AiVideoCostBar); ilerleme görünümünde o alan yok. */}
              {ai.job && ai.error ? <Text style={styles.error}>{ai.error}</Text> : null}
              <AiVideoRecentList
                rows={others}
                statusLabel={ai.statusLabel}
                onOpen={onOpen}
                onRemove={(id) => void onRemove(id)}
                onClear={() => setConfirmClear(true)}
              />
            </>
          )}
        </ScrollView>
        {!row && !ai.job ? (
          <View style={[styles.footer, { paddingBottom: keyboard ? 12 : sheetBottomPadding(bottomInset) }]}>
            <AiVideoCostBar
              durationS={form.durationS}
              estimateCredits={form.estimateCredits}
              estimating={form.estimating}
              estimateFailed={form.estimateFailed}
              canSubmit={canSubmit}
              inProgress={ai.inProgress}
              hasVideo={ai.refs.items.some((i) => i.kind === 'video')}
              busy={ai.busy}
              error={ai.error}
              locked={ai.locked}
              unverified={unverified}
              grant={form.options?.grant ?? null}
              onSubmit={() => void ai.submit()}
            />
          </View>
        ) : (
          <View style={{ height: keyboard ? 12 : sheetBottomPadding(bottomInset) }} />
        )}
      </View>
      {picking ? (
        <AiVideoTargetPicker
          sending={sendingTo}
          error={pickError}
          onSend={(target) => void sendToTarget(target.id)}
          onClose={() => {
            setPicking(false);
            setPickError('');
          }}
        />
      ) : null}
      {confirmClear ? (
        <ConfirmDialog
          title={t('aiVideo.clearTitle')}
          message={t('aiVideo.clearConfirm')}
          confirmLabel={t('aiVideo.clearAll')}
          onConfirm={() => void onClear()}
          onCancel={() => setConfirmClear(false)}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: theme.colors.bgOverlay, justifyContent: 'flex-end' },
  tap: { flex: 1 },
  sheet: {
    // Klavye alanı daraltınca sayfa da küçülür; yoksa üstü ekrandan taşar (istem yarım kalıyordu).
    flexShrink: 1,
    backgroundColor: theme.colors.bgSidebar,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 14,
  },
  title: { color: theme.colors.textPrimary, fontSize: theme.fontSize.xl, fontWeight: '700' },
  body: { paddingHorizontal: theme.layout.panelGap, paddingBottom: 12, gap: 16 },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
  footer: {
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
});
