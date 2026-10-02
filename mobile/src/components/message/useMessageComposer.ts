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
import { t } from '@/i18n';

/**
 * Giriş kutusunun durumu ve ÜÇ modu (M1d-C §2.4-§2.5): normal · **yanıtlıyorum** · **düzenliyorum**.
 *
 * `MessageScreen`den ayrıldı çünkü o dosya tam 300 satır eşiğindeydi ve bu iş kendi içinde kapalı:
 * metin, gönderim, hata ve mod tek yerde durunca "gönder tuşuna basınca ne olur" sorusunun cevabı
 * tek fonksiyonda okunuyor.
 *
 * 🔴 **Düzenleme ve yanıt aynı kutuyu paylaşır, aynı anda ikisi birden olamaz.** Yanıtlarken
 * düzenlemeye geçilirse yanıt hedefi düşer (ve tersi) — iki bağlamı üst üste bindirmek "neye
 * gönderiyorum" sorusunu belirsizleştirirdi.
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
  const updateMessage = useMessagesStore((s) => s.updateMessage);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [replyTo, setReplyTo] = useState<MessageDto | null>(null);
  const [editing, setEditing] = useState<MessageDto | null>(null);
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  /** Yükleme sırasında kutuda gösterilen ilerleme metni ("Yükleniyor… 2/5"); boşsa gösterilmez. */
  const [uploadLabel, setUploadLabel] = useState('');

  function onChangeInput(text: string) {
    setInput(text);
    // Düzenlerken "yazıyor" yayınlanmaz: karşı taraf yeni mesaj bekler, oysa eski mesaj değişiyor.
    if (!editing) typing.onInputChange(text);
  }

  function startReply(message: MessageDto) {
    setEditing(null);
    setReplyTo(message);
  }

  /**
   * Düzenlemeye geçince kutu mevcut içerikle dolar — kullanıcı sıfırdan yazmaz.
   *
   * 🔴 Bekleyen ekler DÜŞÜRÜLMEZ ama gönderilmez de: düzenleme ucu (`PATCH .../messages/:id`)
   * yalnız `content` alıyor, var olan bir mesaja sonradan ek bağlanamıyor. Kutu düzenleme modundayken
   * ek düğmesi de gizlenir (bkz. `MessageComposer`), böylece "ekledim ama gitmedi" hâli oluşmaz.
   */
  function startEdit(message: MessageDto) {
    setReplyTo(null);
    setEditing(message);
    setInput(message.content);
    setSendError('');
  }

  /** Moddan çık: düzenlemede kutuyu da temizle, yanıtta yazılanı KORU (metin hâlâ geçerli). */
  function cancelMode() {
    if (editing) setInput('');
    setEditing(null);
    setReplyTo(null);
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
   * (sahip bulgusu: "görsel bir anlığına kutuya düşüyor"). Şerit bir hata kurtarma yüzeyi;
   * her şey yolunda giderken görünmesi için sebep yok.
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
    setSending(true);
    setSendError('');
    typing.stop();
    // M2d — `@ad` → `<@userId>`, `@everyone` → `<@&roleId>`. Düzenlemede de uygulanır.
    const payload = mentions ? mentions.applyMentionTokens(trimmed) : trimmed;
    try {
      if (editing) {
        // Sunucu düzenlemeyi yalnız YAZARA açıyor; yetkisizde bu mod zaten başlatılmıyor.
        const updated = await messagesApi.edit(channelId, editing.id, payload);
        // WS `message.updated` de gelir; store aynı id'yi yerine koyduğu için mükerrer olmaz.
        updateMessage(updated);
        setEditing(null);
      } else {
        const attachmentIds = drafts.length ? await uploadAttachments(drafts) : undefined;
        const message = await messagesApi.send(channelId, payload, replyTo?.id, attachmentIds);
        appendMessage(message);
        setReplyTo(null);
        // Şerit zaten boşsa gereksiz render açılmasın (mutlu yol artık state'e hiç dokunmuyor).
        setAttachments((prev) => (prev.length ? [] : prev));
      }
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
    editing,
    attachments,
    removeAttachment,
    onChangeInput,
    onSend,
    startReply,
    startEdit,
    cancelMode,
  };
}
