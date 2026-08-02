import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MessageDto } from '@/api/messages';
import { formatMentionsPlain } from '@/utils/mentions';
import { formatMessageTime } from '@/utils/messageTime';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M2c — yazar + saat + içerik önizlemesi olan tek satır. `pins.tsx`in satır düzeninden
 * çıkarıldı (`SearchResultGroup.tsx`'te de aynı düzen var, kanal detay Bağlantılar sekmesi üçüncü
 * kullanım oldu — Rule of Three); `PinnedMessagesList` ve kanal detay Bağlantılar sekmesi bunu
 * paylaşıyor. `SearchResultGroup` kanal-gruplu başlık da taşıdığı için buraya alınmadı, kapsam
 * dışı bir dosyaya dokunulmadı.
 */
interface Props {
  message: MessageDto;
  onPress: () => void;
  /** Sabitlemeler ekranı 4 satır kırpıyordu (mevcut davranış korunuyor); varsayılan 3. */
  numberOfLines?: number;
}

export function MessagePreviewRow({ message, onPress, numberOfLines = 3 }: Props) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.head}>
        <Text style={styles.author} numberOfLines={1}>
          {message.author.username}
        </Text>
        <Text style={styles.time}>{formatMessageTime(message.createdAt)}</Text>
      </View>
      <Text style={styles.content} numberOfLines={numberOfLines}>
        {formatMentionsPlain(message.content, () => undefined, t('mention.unknown'))}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
    padding: 12,
    gap: 4,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  author: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  time: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  content: { color: theme.colors.textBody, fontSize: theme.fontSize.sm, lineHeight: 19 },
});
