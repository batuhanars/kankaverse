import { useState } from 'react';
import { messagesApi, type MessageDto } from '@/api/messages';
import { extractErrorMessage } from '@/api/errors';
import {
  isStorageUploadError,
  uploadDraftAttachment,
  type DraftAttachment,
} from '@/utils/attachmentUpload';
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
   * Taslak ekleri yükler ve `attachmentId` listesini döner.
   *
   * 🔴 **Kısmi başarısızlık = mesaj GÖNDERİLMEZ** (sözleşme §3). Yarısı giden mesaj sessiz veri
   * kaybıdır. Başarılı olanların kimliği taslakta SAKLANIR: kullanıcı tekrar denediğinde aynı dosya
   * ikinci kez yüklenmez (hem veri yakar hem sunucuda sahipsiz kayıt biriktirirdi).
   *
   * Sıralı yükleme bilinçli: paralelde ilk hata diğerlerini yarıda bırakır ve "kaçıncısı patladı"
   * bilgisi kaybolur; ayrıca mobil bağlantıda aynı anda 10 PUT açmak faydadan çok zarar.
   */
  async function uploadAttachments(drafts: DraftAttachment[]): Promise<string[]> {
    const next = [...drafts];
    for (let i = 0; i < next.length; i += 1) {
      if (next[i].uploadedId) continue;
      setUploadLabel(t('mobile.attach.uploading', { done: i + 1, total: next.length }));
      try {
        const uploadedId = await uploadDraftAttachment(next[i]);
        next[i] = { ...next[i], uploadedId };
      } catch (e) {
        // Buraya kadar yüklenenler korunur; kutudaki seçim de durur.
        setAttachments(next);
        throw e;
      }
    }
    setAttachments(next);
    return next.map((a) => a.uploadedId!);
  }

  /**
   * @param pending Panelden yeni onaylanan ekler — state'e yazılıp AYNI çağrıda gönderilir.
   * Ayrı `add` + `send` olsaydı `attachments` bu çağrının kapanışında hâlâ eski değeri taşırdı.
   */
  async function onSend(pending?: DraftAttachment[]) {
    const drafts = pending?.length ? [...attachments, ...pending] : attachments;
    if (pending?.length) setAttachments(drafts);

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
        setAttachments([]);
      }
      setInput('');
      // Yalnız BAŞARIDA temizlenir: hata durumunda kullanıcı tekrar deneyecek, seçtiği
      // bahsetmeleri kaybetmesin (sözleşme §4.3).
      mentions?.clearPicked();
    } catch (e) {
      // Depolamaya PUT hatasının envelope'ı yok → ham durum kodu ekrana basılmaz, ne olduğu yazılır.
      setSendError(isStorageUploadError(e) ? t('mobile.attach.uploadFailed') : extractErrorMessage(e));
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
