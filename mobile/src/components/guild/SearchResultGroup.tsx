import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GuildSearchGroupDto } from '@/api/messages';
import { formatMentionsPlain } from '@/utils/mentions';
import { t } from '@/i18n';
import { theme } from '@/theme';

/** Kök CLAUDE.md TR tarih/saat formatı: "25 Ekim 2023 18.42". */
function formatTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
  );
}

/**
 * Tek kanalın sonuç bloğu. Ayrı bileşen çünkü ekran 300 satırı aştı ve bu blok kendi başına
 * anlamlı bir birim (başlık + o kanalın mesajları).
 */
export function SearchResultGroup({
  group,
  onOpen,
}: {
  group: GuildSearchGroupDto;
  onOpen: (messageId: string) => void;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>#{group.channelName}</Text>
      {group.messages.map((m) => (
        <Pressable
          key={m.id}
          // Sonuç ilgili kanalı açar VE mesaja kaydırıp geçici olarak vurgular (R1). Mesaj yüklü
          // sayfada değilse kanal ekranı sayfa sayfa eskiye gider; bulunamazsa (çok eski/silinmiş)
          // kullanıcı yine kanalda kalır, hata ekranı görmez.
          onPress={() => onOpen(m.id)}
          style={styles.result}
        >
          <View style={styles.resultHead}>
            <Text style={styles.author} numberOfLines={1}>
              {m.author.username}
            </Text>
            <Text style={styles.time}>{formatTime(m.createdAt)}</Text>
          </View>
          <Text style={styles.content} numberOfLines={3}>
            {/* Bahsedilenler çözümlenmiyor (üye haritası burada yok) — ham `<@id>` yerine
                okunur bir yedek gösterilir; kanal içi aramanın aynı deseni. */}
            {formatMentionsPlain(m.content, () => undefined, t('mention.unknown'))}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}


const styles = StyleSheet.create({
  group: { gap: 6 },
  groupTitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  result: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
    padding: 10,
    gap: 4,
  },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  author: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  time: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  content: { color: theme.colors.textBody, fontSize: theme.fontSize.sm, lineHeight: 19 },
});
