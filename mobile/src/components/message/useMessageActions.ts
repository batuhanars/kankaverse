import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { messagesApi, type MessageDto } from '@/api/messages';
import { extractErrorMessage } from '@/api/errors';
import { useAuthStore } from '@/stores/auth';
import { forgetE2eeMessage } from '@/stores/e2ee';

/**
 * Mesaj panelinin akışı (M1d-C §2.4): hangi mesaja uzun basıldı, tepki aç/kapa, kopyala, sil.
 *
 * `MessageScreen`den ayrı çünkü o dosya 300 satır eşiğinde duruyor ve bu akış kendi içinde kapalı.
 *
 * 🔴 **İyimser güncelleme YOK.** Tepki eklendiğinde/kaldırıldığında yerel sayaç elle
 * değiştirilmiyor; tek yazma yolu WS `reaction.added`/`reaction.removed` olayı (bkz.
 * `realtime/socket.ts`). Sebep M1a'daki `message.created` echo dersi: hem yerel hem olaydan yazılırsa
 * aynı tepki iki kez sayılır. Silme de aynı: `message.deleted` olayı listeden düşürür.
 */
export function useMessageActions(channelId: string) {
  const myId = useAuthStore((s) => s.user?.id);
  const [target, setTarget] = useState<MessageDto | null>(null);
  /** Panel kapandıktan sonra oluşan hatalar (sabitleme sınırı, yetki) — ekranda gösterilir. */
  const [actionError, setActionError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MessageDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Tam emoji listesi ayrı bir modal; panel KAPANIP açılıyor (iç içe modal Android'de güvenilmez).
  // Hedef mesaj bu yüzden ayrı tutulur: panel kapanınca `target` sıfırlanıyor.
  const [pickerTarget, setPickerTarget] = useState<MessageDto | null>(null);
  // İletme de ayrı modal, aynı sebeple ayrı hedef.
  const [forwardTarget, setForwardTarget] = useState<MessageDto | null>(null);

  // C46: "Tepkileri gör" paneli de ayrı modal (iç içe modal güvenilmez); hedef ayrı tutulur.
  const [reactionsTarget, setReactionsTarget] = useState<MessageDto | null>(null);

  function open(message: MessageDto) {
    setTarget(message);
  }

  function close() {
    setTarget(null);
  }

  /** Verdiğim tepkiyi kaldırır, vermediğime katılır. Hata sessiz: tepki kritik bir işlem değil. */
  function toggleReaction(message: MessageDto, emoji: string) {
    const mine = message.reactions?.some((r) => r.emoji === emoji && r.reactedByMe) ?? false;
    const call = mine
      ? messagesApi.removeReaction(channelId, message.id, emoji)
      : messagesApi.addReaction(channelId, message.id, emoji);
    void call.catch(() => {});
  }

  /**
   * C46 §6.1 — çift dokunma. YALNIZ EKLER: kişinin bu mesajda zaten herhangi bir tepkisi varsa
   * hiçbir şey olmaz (yanlışlıkla değiştirme/silme yok; kişi başı tek tepki). Karar mesajın
   * `reactedByMe` bilgisiyle verilir; yazma yine yalnız WS olayından (iyimser güncelleme yok).
   * Yerel/gönderilmemiş mesajda çağıran taraf zaten bağlamaz.
   */
  function quickReact(message: MessageDto, emoji: string | undefined) {
    if (!emoji || message.localStatus) return;
    if (message.reactions?.some((r) => r.reactedByMe)) return;
    void messagesApi.addReaction(channelId, message.id, emoji).catch(() => {});
  }

  /** Panelden tam listeye geç: paneli kapat, hedefi picker'a devret. */
  function openPicker() {
    setPickerTarget(target);
    setTarget(null);
  }

  /**
   * Picker'dan seçilen emoji **EKLENİR, toggle edilmez** (web `MessageItem.addReaction` ile aynı):
   * listeden bilinçle emoji seçen kullanıcı tepki vermek istiyordur; zaten vermişse sunucu
   * idempotent davranır. Toggle yalnız baloncuktaki pill'e dokununca çalışır.
   */
  function pickEmoji(emoji: string) {
    const message = pickerTarget;
    setPickerTarget(null);
    if (!message) return;
    void messagesApi.addReaction(channelId, message.id, emoji).catch(() => {});
  }

  async function copyText(message: MessageDto) {
    await Clipboard.setStringAsync(message.content);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await messagesApi.remove(channelId, deleteTarget.id);
      void forgetE2eeMessage(channelId, deleteTarget.id); // E5a §4.1
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return {
    target,
    isMine: !!target && target.author.id === myId,
    isPinned: !!target?.pinnedAt,
    /**
     * Sprint M1h — sabitle/kaldır. Sunucu **idempotent** ve kanal başına **50 sınırı** koyuyor;
     * sınır aşılırsa Türkçe mesajıyla 409 döner ve o mesaj kullanıcıya gösterilir.
     * İyimser güncelleme YOK: sonuç zaten sokete düşüyor, iki kaynak birbiriyle yarışmasın.
     */
    async togglePin(message: MessageDto) {
      try {
        if (message.pinnedAt) await messagesApi.unpin(channelId, message.id);
        else await messagesApi.pin(channelId, message.id);
      } catch (e) {
        setActionError(extractErrorMessage(e));
      }
    },
    actionError,
    clearActionError: () => setActionError(''),
    myEmojis: target?.reactions?.filter((r) => r.reactedByMe).map((r) => r.emoji) ?? [],
    open,
    close,
    toggleReaction,
    quickReact,
    reactionsTarget,
    openReactions: (message: MessageDto) => {
      setReactionsTarget(message);
      setTarget(null);
    },
    closeReactions: () => setReactionsTarget(null),
    pickerOpen: !!pickerTarget,
    openPicker,
    closePicker: () => setPickerTarget(null),
    pickEmoji,
    forwardTarget,
    openForward: () => {
      setForwardTarget(target);
      setTarget(null);
    },
    closeForward: () => setForwardTarget(null),
    copyText,
    deleteTarget,
    setDeleteTarget,
    deleting,
    confirmDelete,
  };
}
