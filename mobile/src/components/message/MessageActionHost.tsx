import EmojiPicker, { tr as emojiTr } from 'rn-emoji-keyboard';
import { MessageActionSheet } from './MessageActionSheet';
import { ForwardMessageModal } from './ForwardMessageModal';
import type { useMessageActions } from './useMessageActions';
import { ConfirmDialog } from '../ConfirmDialog';
import { t } from '@/i18n';
import { theme } from '@/theme';

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
        onOpenPicker={actions.openPicker}
        onForward={actions.openForward}
        onDelete={() => {
          actions.setDeleteTarget(actions.target);
          actions.close();
        }}
      />

      {/* Tam emoji listesi — `rn-emoji-keyboard` (PM onaylı bağımlılık: MIT, SIFIR bağımlılık,
          native modül yok → Expo Go'da çalışır, dev build gerektirmez).
          Kategori adları ve arama metni kütüphanenin KENDİ Türkçe paketinden (`tr`) geliyor;
          bizim tr.json'a emoji kategorisi kopyalanmadı. Renkler `src/theme` token'larından —
          kütüphanenin varsayılan teması bizim koyu paletimizle uyuşmuyordu. Gölge yok. */}
      <EmojiPicker
        open={actions.pickerOpen}
        onClose={actions.closePicker}
        onEmojiSelected={(e) => actions.pickEmoji(e.emoji)}
        translation={emojiTr}
        enableSearchBar
        categoryPosition="top"
        theme={{
          backdrop: 'rgba(0, 0, 0, 0.55)',
          knob: theme.colors.borderStrong,
          container: theme.colors.bgSidebar,
          header: theme.colors.textPrimary,
          skinTonesContainer: theme.colors.bgElevated,
          category: {
            icon: theme.colors.textMuted,
            iconActive: theme.colors.accent500,
            container: theme.colors.bgElevated,
            containerActive: theme.colors.accentSubtle,
          },
          search: {
            background: theme.colors.bgElevated,
            text: theme.colors.textPrimary,
            placeholder: theme.colors.textMuted,
            icon: theme.colors.textMuted,
          },
        }}
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
