import EmojiPicker, { tr as emojiTr } from 'rn-emoji-keyboard';
import { MessageActionSheet } from './MessageActionSheet';
import { ForwardMessageModal } from './ForwardMessageModal';
import { emojiPickerTheme } from './emojiPickerTheme';
import type { useMessageActions } from './useMessageActions';
import { ConfirmDialog } from '../ConfirmDialog';
import { t } from '@/i18n';

/**
 * Mesaj panelinin yerleşimi: panel + silme onayı bir arada. `DmMenuHost` ile aynı desen ve aynı
 * sebep — `MessageScreen` 300 satır eşiğinde ve bir panelin iç akışı ekranın işi değil.
 *
 * Kancanın kendisi ekranda kalır (`useMessageActions`), çünkü mesaj listesi `open`/`toggleReaction`
 * çağırıyor; buraya yalnız çıktısı geçer.
 */
interface Props {
  actions: ReturnType<typeof useMessageActions>;
  /** Yanıtla — giriş kutusuna alıntı şeridi koyar. */
  onReply: () => void;
  /** Düzenle — giriş kutusunu düzenleme moduna alır. */
  onEdit: () => void;
  /** Sprint M1h — sabitleme yetkisi (ortamda `MANAGE_MESSAGES`, DM/grupta her üye). */
  canPin: boolean;
}

export function MessageActionHost({ actions, onReply, onEdit, canPin }: Props) {
  return (
    <>
      <MessageActionSheet
        visible={!!actions.target}
        isMine={actions.isMine}
        myEmojis={actions.myEmojis}
        onClose={actions.close}
        onToggleReaction={(emoji) => {
          const m = actions.target;
          actions.close();
          if (m) actions.toggleReaction(m, emoji);
        }}
        onReply={onReply}
        onEdit={onEdit}
        onCopy={() => {
          const m = actions.target;
          actions.close();
          if (m) void actions.copyText(m);
        }}
        onOpenPicker={actions.openPicker}
        onForward={actions.openForward}
        onDelete={() => {
          actions.setDeleteTarget(actions.target);
          actions.close();
        }}
        canPin={canPin}
        isPinned={actions.isPinned}
        onTogglePin={() => {
          const m = actions.target;
          actions.close();
          if (m) void actions.togglePin(m);
        }}
      />

      {/* Tam emoji listesi — `rn-emoji-keyboard` (PM onaylı bağımlılık: MIT, SIFIR bağımlılık,
          native modül yok → Expo Go'da çalışır, dev build gerektirmez).
          Kategori adları ve arama metni kütüphanenin KENDİ Türkçe paketinden (`tr`) geliyor;
          bizim tr.json'a emoji kategorisi kopyalanmadı.
          Sprint M3c §4 — tema nesnesi `emojiPickerTheme.ts`e taşındı: mesaj kutusundaki emoji
          düğmesi aynı seçiciyi kullanıyor, iki yerde aynı 20 satırlık renk bloğu tutulsaydı biri
          değişip diğeri unutulurdu. **Akış değişmedi**, yalnız renkler tek kaynağa bağlandı. */}
      <EmojiPicker
        open={actions.pickerOpen}
        onClose={actions.closePicker}
        onEmojiSelected={(e) => actions.pickEmoji(e.emoji)}
        translation={emojiTr}
        enableSearchBar
        categoryPosition="top"
        theme={emojiPickerTheme}
      />

      {actions.forwardTarget && (
        <ForwardMessageModal message={actions.forwardTarget} onClose={actions.closeForward} />
      )}

      {actions.deleteTarget && (
        <ConfirmDialog
          message={t('message.deleteConfirm')}
          confirmLabel={t('message.delete')}
          loading={actions.deleting}
          onConfirm={actions.confirmDelete}
          onCancel={() => actions.setDeleteTarget(null)}
        />
      )}
    </>
  );
}
