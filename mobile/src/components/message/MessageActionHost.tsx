import { useRouter } from 'expo-router';
import { MessageActionSheet } from './MessageActionSheet';
import { ForwardMessageModal } from './ForwardMessageModal';
import { EmojiGifSheet } from './EmojiGifSheet';
import { recordEmojiUse } from '@/utils/recentEmojis';
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
  const router = useRouter();
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
          // Şerit dokunuşu da sık kullanılanlara sayılır (web ile aynı).
          void recordEmojiUse(emoji);
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
        onEditQuickReactions={() => {
          actions.close();
          router.push('/quick-reactions');
        }}
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

      {/* C24: tam liste artık C23'ün `EmojiGifSheet`i (GIF sekmesi kapalı) — "Sık kullanılanlar" üstte,
          mesaj kutusu seçicisiyle aynı liste. Seçilen emoji `pickEmoji` ile tepki olur ve sayfa kapanır. */}
      <EmojiGifSheet
        visible={actions.pickerOpen}
        onClose={actions.closePicker}
        onEmojiSelected={actions.pickEmoji}
        showGif={false}
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
