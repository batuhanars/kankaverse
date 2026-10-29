import { useState } from 'react';
import { messagesApi, type MessageDto } from '@/api/messages';
import { extractErrorCode, extractErrorMessage } from '@/api/errors';
import {
  isStorageUploadError,
  uploadDraftAttachment,
  type DraftAttachment,
} from '@/utils/attachmentUpload';
import { prepareVideoDraft, VideoPrepareError } from '@/utils/videoPrepare';
import { useMessagesStore } from '@/stores/messages';
import { sendOptimisticText } from './useOptimisticSend';
import { t } from '@/i18n';

/**
 * Giriş kutusunun durumu ve iki modu (M1d-C §2.5): normal · **yanıtlıyorum**. Düzenleme C27'de kutudan
 * çıktı (`EditMessageOverlay`, kendi durumu).
 *
 * `MessageScreen`den ayrıldı çünkü o dosya tam 300 satır eşiğindeydi ve bu iş kendi içinde kapalı:
 * metin, gönderim, hata ve mod tek yerde durunca "gönder tuşuna basınca ne olur" sorusunun cevabı
 * tek fonksiyonda okunuyor.
 *
 * Sprint M3c §3 — ekler de burada: seçilen dosyalar taslak olarak bekler, gönderim anında
 * yüklenir ve `attachmentIds` ile mesaja bağlanır.
 */
export function useMessageComposer(
  channelId: string,
  typing: { onInputChange: (text: string) => void; stop: () => void },
  /**
   * Sprint M2d — gönderim öncesi bahsetme token dönüşümü. Verilmezse metin olduğu gibi gider
   * (bahsetme kaynağı olmayan ekranlar için). Dönüşüm SUNUCUYA giden metne uygulanır; kutuda
   * kullanıcının yazdığı okunur hâl (`@ad`) kalır.
   */
  mentions?: { applyMentionTokens: (text: string) => string; clearPicked: () => void },
) {
  const appendMessage = useMessagesStore((s) => s.appendMessage);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [replyTo, setReplyTo] = useState<MessageDto | null>(null);
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  /** Yükleme sırasında kutuda gösterilen ilerleme metni ("Yükleniyor… 2/5"); boşsa gösterilmez. */
  const [uploadLabel, setUploadLabel] = useState('');

  function onChangeInput(text: string) {
    setInput(text);
    typing.onInputChange(text);
  }

  function startReply(message: MessageDto) {
    setReplyTo(message);
  }

  /** Yanıttan çık: kutudaki yazılan metin KORUNUR (hâlâ geçerli). */
  function cancelMode() {
    setReplyTo(null);
    setSendError('');
  }

  /**
   * M6c §3.3.b — panelden onaylanan ekler şeride düşer, gönderilmez: kullanıcı kutuya açıklama yazıp
   * kendisi gönderir. Açıklama ayrı bir alan değil, mesaj metnidir (API değişmedi).
   */
  function addAttachments(drafts: DraftAttachment[]) {
    setAttachments((prev) => [...prev, ...drafts]);
    setSendError('');
  }

  function removeAttachment(key: string) {
    setAttachments((prev) => prev.filter((a) => a.key !== key));
    setSendError('');
  }

  /**
   * Taslak ekleri sırayla yükler ve `attachmentId` listesini döner.
   *
   * 🔴 **Görünür state'e HİÇ yazmaz.** Yüklenen kimlikler çağıranın verdiği diziye **yerinde**
   * işlenir; çağıran o diziyi yalnız HATA yolunda `setAttachments`e geçirir. Önceden burada
   * `setAttachments` vardı ve başarılı gönderimde taslak şeridi bir kare görünüp kayboluyordu
   * (sahip bulgusu: "görsel bir anlığına kutuya düşüyor"). M6c §3.3.b'den beri şerit gönderim
   * öncesi de dolu (ekler orada açıklama bekliyor); başarıda `onSend` onu tek seferde boşaltır.
   *
   * 🔴 **Kısmi başarısızlık = mesaj GÖNDERİLMEZ** (sözleşme §3). Yarısı giden mesaj sessiz veri
   * kaybıdır. Başarılı olanların kimliği dizide KALIR: kullanıcı tekrar denediğinde aynı dosya
   * ikinci kez yüklenmez (hem veri yakar hem sunucuda sahipsiz kayıt biriktirirdi).
   *
   * Sıralı yükleme bilinçli: paralelde ilk hata diğerlerini yarıda bırakır ve "kaçıncısı patladı"
   * bilgisi kaybolur; ayrıca mobil bağlantıda aynı anda 10 PUT açmak faydadan çok zarar.
   */
  async function uploadAttachments(drafts: DraftAttachment[]): Promise<string[]> {
    for (let i = 0; i < drafts.length; i += 1) {
      if (drafts[i].uploadedId) continue;
      setUploadLabel(t('mobile.attach.uploading', { done: i + 1, total: drafts.length }));
      // M6c §3.3 — video önce telefonda sıkıştırılır (yüzde etiketi), sonra yüklenir. Sonuç taslağa
      // yazılır: hata sonrası tekrar denemede yeniden sıkıştırılmaz.
      if (drafts[i].isVideo && !drafts[i].prepared) {
        drafts[i] = await prepareVideoDraft(drafts[i], (pct) =>
          setUploadLabel(t('mobile.video.preparing', { pct })),
        );
        setUploadLabel(t('mobile.attach.uploading', { done: i + 1, total: drafts.length }));
      }
      // Hata FIRLARSA dizi o ana kadarki ilerlemeyi taşır (çağıran yakalayıp state'e yazar).
      drafts[i] = { ...drafts[i], uploadedId: await uploadDraftAttachment(drafts[i]) };
    }
    return drafts.map((a) => a.uploadedId!);
  }

  /**
   * @param pending Panelden yeni onaylanan ekler — AYNI çağrıda gönderilir. Görünür state'e
   * yazılmaz: ayrı `add` + `send` olsaydı hem `attachments` bu çağrının kapanışında eski değeri
   * taşırdı hem de şerit başarılı gönderimde bir kare parlardı.
   */
  async function onSend(pending?: DraftAttachment[]) {
    // 🔴 Yerel çalışma kopyası. `uploadAttachments` bunu YERİNDE günceller; hata yolunda
    // `setAttachments(drafts)` ile şerit tam olarak bu hâliyle geri gelir (yüklenmişler işaretli).
    const drafts = pending?.length ? [...attachments, ...pending] : [...attachments];

    const trimmed = input.trim();
    // Sunucu ile aynı kural (`EMPTY_MESSAGE`): en az bir ek varsa boş metin geçerli.
    if ((!trimmed && drafts.length === 0) || sending) return;
    // C29: yalniz metin (+ yanit) iyimser gonderilir. Gecici mesaj aninda listeye girer, kutu hemen
    // temizlenir, `sending` kilidi YOK (art arda yazilabilir); hata mesajin kendi altinda gosterilir.
    // Ekli gonderim asagidaki bugunku akista kalir.
    if (drafts.length === 0) {
      typing.stop();
      sendOptimisticText(channelId, mentions ? mentions.applyMentionTokens(trimmed) : trimmed, replyTo);
      setReplyTo(null);
      setSendError('');
      setInput('');
      mentions?.clearPicked();
      return;
    }
    setSending(true);
    setSendError('');
    typing.stop();
    // M2d — `@ad` → `<@userId>`, `@everyone` → `<@&roleId>`. 
    const payload = mentions ? mentions.applyMentionTokens(trimmed) : trimmed;
    try {
      const attachmentIds = drafts.length ? await uploadAttachments(drafts) : undefined;
      const message = await messagesApi.send(channelId, payload, replyTo?.id, attachmentIds);
      appendMessage(message);
      setReplyTo(null);
      // Şerit zaten boşsa gereksiz render açılmasın (mutlu yol artık state'e hiç dokunmuyor).
      setAttachments((prev) => (prev.length ? [] : prev));
      setInput('');
      // Yalnız BAŞARIDA temizlenir: hata durumunda kullanıcı tekrar deneyecek, seçtiği
      // bahsetmeleri kaybetmesin (sözleşme §4.3).
      mentions?.clearPicked();
    } catch (e) {
      // 🔴 Seçim burada KORUNUR (sözleşme §3): hata hangi adımda olursa olsun (yükleme ya da
      // mesaj gönderimi) taslaklar şeride geri konur — yüklenmiş olanlar `uploadedId`siyle, ki
      // tekrar denemede yeniden yüklenmesinler.
      // M6b §7.5 — başarısız SESLİ MESAJ taslağı şeride "dosya çipi" olarak düşmez, atılır (yeniden
      // kaydedilir); hata mesajı yine gösterilir.
      // Hazırlanamayan/25 MB'ı aşan video da atılır (tekrar denemek aynı sonucu verir).
      const prepareFailed = e instanceof VideoPrepareError;
      const keep = drafts.filter((d) => !d.isVoice && !(prepareFailed && d.isVideo && !d.prepared));
      if (drafts.length) setAttachments(keep);
      // Depolamaya PUT hatasının envelope'ı yok → ham durum kodu ekrana basılmaz, ne olduğu yazılır.
      // Ek yüklemede doğrulanmamış e-posta için bağlama uygun metin (genel metin "Ortam oluşturmak…" diyor).
      setSendError(
        e instanceof VideoPrepareError
          ? t(e.key)
          : isStorageUploadError(e)
          ? t('mobile.attach.uploadFailed')
          : drafts.length && extractErrorCode(e) === 'EMAIL_NOT_VERIFIED'
            ? t('voiceMessage.errors.EMAIL_NOT_VERIFIED')
            : extractErrorMessage(e),
      );
    } finally {
      setUploadLabel('');
      setSending(false);
    }
  }

  return {
    input,
    sending,
    sendError,
    uploadLabel,
    replyTo,
    attachments,
    addAttachments,
    removeAttachment,
    onChangeInput,
    onSend,
    startReply,
    cancelMode,
  };
}
