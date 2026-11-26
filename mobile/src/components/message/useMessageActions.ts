import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { messagesApi, type MessageDto } from '@/api/messages';
import { extractErrorMessage } from '@/api/errors';
import { forgetE2eeMessage } from '@/stores/e2ee';
import { showToast } from '@/stores/toast';
import { t } from '@/i18n';

/**
 * Mesaj eylemlerinin akışı: tepki aç/kapa, kopyala, ilet, sil, sabitle.
 *
 * C81: eskiden tek bir "uzun basılan mesaj" (`target`) üzerinden çalışıyordu (alt panel). Artık seçim modu
 * var: eylemler mesajı (ya da mesaj listesini) PARAMETRE olarak alır; hangi mesajların seçili olduğu
 * `useMessageSelection`ın işi.
 *
 * 🔴 **İyimser güncelleme YOK.** Tepki ve silme yalnız WS olayından yazılır (`reaction.added`,
 * `message.deleted`); hem yerel hem olaydan yazılırsa aynı tepki iki kez sayılırdı (M1a echo dersi).
 */
export function useMessageActions(channelId: string) {
  /** Eylemden sonra oluşan hatalar (sabitleme sınırı, yetki) ekranda gösterilir. */
  const [actionError, setActionError] = useState('');
  const [deleteTargets, setDeleteTargets] = useState<MessageDto[]>([]);
  const [deleting, setDeleting] = useState(false);
  // Tam emoji listesi, Tepkileri gör ve İlet ayrı modallar (iç içe modal Android'de güvenilmez).
  const [pickerTarget, setPickerTarget] = useState<MessageDto | null>(null);
  const [forwardTargets, setForwardTargets] = useState<MessageDto[]>([]);
  const [reactionsTarget, setReactionsTarget] = useState<MessageDto | null>(null);

  /** Verdiğim tepkiyi kaldırır, vermediğime katılır. Hata sessiz: tepki kritik bir işlem değil. */
  function toggleReaction(message: MessageDto, emoji: string) {
    const mine = message.reactions?.some((r) => r.emoji === emoji && r.reactedByMe) ?? false;
    const call = mine
      ? messagesApi.removeReaction(channelId, message.id, emoji)
      : messagesApi.addReaction(channelId, message.id, emoji);
    void call.catch(() => {});
  }

  /**
   * C46 §6.1 — çift dokunma. YALNIZ EKLER: kişinin bu mesajda zaten tepkisi varsa hiçbir şey olmaz
   * (kişi başı tek tepki, yanlışlıkla değiştirme yok).
   */
  function quickReact(message: MessageDto, emoji: string | undefined) {
    if (!emoji || message.localStatus) return;
    if (message.reactions?.some((r) => r.reactedByMe)) return;
    void messagesApi.addReaction(channelId, message.id, emoji).catch(() => {});
  }

  /**
   * Picker'dan seçilen emoji **EKLENİR, toggle edilmez** (web `MessageItem.addReaction` ile aynı): listeden
   * bilinçle emoji seçen kullanıcı tepki vermek istiyordur; sunucu idempotent.
   */
  function pickEmoji(emoji: string) {
    const message = pickerTarget;
    setPickerTarget(null);
    if (!message) return;
    void messagesApi.addReaction(channelId, message.id, emoji).catch(() => {});
  }

  /** C81 §3: tek mesajda yalnız metin; çokta kronolojik "ad: metin" satırları (metinsiz mesaj atlanır). */
  async function copyMessages(messages: MessageDto[]) {
    const text =
      messages.length === 1
        ? messages[0].content
        : messages
            .filter((m) => m.content.trim())
            .map((m) => `${m.author.username}: ${m.content}`)
            .join('\n');
    if (!text) return;
    await Clipboard.setStringAsync(text);
    showToast(t('mobile.select.copied'));
  }

  /**
   * C81 §3: sırayla mevcut silme ucu; sunucu her mesajda yetkiyi yeniden denetler. Kısmi hatada
   * başarılılar zaten `message.deleted` olayıyla düşer, kullanıcıya kaçının silindiği söylenir.
   */
  async function confirmDelete() {
    const targets = deleteTargets;
    if (targets.length === 0) return;
    setDeleting(true);
    let ok = 0;
    try {
      for (const m of targets) {
        try {
          await messagesApi.remove(channelId, m.id);
          void forgetE2eeMessage(channelId, m.id); // E5a §4.1
          ok += 1;
        } catch {
          // devam: diğerleri silinsin
        }
      }
    } finally {
      setDeleting(false);
      setDeleteTargets([]);
    }
    if (ok < targets.length) showToast(t('mobile.select.deletedPartial', { ok, n: targets.length }));
  }

  return {
    /**
     * Sprint M1h — sabitle/kaldır. Sunucu idempotent ve kanal başına 50 sınırı koyuyor; aşılırsa
     * Türkçe mesajıyla 409 döner ve gösterilir. İyimser güncelleme yok, sonuç sokete düşüyor.
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
    toggleReaction,
    quickReact,
    reactionsTarget,
    openReactions: (message: MessageDto) => setReactionsTarget(message),
    closeReactions: () => setReactionsTarget(null),
    pickerOpen: !!pickerTarget,
    openPicker: (message: MessageDto) => setPickerTarget(message),
    closePicker: () => setPickerTarget(null),
    pickEmoji,
    forwardTargets,
    openForward: (messages: MessageDto[]) => setForwardTargets(messages),
    closeForward: () => setForwardTargets([]),
    copyMessages,
    deleteTargets,
    setDeleteTargets,
    deleting,
    confirmDelete,
  };
}
