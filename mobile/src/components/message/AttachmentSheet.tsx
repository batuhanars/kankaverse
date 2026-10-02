import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type * as MediaLibrary from 'expo-media-library';
import { useMediaLibrary } from './useMediaLibrary';
import { buildDraftAttachment, type PickedFile } from './attachmentDraft';
import { sheetBottomPadding } from '../home/sheetInsets';
import { formatClock } from '@/utils/formatClock';
import { MAX_VIDEO_MS } from '@/utils/videoPrepare';
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  type DraftAttachment,
} from '@/utils/attachmentUpload';
import { t } from '@/i18n';
import { theme } from '@/theme';

const COLUMNS = 3;
const GRID_GAP = 3;
/** Kısa hâlde ekranın bu oranı kaplar; yukarı sürüklenince tam ekrana çıkar (sözleşme §1). */
const COLLAPSED_RATIO = 0.56;
/** Sürükleme eşiği — bunun altındaki hareket kazara dokunuş sayılır. */
const DRAG_THRESHOLD = 48;

type Cell = { type: 'camera' } | { type: 'asset'; asset: MediaLibrary.Asset };

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Kutuda ZATEN bekleyen ek sayısı — 10 sınırı toplam üzerinden uygulanır (sunucu da öyle). */
  existingCount: number;
  /** M6c — kutuda ZATEN bekleyen video sayısı (bir mesajda en fazla 1 video). */
  existingVideoCount?: number;
  /** Seçim onaylandı: ekler kutuya eklenir ve mesaj gönderilir (sözleşme §1 "gönder düğmesi"). */
  onConfirm: (drafts: DraftAttachment[]) => void;
}

/**
 * Sprint M3c §1 + §2 — `+` düğmesinin açtığı ek paneli.
 *
 * Kısa hâlde: **Galeriden Seç** satırı + galeri ızgarası (ilk hücre kamera).
 * Yukarı sürüklenince: satır kaybolur, üstte **Geri · başlık · Tüm Albümler** çıkar.
 *
 * 🔴 Discord'daki **"Anketler"** maddesi KONMADI: bizde anket/forum kavramı yok, tıklayınca hiçbir
 * yere gitmeyen madde boş yüzeydir (mobile/CLAUDE.md "Boş yüzey açma").
 *
 * 🔴 **Sürükleme `PanResponder` ile** (RN çekirdeği), `react-native-gesture-handler` ile değil:
 * kök ağaçta `GestureHandlerRootView` yok ve `Modal` Android'de ayrı bir pencerede çiziliyor —
 * gesture-handler o pencerede ayrıca sarmalanmadan çalışmıyor. Çekirdek çözüm bu riski taşımıyor.
 */
export function AttachmentSheet({ visible, onClose, existingCount, existingVideoCount = 0, onConfirm }: Props) {
  const { width, height } = useWindowDimensions();
  // Alt pay `sheetInsets` hesabından (gezinme çubuğu dersi orada yazılı); ÜST pay yalnız tam
  // ekranda gerekir: SDK 54 edge-to-edge ile panel durum çubuğunun altına da çiziliyor.
  const insets = useSafeAreaInsets();
  const media = useMediaLibrary(visible);

  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<MediaLibrary.Asset[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const remaining = MAX_ATTACHMENTS_PER_MESSAGE - existingCount - selected.length;
  const cellSize = (width - GRID_GAP * (COLUMNS - 1)) / COLUMNS;

  function close() {
    setSelected([]);
    setError('');
    setExpanded(false);
    onClose();
  }

  /** Sürükleme yalnız tutamak şeridinde dinlenir — ızgaranın kendi kaydırması bozulmasın. */
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 8,
      onPanResponderRelease: (_e, g) => {
        if (g.dy <= -DRAG_THRESHOLD) setExpanded(true);
        else if (g.dy >= DRAG_THRESHOLD) setExpanded((prev) => (prev ? false : prev));
      },
    }),
  ).current;

  function toggleAsset(asset: MediaLibrary.Asset) {
    setError('');
    if (selected.some((a) => a.id === asset.id)) {
      setSelected((prev) => prev.filter((a) => a.id !== asset.id));
      return;
    }
    // 🔴 Sınır TOPLAM üzerinden: kutuda bekleyen ekler de sayılır (sunucu `ArrayMaxSize(10)`).
    if (existingCount + selected.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
      setError(t('mobile.attach.limit', { count: MAX_ATTACHMENTS_PER_MESSAGE }));
      return;
    }
    // M6c §3.2 — video: 60 sn üstü seçilmez, bir mesajda en fazla 1 video. Kırpma YOK.
    if (asset.mediaType === 'video') {
      if (asset.duration * 1000 > MAX_VIDEO_MS) {
        setError(t('mobile.video.tooLong'));
        return;
      }
      if (existingVideoCount + selected.filter((a) => a.mediaType === 'video').length >= 1) {
        setError(t('mobile.video.oneOnly'));
        return;
      }
    }
    setSelected((prev) => [...prev, asset]);
  }

  /**
   * 🔴 **Üç yolun da (galeri ızgarası · sistem foto seçicisi · belge seçicisi) TEK huni ağzı.**
   *
   * Sayı sınırı ve tür/boyut süzgeci burada; kaynak başına ayrı doğrulama YAZILMAZ. Aksi hâlde
   * yeni bir kaynak eklendiğinde (bugün belge seçicisi eklendiği gibi) kontrollerden biri
   * unutulurdu — sunucu allowlist'i tek kaynak, istemcide de tek geçit.
   *
   * Biri bile geçersizse HİÇBİRİ eklenmez: yarısı kabul edilen bir seçim, kullanıcının
   * gönderdiğini sandığı dosyanın sessizce düşmesi olurdu.
   */
  const confirmFiles = useCallback(
    async (files: PickedFile[]) => {
      if (files.length === 0) return;
      if (existingCount + files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
        setError(t('mobile.attach.limit', { count: MAX_ATTACHMENTS_PER_MESSAGE }));
        return;
      }
      if (existingVideoCount + files.filter((f) => f.isVideo).length > 1) {
        setError(t('mobile.video.oneOnly'));
        return;
      }
      setBusy(true);
      try {
        const results = await Promise.all(files.map(buildDraftAttachment));
        const failed = results.find((r) => !r.ok);
        if (failed && !failed.ok) {
          setError(t(failed.errorKey));
          return;
        }
        setSelected([]);
        setError('');
        setExpanded(false);
        onConfirm(results.flatMap((r) => (r.ok ? [r.draft] : [])));
      } finally {
        setBusy(false);
      }
    },
    [onConfirm, existingCount, existingVideoCount],
  );

  /**
   * Sistem seçicisi — "Galeriden Seç" ve "Tüm Albümler" AYNI yere çıkar (sözleşme §1: sahip de
   * böyle tarif etti). İzin gerektirmez: Android 13+'ta sistem foto seçicisi uygulamaya kütüphane
   * erişimi vermeden yalnız seçileni teslim eder — ızgara izni reddedilmiş olsa bile bu yol çalışır.
   */
  async function openSystemPicker() {
    setError('');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(remaining, 1),
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.length) return;
    await confirmFiles(
      result.assets.map((a) => ({
        uri: a.uri,
        filename: a.fileName,
        contentType: a.mimeType,
        size: a.fileSize,
        // M6c — ImagePicker video süresini ms verir.
        isVideo: a.type === 'video',
        durationMs: a.type === 'video' ? a.duration : null,
        width: a.width,
        height: a.height,
      })),
    );
  }

  /**
   * Sistem **belge** seçicisi (PM onayı 2026-08-04, `expo-document-picker`).
   *
   * Neden ayrı satır: sunucu PDF ve düz metni ZATEN kabul ediyor ve web'den gönderilebiliyordu —
   * eksik olan yalnız mobil istemciydi. Foto seçicisi belge veremez, belge seçicisi de galeri
   * izni reddedilmiş kullanıcıya fotoğraf yolu açmaz; ikisi ayrı işlev, ayrı satır.
   *
   * `type` sunucunun allowlist'iyle sınırlanıyor → kullanıcı çoğu geçersiz dosyayı zaten
   * seçemiyor. Yine de bazı Android belge sağlayıcıları süzgeci yok sayabildiği için son söz
   * `buildDraftAttachment`te (ve asıl otorite sunucuda).
   * `copyToCacheDirectory` açık: `content://` URI'sini `uploadAsync` okuyamaz, önbelleğe
   * kopyalanan `file://` yolunu okur.
   */
  async function openDocumentPicker() {
    setError('');
    const result = await DocumentPicker.getDocumentAsync({
      // `text/*` bilerek listeye EK olarak veriliyor: Android seçicisi türü MIME'a göre süzüyor ve
      // `.md`/`.log`/`.yml` için cihazda kayıtlı bir MIME çoğu zaman yok, dosya soluk görünüp
      // seçilemiyordu (sahibin "md gönderemiyoruz" bulgusu). Bu bir GEVŞETME DEĞİL: seçilen dosya
      // yine `resolveContentType`ten geçiyor, tanınmayan uzantı `UNSUPPORTED_TYPE` ile reddediliyor
      // ve otorite zaten sunucuda. Görünmeyen dosya yerine açık ret, kullanıcıya daha dürüst.
      type: [...ALLOWED_ATTACHMENT_TYPES, 'text/*'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    await confirmFiles(
      result.assets.map((a) => ({ uri: a.uri, filename: a.name, contentType: a.mimeType, size: a.size })),
    );
  }

  async function openCamera() {
    setError('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError(t('mobile.attach.cameraDenied'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (result.canceled || !result.assets?.length) return;
    const shot = result.assets[0];
    await confirmFiles([
      { uri: shot.uri, filename: shot.fileName ?? 'foto.jpg', contentType: shot.mimeType, size: shot.fileSize },
    ]);
  }

  /** `selected` seçim SIRASINI taşıyor (rozetteki numara da ondan) — sıra korunarak gönderilir. */
  async function sendSelected() {
    await confirmFiles(
      selected.map((a) => ({
        uri: a.uri,
        filename: a.filename,
        isVideo: a.mediaType === 'video',
        // MediaLibrary süreyi SANİYE verir.
        durationMs: a.mediaType === 'video' ? a.duration * 1000 : null,
        width: a.width,
        height: a.height,
      })),
    );
  }

  const cells = useMemo<Cell[]>(
    () => [{ type: 'camera' }, ...media.assets.map((asset) => ({ type: 'asset' as const, asset }))],
    [media.assets],
  );

  const sheetHeight = expanded ? height : height * COLLAPSED_RATIO;

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        {/* Kısa hâlde üstteki boşluğa dokunmak paneli kapatır; tam ekranda boşluk yok. */}
        {!expanded && <Pressable style={styles.backdropTap} onPress={close} accessibilityLabel={t('common.close')} />}

        <View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              paddingTop: expanded ? insets.top : 0,
              paddingBottom: sheetBottomPadding(insets.bottom),
            },
          ]}
        >
          <View {...panResponder.panHandlers}>
            <Pressable
              onPress={() => setExpanded((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel={expanded ? t('mobile.attach.collapse') : t('mobile.attach.expand')}
              style={styles.grabberHit}
            >
              <View style={styles.grabber} />
            </Pressable>

            {expanded ? (
              <View style={styles.headerRow}>
                <Pressable
                  onPress={() => setExpanded(false)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('mobile.attach.back')}
                  style={styles.headerSide}
                >
                  <Ionicons name="chevron-down" size={22} color={theme.colors.textSecondary} />
                </Pressable>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {t('mobile.attach.title')}
                </Text>
                <Pressable
                  onPress={openSystemPicker}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('mobile.attach.allAlbums')}
                  style={styles.headerSide}
                >
                  <Text style={styles.headerAction} numberOfLines={1}>
                    {t('mobile.attach.allAlbums')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              /* İki satır, iki ayrı işlev: **Dosyalar** sistem belge seçicisini (PDF/metin),
                 **Galeriden Seç** sistem foto seçicisini açar. Discord'daki "Anketler" maddesi
                 KONMADI: bizde anket/forum kavramı yok. */
              <View style={styles.rowGroup}>
                <Pressable
                  onPress={openDocumentPicker}
                  accessibilityRole="button"
                  accessibilityLabel={t('mobile.attach.files')}
                  style={styles.filesRow}
                >
                  <Ionicons name="document-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.filesRowText}>{t('mobile.attach.files')}</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </Pressable>
                <Pressable
                  onPress={openSystemPicker}
                  accessibilityRole="button"
                  accessibilityLabel={t('mobile.attach.gallery')}
                  style={styles.filesRow}
                >
                  <Ionicons name="images-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.filesRowText}>{t('mobile.attach.gallery')}</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </Pressable>
              </View>
            )}
          </View>

          {/* 🔴 Kısmi erişim ("yalnız seçilen fotoğraflar"): ızgara kütüphanenin TAMAMINI göremez.
              Bu satır olmasa kullanıcı fotoğraflarının kaybolduğunu sanardı (sözleşme §2). */}
          {media.access === 'limited' && (
            <Pressable
              onPress={media.pickMorePhotos}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.attach.pickMore')}
              style={styles.limitedRow}
            >
              <Ionicons name="images-outline" size={18} color={theme.colors.accent500} />
              <View style={styles.limitedTextWrap}>
                <Text style={styles.limitedTitle}>{t('mobile.attach.pickMore')}</Text>
                <Text style={styles.limitedNote}>{t('mobile.attach.limitedNotice')}</Text>
              </View>
            </Pressable>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* 🔴 İzin reddedildi → uygulama KİLİTLENMEZ: ızgara yerine sebep + sistem seçicisi yolu. */}
          {media.access === 'denied' ? (
            <View style={styles.deniedWrap}>
              <Text style={styles.deniedText}>{t('mobile.attach.permissionDenied')}</Text>
              <Pressable
                onPress={openSystemPicker}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.attach.gallery')}
                style={styles.deniedButton}
              >
                <Text style={styles.deniedButtonText}>{t('mobile.attach.gallery')}</Text>
              </Pressable>
              <Pressable
                onPress={openDocumentPicker}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.attach.files')}
                style={styles.deniedButton}
              >
                <Text style={styles.deniedButtonText}>{t('mobile.attach.files')}</Text>
              </Pressable>
              {/* Kamera AYRI bir izindir: galeri reddedildi diye kamera yolu da kapanmaz. */}
              <Pressable
                onPress={openCamera}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.attach.camera')}
                style={styles.deniedButton}
              >
                <Text style={styles.deniedButtonText}>{t('mobile.attach.camera')}</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              style={styles.grid}
              data={cells}
              numColumns={COLUMNS}
              keyExtractor={(cell) => (cell.type === 'camera' ? 'camera' : cell.asset.id)}
              columnWrapperStyle={styles.gridRow}
              onEndReachedThreshold={0.5}
              onEndReached={media.loadMore}
              ListEmptyComponent={
                media.access === 'checking' || media.loading ? (
                  <ActivityIndicator color={theme.colors.textMuted} style={styles.gridLoading} />
                ) : (
                  <Text style={styles.deniedText}>{t('mobile.attach.empty')}</Text>
                )
              }
              renderItem={({ item }) => {
                if (item.type === 'camera') {
                  return (
                    <Pressable
                      onPress={openCamera}
                      accessibilityRole="button"
                      accessibilityLabel={t('mobile.attach.camera')}
                      style={[styles.cameraCell, { width: cellSize, height: cellSize }]}
                    >
                      <Ionicons name="camera-outline" size={26} color={theme.colors.textSecondary} />
                      <Text style={styles.cameraLabel}>{t('mobile.attach.camera')}</Text>
                    </Pressable>
                  );
                }
                const index = selected.findIndex((s) => s.id === item.asset.id);
                return (
                  <Pressable
                    onPress={() => toggleAsset(item.asset)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: index >= 0 }}
                    accessibilityLabel={item.asset.filename}
                    style={{ width: cellSize, height: cellSize }}
                  >
                    <Image source={{ uri: item.asset.uri }} style={styles.cellImage} resizeMode="cover" />
                    {item.asset.mediaType === 'video' && (
                      <View style={styles.cellDuration}>
                        <Ionicons name="videocam" size={11} color={theme.colors.textPrimary} />
                        <Text style={styles.cellDurationText}>{formatClock(item.asset.duration * 1000)}</Text>
                      </View>
                    )}
                    {index >= 0 && (
                      <View style={styles.selectedOverlay}>
                        <View style={styles.selectedBadge}>
                          <Text style={styles.selectedBadgeText}>{index + 1}</Text>
                        </View>
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />
          )}

          {selected.length > 0 && (
            <Pressable
              onPress={sendSelected}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.attach.send', { count: selected.length })}
              style={[styles.sendButton, busy && styles.sendButtonDisabled]}
            >
              <Text style={styles.sendButtonText}>{t('mobile.attach.send', { count: selected.length })}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: theme.colors.bgSidebar,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  grabberHit: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: theme.layout.panelGap,
    paddingBottom: 10,
  },
  headerSide: {
    minHeight: theme.layout.inputMinHeight,
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
  headerAction: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  rowGroup: {
    gap: 8,
    marginHorizontal: theme.layout.panelGap,
    marginBottom: 10,
  },
  filesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  filesRowText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '500',
  },
  limitedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: theme.layout.inputMinHeight,
    marginHorizontal: theme.layout.panelGap,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accentSubtle,
  },
  limitedTextWrap: { flex: 1, minWidth: 0 },
  limitedTitle: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  limitedNote: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    marginTop: 1,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.layout.panelGap,
    paddingBottom: 8,
  },
  deniedWrap: {
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 8,
    gap: 12,
  },
  deniedText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 16,
  },
  deniedButton: {
    minHeight: theme.layout.inputMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  deniedButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
  },
  // Izgara kalan alanı doldurur: panel sabit yükseklikte, `flex` olmadan liste içeriği kadar
  // büyüyüp paneli taşırırdı.
  grid: { flex: 1 },
  gridRow: { gap: GRID_GAP, marginBottom: GRID_GAP },
  gridLoading: { marginTop: 24 },
  cameraCell: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: theme.colors.bgElevated,
  },
  cameraLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
  },
  cellImage: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.bgElevated,
  },
  // M6c — video karesinde sağ altta süre (WhatsApp/Discord ızgarası gibi).
  cellDuration: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  cellDurationText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    padding: 6,
    borderWidth: 2,
    borderColor: theme.colors.accent500,
    backgroundColor: theme.colors.accentSubtle,
  },
  selectedBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent500,
  },
  selectedBadgeText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  sendButton: {
    minHeight: theme.layout.inputMinHeight,
    marginHorizontal: theme.layout.panelGap,
    marginTop: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
});
