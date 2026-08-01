import { MessageActionSheet } from './MessageActionSheet';
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
}

export function MessageActionHost({ actions, onReply, onEdit }: Props) {
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
        onDelete={() => {
          actions.setDeleteTarget(actions.target);
          actions.close();
        }}
      />

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
