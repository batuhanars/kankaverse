import { useRouter } from 'expo-router';
import { MessageActionSheet } from './MessageActionSheet';
import { ForwardMessageModal } from './ForwardMessageModal';
import { EmojiGifSheet } from './EmojiGifSheet';
import { ReactionsSheet } from './ReactionsSheet';
import type { MessageAuthorDto, MessageDto } from '@/api/messages';
import { recordEmojiUse } from '@/utils/recentEmojis';
import { canReportMessage } from '@/utils/reportPayload';
import { useAuthStore } from '@/stores/auth';
import { useReportStore } from '@/stores/report';
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
  /** Yanıtla — giriş kutusuna alıntı şeridi koyar. Verilmezse seçenek gizlenir (yazılamayan sohbet). */
  onReply?: () => void;
  /** Düzenle — giriş kutusunu düzenleme moduna alır. */
  onEdit: () => void;
  /** Sprint M1h — sabitleme yetkisi (ortamda `MANAGE_MESSAGES`, DM/grupta her üye). */
  canPin: boolean;
  /** Başkasının bu mesajını silebilir miyim (ortamda `MANAGE_MESSAGES`, grupta kurucu/yönetici). */
  canDeleteOthers?: (message: MessageDto) => boolean;
  /** C46 — "Tepkileri gör" panelinde kişiye dokunuş: çağıran ekran profil panelini açar. */
  onOpenProfile: (user: MessageAuthorDto) => void;
}

export function MessageActionHost({ actions, onReply, onEdit, canPin, canDeleteOthers, onOpenProfile }: Props) {
  const router = useRouter();
  const myId = useAuthStore((s) => s.user?.id);
  const openReport = useReportStore((s) => s.openReport);
  return (
    <>
      <MessageActionSheet
        visible={!!actions.target}
        isMine={actions.isMine}
        canDelete={actions.isMine || (!!actions.target && !!canDeleteOthers?.(actions.target))}
        myEmojis={actions.myEmojis}
        onClose={actions.close}
        onToggleReaction={(emoji) => {
          const m = actions.target;
          actions.close();
          // Şerit dokunuşu da sık kullanılanlara sayılır (web ile aynı).
          void recordEmojiUse(emoji);
          if (m) actions.toggleReaction(m, emoji);
        }}
        hasReactions={(actions.target?.reactions?.length ?? 0) > 0}
        onShowReactions={() => {
          if (actions.target) actions.openReactions(actions.target);
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
        canReport={
          !!actions.target && canReportMessage(actions.target.author.id, myId, actions.target.localStatus)
        }
        onReport={() => {
          const m = actions.target;
          actions.close();
          if (m) openReport({ targetType: 'MESSAGE', targetId: m.id, channelId: m.channelId });
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

      {actions.reactionsTarget && (
        <ReactionsSheet
          channelId={actions.reactionsTarget.channelId}
          message={actions.reactionsTarget}
          onClose={actions.closeReactions}
          onSelectUser={(user) => {
            // Aynı anda tek modal: panel kapanır, sonra profil açılır.
            actions.closeReactions();
            onOpenProfile(user);
          }}
        />
      )}

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
