import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { messagesApi, type MessageDto } from '@/api/messages';
import { useAuthStore } from '@/stores/auth';

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
  const [deleteTarget, setDeleteTarget] = useState<MessageDto | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  async function copyText(message: MessageDto) {
    await Clipboard.setStringAsync(message.content);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await messagesApi.remove(channelId, deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return {
    target,
    isMine: !!target && target.author.id === myId,
    myEmojis: target?.reactions?.filter((r) => r.reactedByMe).map((r) => r.emoji) ?? [],
    open,
    close,
    toggleReaction,
    copyText,
    deleteTarget,
    setDeleteTarget,
    deleting,
    confirmDelete,
  };
}
