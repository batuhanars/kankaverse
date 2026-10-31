import { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AiVideoDto } from '@/api/aiVideo';
import type { PickedProfileMedia } from '@/utils/animatedMedia';
import { ConfirmDialog } from '../ConfirmDialog';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { t } from '@/i18n';
import { theme } from '@/theme';
import { AiVideoCostBar } from './AiVideoCostBar';
import { AiVideoForm } from './AiVideoForm';
import { AiVideoPreview } from './AiVideoPreview';
import { AiVideoProgress } from './AiVideoProgress';
import { AiVideoRecentList } from './AiVideoRecentList';
import { useAiVideo } from './useAiVideo';
import { useAiVideoActions } from './useAiVideoActions';

interface Props {
  visible: boolean;
  /** chat: mesaj kutusundan (Kaydet ve gönder) · media: profil/ortam görseli (Kullan). */
  mode: 'chat' | 'media';
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
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={rest.onClose}>
      {visible ? <SheetBody {...rest} /> : null}
    </Modal>
  );
}

function SheetBody({ mode, onClose, onSend, onUse }: Omit<Props, 'visible'>) {
  const { height } = useWindowDimensions();
  const bottomInset = useSheetInsets();
  const keyboard = useKeyboardVisible();
  const ai = useAiVideo();
  const [confirmClear, setConfirmClear] = useState(false);
  const actions = useAiVideoActions({
    mode,
    setBusy: ai.setBusy,
    setError: ai.setError,
    onSend: (id) => onSend?.(id),
    onUse: (m) => onUse?.(m),
  });
  const { row } = actions;
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
        <ScrollView
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
              onPrimary={() => void actions.primary()}
              onNew={newOne}
              onDelete={() => void onRemove(row.id)}
            />
          ) : (
            <>
              {ai.job ? (
                <AiVideoProgress job={ai.job} working={ai.working} saving={ai.saving} elapsedSec={ai.elapsedSec} onNew={newOne} />
              ) : (
                <AiVideoForm ai={ai} />
              )}
              {ai.error ? <Text style={styles.error}>{ai.error}</Text> : null}
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
              locked={ai.locked}
              grant={form.options?.grant ?? null}
              onSubmit={() => void ai.submit()}
            />
          </View>
        ) : (
          <View style={{ height: keyboard ? 12 : sheetBottomPadding(bottomInset) }} />
        )}
      </View>
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
