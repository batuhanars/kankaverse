import { ForwardMessageModal } from './ForwardMessageModal';
import { EmojiGifSheet } from './EmojiGifSheet';
import { ReactionsSheet } from './ReactionsSheet';
import { QuickReactionStrip } from './QuickReactionStrip';
import { SelectionHeaderLeft, SelectionHeaderRight, SelectionHeaderTitle, type BarAction } from './SelectionBar';
import type { MessageAuthorDto, MessageDto } from '@/api/messages';
import { recordEmojiUse } from '@/utils/recentEmojis';
import { canReportMessage } from '@/utils/reportPayload';
import { useAuthStore } from '@/stores/auth';
import { useReportStore } from '@/stores/report';
import { showToast } from '@/stores/toast';
import type { useMessageActions } from './useMessageActions';
import type { useMessageSelection } from './useMessageSelection';
import { ConfirmDialog } from '../ConfirmDialog';
import { t } from '@/i18n';

/** C81 §2: bir seferde iletilebilecek en çok mesaj (5 hedef sınırıyla birlikte toplu yaymayı sınırlar). */
const FORWARD_MAX = 20;

type Actions = ReturnType<typeof useMessageActions>;
type Selection = ReturnType<typeof useMessageSelection>;

/**
 * Mesaj eylemlerinin modalları: tam emoji listesi, Tepkileri gör, İlet, silme onayı. C81: uzun basınca açılan
 * alt panel (`MessageActionSheet`) KALDIRILDI; yerine seçim çubuğu (`MessageSelectionBar`, aşağıda).
 */
export function MessageActionHost({
  actions,
  onOpenProfile,
}: {
  actions: Actions;
  /** C46 — "Tepkileri gör" panelinde kişiye dokunuş: çağıran ekran profil panelini açar. */
  onOpenProfile: (user: MessageAuthorDto) => void;
}) {
  const many = actions.deleteTargets.length > 1;
  return (
    <>
      {/* C24: tam liste C23'ün `EmojiGifSheet`i (GIF sekmesi kapalı); seçilen emoji tepki olur. */}
      <EmojiGifSheet
        visible={actions.pickerOpen}
        onClose={actions.closePicker}
        onEmojiSelected={actions.pickEmoji}
        showGif={false}
        defaultReactions
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

      {actions.forwardTargets.length > 0 && (
        <ForwardMessageModal messages={actions.forwardTargets} onClose={actions.closeForward} />
      )}

      {actions.deleteTargets.length > 0 && (
        <ConfirmDialog
          message={
            many ? t('mobile.select.deleteConfirm', { n: actions.deleteTargets.length }) : t('message.deleteConfirm')
          }
          confirmLabel={t('message.delete')}
          loading={actions.deleting}
          onConfirm={() => void actions.confirmDelete()}
          onCancel={() => actions.setDeleteTargets([])}
        />
      )}
    </>
  );
}

interface BarProps {
  actions: Actions;
  selection: Selection;
  /** C62 — salt okunur geçmiş: yalnız Kopyala + Şikâyet et. */
  readOnly?: boolean;
  /** Verilmezse Yanıtla çizilmez (C57: mesaj kutusu kapalı). */
  onReply?: (message: MessageDto) => void;
  onEdit: (message: MessageDto) => void;
  /** Sprint M1h — sabitleme yetkisi (ortamda `MANAGE_MESSAGES`, DM/grupta her üye). */
  canPin: boolean;
  /** Başkasının bu mesajını silebilir miyim (ortamda `MANAGE_MESSAGES`, grupta kurucu/yönetici). */
  canDeleteOthers?: (message: MessageDto) => boolean;
}

/**
 * C81 §2 — seçim modunun başlık parçaları (Rev.2: native başlığın içinde). Yetki sunucudadır; istemci yalnız
 * yetkisi olmayan eylemi ÇİZMEZ (disabled göstermez). Sil, seçilenlerin HEPSİNİ silebiliyorsam görünür; sunucu
 * her mesajda yeniden denetler.
 */
export function useSelectionHeader({ actions, selection, readOnly = false, onReply, onEdit, canPin, canDeleteOthers }: BarProps) {
  const myId = useAuthStore((s) => s.user?.id);
  const openReport = useReportStore((s) => s.openReport);
  const msgs = selection.selected;
  const single = msgs.length === 1 ? msgs[0] : null;
  const isMine = (m: MessageDto) => m.author.id === myId;
  const canDeleteAll = msgs.every((m) => isMine(m) || !!canDeleteOthers?.(m));
  /** Eylemi çalıştır, seçim modunu kapat. */
  const run = (fn: () => void) => () => {
    selection.clear();
    fn();
  };

  const barActions: BarAction[] = [
    {
      key: 'reply',
      icon: 'arrow-undo-outline',
      label: t('reply.button'),
      show: !!single && !!onReply && !readOnly,
      onPress: run(() => single && onReply?.(single)),
    },
    {
      // Sahip turu: başlıkta Kopyala yerine Düzenle (kopyala ⋮ menüsünde).
      key: 'edit',
      icon: 'pencil-outline',
      label: t('message.edit'),
      show: !!single && !readOnly && isMine(single),
      onPress: run(() => single && onEdit(single)),
    },
    {
      key: 'forward',
      icon: 'arrow-redo-outline',
      label: t('message.forward'),
      show: !readOnly,
      onPress: () => {
        if (msgs.length > FORWARD_MAX) {
          showToast(t('mobile.select.forwardLimit', { n: FORWARD_MAX }));
          return;
        }
        run(() => actions.openForward(msgs))();
      },
    },
    {
      key: 'delete',
      icon: 'trash-outline',
      label: t('message.delete'),
      danger: true,
      show: !readOnly && canDeleteAll,
      onPress: run(() => actions.setDeleteTargets(msgs)),
    },
  ];

  const copy: BarAction = {
    key: 'copy',
    icon: 'copy-outline',
    label: t('message.copyText'),
    show: msgs.some((m) => m.content.trim()),
    onPress: run(() => void actions.copyMessages(msgs)),
  };
  const menu: BarAction[] = !single
    ? [copy]
    : [
        copy,
        {
          key: 'pin',
          icon: single.pinnedAt ? 'bookmark' : 'bookmark-outline',
          label: single.pinnedAt ? t('message.unpin') : t('message.pin'),
          show: !readOnly && canPin,
          onPress: run(() => void actions.togglePin(single)),
        },
        {
          key: 'reactions',
          icon: 'happy-outline',
          label: t('reaction.viewReactions'),
          show: !readOnly && (single.reactions?.length ?? 0) > 0,
          onPress: run(() => actions.openReactions(single)),
        },
        {
          key: 'report',
          icon: 'flag-outline',
          label: t('report.reportMessage'),
          danger: true,
          show: canReportMessage(single.author.id, myId, single.localStatus),
          onPress: run(() =>
            openReport({ targetType: 'MESSAGE', targetId: single.id, channelId: single.channelId }),
          ),
        },
      ];

  return {
    left: () => <SelectionHeaderLeft onClose={selection.clear} />,
    title: () => <SelectionHeaderTitle count={msgs.length} />,
    right: () => <SelectionHeaderRight actions={barActions} menu={menu} />,
  };
}

/**
 * C81 — seçili TEK mesajın üstünde süzülen hızlı tepki şeridi. Konum `useReactionAnchor`dan (dokunulan nokta);
 * konum yoksa (kaydırıldı, seçim tekrar teke indi) çizilmez. Tepki verilince seçim modu kapanır.
 */
export function SelectionReactions({
  actions,
  selection,
  top,
  readOnly = false,
}: {
  actions: Actions;
  selection: Selection;
  top: number | null;
  readOnly?: boolean;
}) {
  const single = selection.selected.length === 1 ? selection.selected[0] : null;
  if (!single || readOnly || top === null) return null;
  return (
    <QuickReactionStrip
      top={top}
      myEmojis={single.reactions?.filter((r) => r.reactedByMe).map((r) => r.emoji) ?? []}
      onPick={(emoji) => {
        selection.clear();
        // Şerit dokunuşu da sık kullanılanlara sayılır (web ile aynı).
        void recordEmojiUse(emoji);
        actions.toggleReaction(single, emoji);
      }}
      onOpenPicker={() => {
        selection.clear();
        actions.openPicker(single);
      }}
    />
  );
}
