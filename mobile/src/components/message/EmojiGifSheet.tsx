import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { EmojiKeyboard, tr as emojiTr } from 'rn-emoji-keyboard';
import { emojiPickerTheme } from './emojiPickerTheme';
import { buildDraftAttachment } from './attachmentDraft';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { MAX_ATTACHMENTS_PER_MESSAGE, type DraftAttachment } from '@/utils/attachmentUpload';
import { loadRecentEmojis, recordEmojiUse } from '@/utils/recentEmojis';
import { t } from '@/i18n';
import { theme } from '@/theme';

type Tab = 'emoji' | 'gif';

interface Props {
  visible: boolean;
  onClose: () => void;
  onEmojiSelected: (emoji: string) => void;
  /** Düzenleme modunda GIF sekmesi gösterilmez (ataç gibi: var olan mesaja ek bağlanamaz). */
  showGif: boolean;
  existingCount?: number;
  /** Seçilen GIF taslak şeride düşer (AttachmentSheet ile aynı akış, gönderilmez). */
  onGifDraft?: (draft: DraftAttachment) => void;
  /** Sık kullanılanlar bölümü + kayıt. Hızlı tepki yuvası seçicisi kapatır (yuva seçimi kullanım sayılmaz). */
  useRecent?: boolean;
}

const SHEET_RATIO = 0.6;

/**
 * C23 §0.2 — mesaj kutusu emoji düğmesinin açtığı iki sekmeli alt sayfa (Emoji | GIF).
 *
 * Emoji sekmesi eski `EmojiPicker` modal'ının içeriğiyle aynı (aynı tema/dil/son kullanılanlar;
 * emoji seçilince sayfa kapanır). GIF sekmesi bugün yalnız "GIF yükle"; kütüphane/arama sonraki sprintte bu
 * sekmenin üstüne gelir, o yüzden bugün boş iskele konmadı.
 *
 * GIF `buildDraftAttachment` huni ağzından geçer (tür+boyut, AttachmentSheet ile aynı hata
 * anahtarları). Galeri seçicisi GIF'e süzemez; seçimden sonra GIF mi diye doğrulanır.
 */
export function EmojiGifSheet({ visible, onClose, onEmojiSelected, showGif, existingCount = 0, onGifDraft, useRecent = true }: Props) {
  const { height } = useWindowDimensions();
  const bottomInset = useSheetInsets();
  const [tab, setTab] = useState<Tab>('emoji');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const activeTab: Tab = showGif ? tab : 'emoji';
  // C24 §0.4: sık kullanılanlar. Sayfa her açıldığında okunur; seçim sırasında liste yerinde durur
  // (parmağın altında yeniden dizilmesin), yeni sıra bir sonraki açılışta görünür.
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    if (visible && useRecent) void loadRecentEmojis().then(setRecent);
  }, [visible, useRecent]);

  function pick(emoji: string) {
    if (useRecent) void recordEmojiUse(emoji);
    onEmojiSelected(emoji);
    // Seçimden sonra sayfa kapanır (eski modal seçici gibi); üç kullanım yerinin hepsi için tek nokta.
    close();
  }

  function close() {
    setError('');
    setTab('emoji');
    onClose();
  }

  async function pickGif() {
    setError('');
    if (existingCount >= MAX_ATTACHMENTS_PER_MESSAGE) {
      setError(t('mobile.attach.limit', { count: MAX_ATTACHMENTS_PER_MESSAGE }));
      return;
    }
    // Galeri seçicisi, düzenleme/dönüştürme YOK: GIF olduğu gibi gelir (bkz. `pickProfileMedia`).
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false });
    if (result.canceled || !result.assets?.length) return;
    const file = result.assets[0];
    const name = (file.fileName ?? file.uri).toLowerCase();
    const looksGif = (file.mimeType && file.mimeType !== 'image/*' ? file.mimeType : '') === 'image/gif' || name.endsWith('.gif');
    if (!looksGif) {
      setError(t('mobile.emojiGif.onlyGif'));
      return;
    }
    setBusy(true);
    try {
      const r = await buildDraftAttachment({
        uri: file.uri,
        filename: file.fileName ?? 'gif.gif',
        contentType: 'image/gif',
        size: file.fileSize,
      });
      if (!r.ok) {
        setError(t(r.errorKey));
        return;
      }
      setTab('emoji');
      onGifDraft?.(r.draft);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={close} accessibilityLabel={t('common.close')} />
        <View
          style={[styles.sheet, { height: height * SHEET_RATIO, paddingBottom: sheetBottomPadding(bottomInset) }]}
        >
          <View style={styles.grabber} />
          {showGif && (
            <View style={styles.tabs}>
              {(['emoji', 'gif'] as const).map((key) => (
                <Pressable
                  key={key}
                  onPress={() => setTab(key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: activeTab === key }}
                  style={[styles.tab, activeTab === key && styles.tabActive]}
                >
                  <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>
                    {t(key === 'emoji' ? 'mobile.emojiGif.tabEmoji' : 'mobile.emojiGif.tabGif')}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {activeTab === 'emoji' ? (
            <View style={styles.body}>
              {recent.length > 0 && (
                <View style={styles.recent}>
                  <Text style={styles.recentTitle}>{t('mobile.emojiGif.recent')}</Text>
                  <View style={styles.recentRow}>
                    {recent.map((emoji) => (
                      <Pressable key={emoji} onPress={() => pick(emoji)} style={styles.recentItem}>
                        <Text style={styles.recentEmoji}>{emoji}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
              <EmojiKeyboard
                onEmojiSelected={(e) => pick(e.emoji)}
                translation={emojiTr}
                enableSearchBar
                categoryPosition="top"
                theme={emojiPickerTheme}
              />
            </View>
          ) : (
            <View style={styles.gifBody}>
              <Pressable
                onPress={() => void pickGif()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.emojiGif.uploadGif')}
                style={[styles.row, busy && styles.rowBusy]}
              >
                <Ionicons name="image-outline" size={22} color={theme.colors.textSecondary} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{t('mobile.emojiGif.uploadGif')}</Text>
                  <Text style={styles.rowHint}>{t('mobile.emojiGif.uploadGifHint')}</Text>
                </View>
                {busy ? (
                  <ActivityIndicator color={theme.colors.textMuted} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                )}
              </Pressable>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.55)', justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: theme.colors.bgSidebar,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginVertical: 10,
    backgroundColor: theme.colors.borderStrong,
  },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: theme.layout.panelGap,
    marginBottom: 8,
    padding: 3,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: theme.radius.sm },
  tabActive: { backgroundColor: theme.colors.accentSubtle },
  tabText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: '600' },
  tabTextActive: { color: theme.colors.accent500 },
  body: { flex: 1 },
  recent: { paddingHorizontal: theme.layout.panelGap, paddingBottom: 6 },
  recentTitle: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, fontWeight: '600', marginBottom: 4 },
  recentRow: { flexDirection: 'row', flexWrap: 'wrap' },
  // 8 sütun x 2 satır = 16; sabit yüzde genişlik dar ekranda da taşmaz.
  recentItem: { width: '12.5%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  recentEmoji: { fontSize: 24 },
  gifBody: { paddingHorizontal: theme.layout.panelGap, paddingTop: 4, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  rowBusy: { opacity: 0.6 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: theme.colors.textPrimary, fontSize: theme.fontSize.lg, fontWeight: '500' },
  rowHint: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: 1 },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
});
