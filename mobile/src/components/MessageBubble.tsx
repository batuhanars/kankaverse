import { StyleSheet, Text, View } from 'react-native';
import { AttachmentView } from './AttachmentView';
import { formatMentionsPlain } from '@/utils/mentions';
import type { MessageDto } from '@/api/messages';
import { t } from '@/i18n';
import { theme } from '@/theme';

function formatClock(iso: string): string {
  const d = new Date(iso);
  // Kök CLAUDE.md — TR saat formatı "18.42" (nokta ayraçlı, iki hane).
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}.${mm}`;
}

interface Props {
  message: MessageDto;
  showAuthor: boolean;
  isMine: boolean;
  resolveMention: (userId: string) => string | undefined;
  /** Sözleşme §3.5 — mesaj aramasından "gidiyor" (jump) sonrası geçici vurgu. Birkaç saniye sonra
   *  otomatik söner (bkz. MessageScreen `highlightId` zamanlayıcısı). */
  highlighted?: boolean;
}

// Sprint M1a — web/src/components/shared/MessageItem.vue'nin bu sprintteki alt kümesi: okuma +
// mention gösterimi (contract §4.4) + ek gösterimi (§5.5). Düzenleme/silme/reaksiyon/pin UI'ı YOK
// (kapsam dışı) — ama `message.updated`/`message.deleted` WS'ten gelirse içerik/liste güncellenir
// (stores/messages.ts), bu bileşen yalnız güncel veriyi render eder.
export function MessageBubble({ message, showAuthor, isMine, resolveMention, highlighted }: Props) {
  const displayContent = formatMentionsPlain(message.content, resolveMention, t('mention.unknown'));

  return (
    <View style={[styles.row, showAuthor && styles.rowSpaced, highlighted && styles.rowHighlighted]}>
      {showAuthor && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{message.author.username.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={[styles.body, !showAuthor && styles.bodyIndent]}>
        {showAuthor && (
          <View style={styles.headerLine}>
            <Text style={[styles.author, isMine && styles.authorMine]}>{message.author.username}</Text>
            <Text style={styles.time}>{formatClock(message.createdAt)}</Text>
          </View>
        )}
        {displayContent.length > 0 && (
          <Text style={styles.content}>
            {displayContent}
            {message.editedAt ? <Text style={styles.edited}> {t('message.edited')}</Text> : null}
          </Text>
        )}
        {message.attachments?.map((a) => (
          <AttachmentView key={a.id} attachment={a} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 1,
  },
  rowSpaced: {
    marginTop: 10,
  },
  rowHighlighted: {
    backgroundColor: theme.colors.accentSubtle,
    borderRadius: theme.radius.md,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
  bodyIndent: {
    marginLeft: 44,
  },
  headerLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  author: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  authorMine: {
    color: theme.colors.accent400,
  },
  time: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
  content: {
    color: theme.colors.textBody,
    fontSize: theme.fontSize.base,
    lineHeight: 20,
  },
  edited: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
});
