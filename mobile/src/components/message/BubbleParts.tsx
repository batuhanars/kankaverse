import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatMentionsPlain } from '@/utils/mentions';
import type { MessageDto } from '@/api/messages';
import { t } from '@/i18n';
import { theme } from '@/theme';

// M6a — `MessageBubble`'ın alt parçaları (dosya 300 satırı aşmasın diye ayrıldı; her biri tek yerde
// kullanılıyor, genel amaçlı değil).

function formatClock(iso: string): string {
  const d = new Date(iso);
  // Kök CLAUDE.md — TR saat formatı "18.42" (nokta ayraçlı, iki hane).
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}.${mm}`;
}

interface ReplyQuoteProps {
  message: MessageDto;
  isMine: boolean;
  resolveMention: (userId: string) => string | undefined;
  resolveRole?: (roleId: string) => string | undefined;
}

/** Yanıt alıntısı — baloncuk İÇİNDE, solda dikey çizgili blok. `replyTo` yoksa (alıntılanan mesaj
 *  silinmiş) sunucu yalnız `replyToId` döner; o durumda "Silinen mesaj" yazılır, satır gizlenmez. */
export function ReplyQuote({ message, isMine, resolveMention, resolveRole }: ReplyQuoteProps) {
  return (
    <View style={[quoteStyles.block, { borderLeftColor: isMine ? theme.colors.accent400 : theme.colors.accent500 }]}>
      {message.replyTo ? (
        <Text style={quoteStyles.text} numberOfLines={1}>
          <Text style={quoteStyles.author}>{message.replyTo.authorUsername}</Text>
          {'  '}
          {formatMentionsPlain(message.replyTo.content, resolveMention, t('mention.unknown'), resolveRole)}
        </Text>
      ) : (
        <Text style={[quoteStyles.text, quoteStyles.deleted]} numberOfLines={1}>
          {t('reply.deleted')}
        </Text>
      )}
    </View>
  );
}

interface MetaProps {
  message: MessageDto;
  isMine: boolean;
  receipt?: 'sent' | 'seen' | null;
  /** Metnin son satırına oturur (bkz. `MetaSpacer`); yalnız metinle biten mesajda. */
  inline?: boolean;
}

/** Sağa yaslı meta satırı: `düzenlendi` + saat + okundu ikonu (C12 §4.2: ikon ya anlamlıdır ya hiç). */
export function BubbleMeta({ message, isMine, receipt, inline }: MetaProps) {
  const color = isMine ? theme.colors.textSecondary : theme.colors.textMuted;
  const seenColor = isMine ? theme.colors.accent400 : theme.colors.accent500;
  return (
    <View style={[metaStyles.row, inline && metaStyles.rowInline]}>
      {message.editedAt ? <Text style={[metaStyles.text, { color }]}>{t('message.edited')}</Text> : null}
      <Text style={[metaStyles.text, { color }]}>{formatClock(message.createdAt)}</Text>
      {receipt ? (
        <Ionicons
          name={receipt === 'seen' ? 'checkmark-done' : 'checkmark'}
          size={14}
          color={receipt === 'seen' ? seenColor : theme.colors.textMuted}
          accessibilityLabel={t(`message.receipt.${receipt}`)}
        />
      ) : null}
    </View>
  );
}

interface ReactionRowProps {
  reactions: NonNullable<MessageDto['reactions']>;
  isMine: boolean;
  onToggleReaction?: (emoji: string) => void;
}

/** Tepki pill'leri — baloncuğun DIŞINDA, hizasında. Sunucu emoji bazında TOPLAYARAK dönüyor (kim
 *  verdi listesi yok), o yüzden yalnız emoji + sayı. Kendi tepkim Kor kenarlıkla ayrışır. */
export function ReactionRow({ reactions, isMine, onToggleReaction }: ReactionRowProps) {
  return (
    <View style={[reactionStyles.row, { justifyContent: isMine ? 'flex-end' : 'flex-start' }]}>
      {reactions.map((r) => (
        <Pressable
          key={r.emoji}
          onPress={() => onToggleReaction?.(r.emoji)}
          style={[reactionStyles.pill, r.reactedByMe && reactionStyles.pillMine]}
        >
          <Text style={reactionStyles.emoji}>{r.emoji}</Text>
          <Text style={[reactionStyles.count, r.reactedByMe && reactionStyles.countMine]}>{r.count}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const quoteStyles = StyleSheet.create({
  block: {
    borderLeftWidth: 3,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.borderSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
  },
  text: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
  },
  author: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
  deleted: {
    fontStyle: 'italic',
  },
});

// Saydam yer tutucu (WhatsApp hilesi): metnin SON satırına meta kadar boşluk ekler. Kısa mesajda
// saat metnin yanına oturur; son satırda yer kalmazsa yer tutucu alt satıra kayar ve meta da onunla
// iner. Aynı yazı boyutunda aynı metin, yani genişlik ölçmeden tutar. Okundu ikonu (14px + boşluk)
// için birkaç bölünmez boşluk eklenir.
// 🔴 Renk `transparent` DEĞİL baloncuk zemini: Android iç içe Text'te saydamı tam saydam çizmiyor,
// gerçek saatin altında gölge gibi ikinci bir saat görünüyordu (sahip cihaz turu 2026-10-02).
export function MetaSpacer({ message, receipt, isMine }: Omit<MetaProps, 'inline'>) {
  const edited = message.editedAt ? `${t('message.edited')} ` : '';
  const tick = receipt ? ' '.repeat(5) : '';
  return (
    <Text style={[metaStyles.spacer, { color: isMine ? theme.colors.bubbleOwn : theme.colors.bgElevated }]}>
      {`  ${edited}${formatClock(message.createdAt)}${tick}`}
    </Text>
  );
}

const metaStyles = StyleSheet.create({
  // Metinle aynı satıra oturan meta: baloncuğun sağ alt köşesine sabitlenir (iç dolguyla hizalı).
  rowInline: {
    position: 'absolute',
    right: 8.5,
    bottom: 4.5,
    marginTop: 0,
  },
  spacer: {
    fontSize: theme.fontSize.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  text: {
    fontSize: theme.fontSize.xs,
  },
});

const reactionStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  pill: {
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
  pillMine: {
    borderColor: theme.colors.accent500,
    backgroundColor: theme.colors.accentSubtle,
  },
  emoji: {
    fontSize: theme.fontSize.sm,
  },
  count: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  countMine: {
    color: theme.colors.accent500,
  },
});
