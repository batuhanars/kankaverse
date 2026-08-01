import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  /** M1d-C §2.4 — uzun basış mesaj panelini açar (web'deki hover şeridinin dokunmatik karşılığı). */
  onLongPress?: () => void;
  /** Tepki pill'ine dokunuş: kendi tepkimi kaldırır, başkasınınkine katılır (web ile aynı). */
  onToggleReaction?: (emoji: string) => void;
}

// Sprint M1a — web/src/components/shared/MessageItem.vue'nin bu sprintteki alt kümesi: okuma +
// mention gösterimi (contract §4.4) + ek gösterimi (§5.5). Düzenleme/silme/reaksiyon/pin UI'ı YOK
// (kapsam dışı) — ama `message.updated`/`message.deleted` WS'ten gelirse içerik/liste güncellenir
// (stores/messages.ts), bu bileşen yalnız güncel veriyi render eder.
export function MessageBubble({
  message,
  showAuthor,
  isMine,
  resolveMention,
  highlighted,
  onLongPress,
  onToggleReaction,
}: Props) {
  const displayContent = formatMentionsPlain(message.content, resolveMention, t('mention.unknown'));
  const reactions = message.reactions ?? [];

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={350}
      style={[styles.row, showAuthor && styles.rowSpaced, highlighted && styles.rowHighlighted]}
    >
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
        {/* Yanıt alıntısı — gövdenin ÜSTÜNDE, web `MessageRow.vue` ile aynı yer. `replyTo` dolu
            gelmiyorsa (alıntılanan mesaj silinmiş) sunucu yalnız `replyToId` döner; o durumda
            "Silinen mesaj" yazılır, satır gizlenmez — yoksa yanıt bağlamsız kalırdı. */}
        {message.replyToId && (
          <View style={styles.replyRow}>
            <Ionicons name="arrow-undo" size={12} color={theme.colors.textMuted} />
            {message.replyTo ? (
              <Text style={styles.replyText} numberOfLines={1}>
                <Text style={styles.replyAuthor}>{message.replyTo.authorUsername}</Text>
                {'  '}
                {formatMentionsPlain(message.replyTo.content, resolveMention, t('mention.unknown'))}
              </Text>
            ) : (
              <Text style={[styles.replyText, styles.replyDeleted]} numberOfLines={1}>
                {t('reply.deleted')}
              </Text>
            )}
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

        {/* Tepki pill'leri — sunucu emoji bazında TOPLAYARAK dönüyor (kim verdi listesi yok), o
            yüzden burada da yalnız emoji + sayı gösterilir. Kendi tepkim Kor kenarlıkla ayrışır. */}
        {reactions.length > 0 && (
          <View style={styles.reactionRow}>
            {reactions.map((r) => (
              <Pressable
                key={r.emoji}
                onPress={() => onToggleReaction?.(r.emoji)}
                style={[styles.reactionPill, r.reactedByMe && styles.reactionPillMine]}
              >
                <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                <Text style={[styles.reactionCount, r.reactedByMe && styles.reactionCountMine]}>
                  {r.count}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  replyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  replyText: {
    flex: 1,
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
  replyAuthor: {
    color: theme.colors.textSecondary,
    fontWeight: '700',
  },
  replyDeleted: {
    fontStyle: 'italic',
  },
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.bgElevated,
  },
  reactionPillMine: {
    borderColor: theme.colors.accent500,
    backgroundColor: theme.colors.accentSubtle,
  },
  reactionEmoji: {
    fontSize: theme.fontSize.sm,
  },
  reactionCount: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  reactionCountMine: {
    color: theme.colors.accent500,
  },
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
