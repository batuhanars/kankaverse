import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatMentionsPlain } from '@/utils/mentions';
import type { MessageDto } from '@/api/messages';
import { t } from '@/i18n';
import { theme } from '@/theme';
import { attachmentIcon, replyBody, useAttachmentThumb } from './replyPreview';

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
  /** Dokununca alıntılanan mesaja gidilir (WhatsApp gibi). Silinmiş alıntıda verilse de çalışmaz. */
  onPress?: () => void;
  /** Baloncuğun uzun basışı (mesaj paneli); alıntının üstünde de aynı panel açılsın. */
  onLongPress?: () => void;
}

/** Mobilde alıntı metni 3 satıra kadar (web 2); yazar adı üstte ayrı satırda. */
const REPLY_QUOTE_LINES = 3;

/** Yanıt alıntısı — baloncuk İÇİNDE, solda dikey çizgili blok. `replyTo` yoksa (alıntılanan mesaj
 *  silinmiş) sunucu yalnız `replyToId` döner; o durumda "Silinen mesaj" yazılır, satır gizlenmez.
 *  Alıntılanan mesajda ek varsa sağda küçük önizleme (görsel/video), metinde türe göre simge + etiket. */
export function ReplyQuote({ message, isMine, resolveMention, resolveRole, onPress, onLongPress }: ReplyQuoteProps) {
  const reply = message.replyTo;
  const attachment = reply?.attachment ?? null;
  const thumb = useAttachmentThumb(attachment);
  const textStyle = [quoteStyles.text, isMine && quoteStyles.textMine];
  return (
    <Pressable
      onPress={reply ? onPress : undefined}
      onLongPress={onLongPress}
      delayLongPress={350}
      disabled={!reply || !onPress}
      accessibilityRole={reply && onPress ? 'button' : undefined}
      accessibilityHint={reply && onPress ? t('reply.jump') : undefined}
      style={({ pressed }) => [
        quoteStyles.block,
        { borderLeftColor: isMine ? theme.colors.textPrimary : theme.colors.accent500 },
        pressed && quoteStyles.pressed,
      ]}
    >
      <View style={quoteStyles.textCol}>
        {reply ? (
          <>
            <Text style={[quoteStyles.author, isMine && quoteStyles.authorMine]} numberOfLines={1}>
              {reply.authorUsername}
            </Text>
            <Text style={textStyle} numberOfLines={REPLY_QUOTE_LINES}>
              {attachment ? (
                <>
                  <Ionicons
                    name={attachmentIcon(attachment)}
                    size={12}
                    color={isMine ? theme.colors.textBody : theme.colors.textSecondary}
                  />{' '}
                </>
              ) : null}
              {reply.e2eeUnknown
                ? t('e2ee.encryptedQuote') // E1: alıntılanan şifreli mesajın düz metni bu cihazda yok
                : replyBody(formatMentionsPlain(reply.content, resolveMention, t('mention.unknown'), resolveRole), attachment)}
            </Text>
          </>
        ) : (
          <Text style={[...textStyle, quoteStyles.deleted]} numberOfLines={1}>
            {t('reply.deleted')}
          </Text>
        )}
      </View>
      {thumb ? <Image source={{ uri: thumb }} style={quoteStyles.thumb} resizeMode="cover" /> : null}
    </Pressable>
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
  const color = isMine ? theme.colors.textBody : theme.colors.textMuted;
  return (
    <View style={[metaStyles.row, inline && metaStyles.rowInline]}>
      {message.editedAt ? <Text style={[metaStyles.text, { color }]}>{t('message.edited')}</Text> : null}
      <Text style={[metaStyles.text, { color }]}>{formatClock(message.createdAt)}</Text>
      {receipt ? (
        <Ionicons
          name={receipt === 'seen' ? 'checkmark-done' : 'checkmark'}
          size={14}
          color={color}
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
  /** C46 — pile uzun basış "kimler tepki verdi" panelini açar. */
  onLongPressReaction?: () => void;
}

/** Tepki pill'leri — baloncuğun DIŞINDA, hizasında. Mesaj listesi emoji bazında TOPLU gelir (yalnız
 *  emoji + sayı); kimlerin verdiği uzun basışla ayrı panelde (C46). Kendi tepkim Kor kenarlıkla ayrışır. */
export function ReactionRow({ reactions, isMine, onToggleReaction, onLongPressReaction }: ReactionRowProps) {
  return (
    <View style={[reactionStyles.row, { justifyContent: isMine ? 'flex-end' : 'flex-start' }]}>
      {reactions.map((r) => (
        <Pressable
          key={r.emoji}
          onPress={() => onToggleReaction?.(r.emoji)}
          onLongPress={onLongPressReaction}
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
    flexDirection: 'row',
    borderLeftWidth: 3,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.borderSubtle,
    overflow: 'hidden',
    marginBottom: 4,
  },
  pressed: {
    opacity: 0.7,
  },
  textCol: {
    flexShrink: 1,
    flexGrow: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  text: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
  },
  // bubbleOwn üstünde textSecondary okunmuyor (bkz. tokens.ts bubbleOwn).
  textMine: {
    color: theme.colors.textBody,
  },
  // Yazar adı WhatsApp gibi vurgu renginde; kendi baloncuğumda Kor üstünde Kor okunmaz → authorMine.
  author: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    marginBottom: 1,
  },
  authorMine: {
    color: theme.colors.textPrimary,
  },
  thumb: {
    width: 48,
    minHeight: 48,
    alignSelf: 'stretch',
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
