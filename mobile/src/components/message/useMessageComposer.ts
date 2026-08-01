import { useState } from 'react';
import { messagesApi, type MessageDto } from '@/api/messages';
import { extractErrorMessage } from '@/api/errors';
import { useMessagesStore } from '@/stores/messages';

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
 */
export function useMessageComposer(
  channelId: string,
  typing: { onInputChange: (text: string) => void; stop: () => void },
) {
  const appendMessage = useMessagesStore((s) => s.appendMessage);
  const updateMessage = useMessagesStore((s) => s.updateMessage);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [replyTo, setReplyTo] = useState<MessageDto | null>(null);
  const [editing, setEditing] = useState<MessageDto | null>(null);

  function onChangeInput(text: string) {
    setInput(text);
    // Düzenlerken "yazıyor" yayınlanmaz: karşı taraf yeni mesaj bekler, oysa eski mesaj değişiyor.
    if (!editing) typing.onInputChange(text);
  }

  function startReply(message: MessageDto) {
    setEditing(null);
    setReplyTo(message);
  }

  /** Düzenlemeye geçince kutu mevcut içerikle dolar — kullanıcı sıfırdan yazmaz. */
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

  async function onSend() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError('');
    typing.stop();
    try {
      if (editing) {
        // Sunucu düzenlemeyi yalnız YAZARA açıyor; yetkisizde bu mod zaten başlatılmıyor.
        const updated = await messagesApi.edit(channelId, editing.id, trimmed);
        // WS `message.updated` de gelir; store aynı id'yi yerine koyduğu için mükerrer olmaz.
        updateMessage(updated);
        setEditing(null);
      } else {
        const message = await messagesApi.send(channelId, trimmed, replyTo?.id);
        appendMessage(message);
        setReplyTo(null);
      }
      setInput('');
    } catch (e) {
      setSendError(extractErrorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return {
    input,
    sending,
    sendError,
    replyTo,
    editing,
    onChangeInput,
    onSend,
    startReply,
    startEdit,
    cancelMode,
  };
}
