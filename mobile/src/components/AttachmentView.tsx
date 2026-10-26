import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ImageViewer } from './ImageViewer';
import { VoicePlayer } from './message/VoicePlayer';
import { VideoCard } from './message/VideoCard';
import { attachmentsApi } from '@/api/attachments';
import { extractErrorMessage } from '@/api/errors';
import { ScanStatus, type AttachmentDto } from '@/api/messages';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1a contract §5.5 (🔴 T&S kapısı) — web/src/components/shared/AttachmentView.vue ile
// BİREBİR aynı kural: mesajdaki ek nesnesi URL içermez, adres GET /attachments/:id'den alınır.
// scanStatus CLEAN değilse görsel YÜKLENMEZ. Bu bir T&S kapısıdır — kapıyı istemcide gevşetme.
export function AttachmentView({
  attachment,
  size,
  interactive = false,
  onShowInChat,
  isMine = false,
}: {
  attachment: AttachmentDto;
  /**
   * Sprint M2c — kanal detay "Medya" ızgarası bu bileşeni SABİT KARE hücrelerde tekrar kullanır
   * (T&S taraması/durum mantığını ikinci kez yazmamak için). Verilmezse mesaj balonu ölçüsü
   * (220x160) değişmeden kalır — mevcut çağıran (`MessageBubble`) etkilenmez.
   */
  size?: number;
  /**
   * Sprint M3c R2 — dokunma davranışı (görsel → tam ekran, dosya → sistemde aç).
   *
   * 🔴 Varsayılan KAPALI ve bu bilinçli: kanal detayının Medya/Dosyalar sekmelerinde bu bileşen
   * ZATEN bir `Pressable` içinde duruyor ve orada dokunuş "mesaja git" demek. Varsayılanı açık
   * yapsaydım iç içe iki dokunma hedefi olur, içteki kazanır ve o sekmelerdeki gezinme sessizce
   * bozulurdu. Yalnız mesaj balonu (`MessageBubble`) açık geçiyor.
   *
   * 🔴 Medya ızgarası (sahip kararı 2026-09-01) artık İSTİSNA: orada da dokunuş büyütüyor, dış
   * `Pressable` kaldırıldı (bkz. `ChannelMediaTab`). "Mesaja git" kaybolmadı, tam ekrandaki
   * düğmeye taşındı (`onShowInChat`). Dosyalar sekmesi eski davranışta kaldı.
   */
  interactive?: boolean;
  /**
   * Verilirse tam ekranda "Mesajda göster" düğmesi çıkar ve dokununca çağrılır. Yalnız medya
   * ızgarası geçiyor — sohbette zaten mesajın yanındasın.
   */
  onShowInChat?: () => void;
  /** M6b — oynatıcı rengi için: kendi baloncuğumda Kor zemin üstünde `accent400` (M6a §4). */
  isMine?: boolean;
}) {
  const isImage = attachment.contentType.startsWith('image/');
  const isClean = attachment.scanStatus === ScanStatus.CLEAN;
  const isPending = attachment.scanStatus === ScanStatus.PENDING;
  const isFlagged = attachment.scanStatus === ScanStatus.FLAGGED;
  const sizeStyle = size ? { width: size, height: size, marginTop: 0 } : undefined;

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  // Tam ekran KENDİ adresini alır (küçük resminkini yeniden kullanmaz) — sebebi `openViewer`de.
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerError, setViewerError] = useState('');
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    if (!isImage || !isClean) return;
    let cancelled = false;
    attachmentsApi
      .getUrl(attachment.id)
      .then((res) => {
        if (!cancelled) setImageUrl(res.url);
      })
      .catch(() => {
        if (!cancelled) setImageError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.id, isImage, isClean]);

  /**
   * Sprint M3c R2 — dosyayı aç.
   *
   * 🔴 Adres yine `GET /attachments/:id`'den alınır: erişim kontrolü (üyelik + yaş kapıları) ve
   * tarama kapısı SUNUCUDA. CLEAN olmayan ek zaten dokunulabilir değil; olsaydı bile sunucu 403
   * dönerdi. İstemci ne ikinci bir kapı kuruyor ne var olanı baypas ediyor.
   *
   * Hangi türü açabileceğini tahmin etmeye çalışmıyoruz: onu sistem bilir, uydurma bir
   * "desteklenmiyor" listesi yanlış negatif üretirdi.
   *
   * D38 (PLAN.md) — eskiden `Linking.openURL` harici tarayıcıya devrediyordu, kullanıcı uygulamadan
   * çıkıyordu. `expo-web-browser` zaten kurulu ve `app.json` plugins'te (yeni derleme gerekmedi).
   * `WebBrowser.openBrowserAsync` uygulama-içi bir sekme açar, geri tuşu uygulamaya döner.
   * ⚠️ Bu Chrome'un geçmiş/çerezlerini paylaşan bir sekme — ayrı bir izole ortam değil (D36 kaydı);
   * D36 bu değişiklikle KAPANMIYOR.
   */
  async function openFile() {
    if (opening) return;
    setOpening(true);
    setOpenError('');
    try {
      const { url } = await attachmentsApi.getUrl(attachment.id);
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      // Ham hata metni/durum kodu ekrana basılmaz; sunucunun Türkçe mesajı gösterilir.
      setOpenError(extractErrorMessage(e));
    } finally {
      setOpening(false);
    }
  }

  /**
   * Sprint M3c R2-B — tam ekranı aç ve adresi **o anda** tazele.
   *
   * 🔴 Küçük resmin adresi yeniden KULLANILMAZ: presigned GET ömrü 300 sn
   * (`storage.service.ts` `PRESIGN_EXPIRES_SECONDS`). Sohbet 5 dakikadan uzun açık kaldığında
   * eski adres ölür ve tam ekran sessizce siyah açılırdı; görsel önbelleğine güvenmek garanti
   * değil. İstek kullanıcı niyetiyle tetikleniyor — listedeki her ek için değil, dokunulan tek ek
   * için, yani "N ek = N istek" endişesi doğmuyor.
   *
   * Yan kazanç: tarama kapısı burada **ikinci kez** doğrulanıyor. Mesaj listede dururken ek
   * `FLAGGED`'a çevrilmişse sunucu 403 döner (`ATTACHMENT_BLOCKED`) ve kullanıcı sebebini görür —
   * eski adres cebimizde diye kapalı bir içeriği açmış olmayız.
   */
  function openViewer() {
    setViewerOpen(true);
    setViewerUrl(null);
    setViewerError('');
    attachmentsApi
      .getUrl(attachment.id)
      .then((res) => setViewerUrl(res.url))
      .catch((e) => setViewerError(extractErrorMessage(e)));
  }

  if (isImage) {
    // PENDING — kural: "Görsel YÜKLENMEZ" (contract §5.5 tablosu). Taranmamış medya asla gösterilmez.
    // 🔴 Aşağıdaki dört erken dönüş aynı zamanda DOKUNMA KAPISI: hiçbiri `Pressable` içine
    // sarılmaz, yani CLEAN olmayan (ya da adresi henüz alınmamış) görsel büyütülemez.
    if (isPending) {
      return (
        <View style={[styles.statusBadge, sizeStyle]}>
          <Text style={styles.statusText}>{t('attachment.processing')}</Text>
        </View>
      );
    }
    if (isFlagged) {
      return (
        <View style={[styles.statusBadge, sizeStyle]}>
          <Text style={styles.statusText}>{t('attachment.blocked')}</Text>
        </View>
      );
    }
    if (imageError) {
      return (
        <View style={[styles.statusBadge, sizeStyle]}>
          <Text style={styles.statusText}>{t('attachment.notReady')}</Text>
        </View>
      );
    }
    if (!imageUrl) {
      return (
        <View style={[styles.statusBadge, sizeStyle]}>
          <ActivityIndicator size="small" color={theme.colors.textMuted} />
        </View>
      );
    }

    const thumbnail = <Image source={{ uri: imageUrl }} style={[styles.image, sizeStyle]} resizeMode="cover" />;
    if (!interactive) return thumbnail;

    return (
      <>
        <Pressable
          onPress={openViewer}
          accessibilityRole="imagebutton"
          accessibilityLabel={t('mobile.attachment.viewImage')}
        >
          {thumbnail}
        </Pressable>

        {/* Tam ekran görüntüleyici (yakınlaştırmalı) — sunum `ImageViewer`e taşındı; adres alma ve
            T&S kapısı BURADA kaldı, o bileşen kendi başına hiçbir şey indirmiyor. */}
        <ImageViewer
          visible={viewerOpen}
          url={viewerUrl}
          errorMessage={viewerError}
          onClose={() => setViewerOpen(false)}
          saveTarget={attachment}
          onShowInChat={
            onShowInChat
              ? () => {
                  // Önce kapan: görüntüleyici açık kalırsa altta gezinme olur ve kullanıcı geri
                  // dönünce hâlâ tam ekranda bulur kendini.
                  setViewerOpen(false);
                  onShowInChat();
                }
              : undefined
          }
        />
      </>
    );
  }

  // M6b §2 — ses eki oynatıcı olarak çizilir (dosya kutusu olarak DEĞİL). CLEAN değilse oynatıcı
  // çizilmez, aşağıdaki rozet kendi sebebini ("İşleniyor…" / "Bu içerik kaldırıldı.") yazar.
  if (attachment.contentType.startsWith('audio/') && isClean) {
    return <VoicePlayer attachment={attachment} isMine={isMine} />;
  }

  // M6c §2 — video küçük resim kartı olarak çizilir; CLEAN değilse aşağıdaki rozet sebebini yazar.
  if (attachment.contentType.startsWith('video/') && isClean) {
    return <VideoCard attachment={attachment} />;
  }

  // Görsel değil — dosya adı rozeti. CLEAN ise dokununca sistemde açılır.
  const canOpen = interactive && isClean;
  const badge = (
    <View style={[styles.fileBadge, canOpen && styles.fileBadgeTouch]}>
      <Text style={styles.fileName} numberOfLines={1}>
        {attachment.filename}
      </Text>
      {opening ? (
        <ActivityIndicator size="small" color={theme.colors.textMuted} />
      ) : (
        <Text style={styles.fileMeta}>
          {isPending ? t('attachment.processing') : isFlagged ? t('attachment.blocked') : formatBytes(attachment.size)}
        </Text>
      )}
    </View>
  );

  // 🔴 CLEAN değilse dokunulabilir DEĞİL — rozet kendi sebebini ("İşleniyor…" / "Bu içerik
  // kaldırıldı.") yazmaya devam eder. Dokunulup hiçbir şey olmaması da yanlış olurdu.
  if (!canOpen) return badge;

  return (
    <View>
      <Pressable onPress={openFile} accessibilityRole="button" accessibilityLabel={t('mobile.attachment.openFile')}>
        {badge}
      </Pressable>
      {openError ? <Text style={styles.openError}>{openError}</Text> : null}
    </View>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  statusBadge: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bgElevated,
    alignSelf: 'flex-start',
  },
  statusText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
  },
  image: {
    marginTop: 6,
    width: 220,
    // M6a — dar ekranda (320dp) baloncuğun iç genişliği 220'nin altına inebiliyor, görsel taşmasın.
    maxWidth: '100%',
    height: 160,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bgElevated,
  },
  fileBadge: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bgElevated,
    maxWidth: 260,
  },
  /** Dokunulabilir hâlde 44dp hedef; salt-gösterim hâlinde rozet eskisi gibi ince kalır. */
  fileBadgeTouch: {
    minHeight: theme.layout.inputMinHeight,
  },
  fileName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
    flexShrink: 1,
  },
  fileMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
  openError: {
    marginTop: 4,
    color: theme.colors.danger,
    fontSize: theme.fontSize.xs,
    maxWidth: 260,
  },
});
