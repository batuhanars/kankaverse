import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { MarkdownText } from './MarkdownText';
import type { MessageEmbed } from '@/api/messages';
import { theme } from '@/theme';

// C35 §5.4 - gelen webhook embed karti (yalniz cizim; yonetim web'de). Gorsel alani yoktur (sunucu atar,
// §0.4). Aciklama web gibi markdown (MarkdownText, html kapali); diger alanlar duz <Text>. Baglanti yalniz http(s):// ise acilir.

interface Props {
  embeds: MessageEmbed[];
  resolveMention: (userId: string) => string | undefined;
  resolveRole?: (roleId: string) => string | undefined;
}

function accentColor(color: number | undefined): string {
  if (typeof color !== 'number' || color < 0 || color > 0xffffff) return theme.colors.borderStrong;
  return `#${color.toString(16).padStart(6, '0')}`;
}

function openHttps(url: string | undefined) {
  if (url && /^https?:\/\//i.test(url)) void Linking.openURL(url);
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${date} ${hh}.${mm}`;
}

export function EmbedCards({ embeds, resolveMention, resolveRole }: Props) {
  return (
    <>
      {embeds.map((e, i) => {
        const stamp = e.timestamp ? formatStamp(e.timestamp) : '';
        const hasLink = !!e.url && /^https?:\/\//i.test(e.url);
        return (
          <View key={i} style={[styles.card, { borderLeftColor: accentColor(e.color) }]}>
            {e.author ? <Text style={styles.author}>{e.author.name}</Text> : null}
            {e.title ? (
              <Pressable disabled={!hasLink} onPress={() => openHttps(e.url)} accessibilityRole={hasLink ? 'link' : 'text'}>
                <Text style={[styles.title, hasLink && styles.titleLink]}>{e.title}</Text>
              </Pressable>
            ) : null}
            {e.description ? (
              <MarkdownText
                content={e.description}
                isMine={false}
                resolveMention={resolveMention}
                resolveRole={resolveRole}
                textStyle={styles.description}
              />
            ) : null}
            {e.fields?.length ? (
              <View style={styles.fields}>
                {e.fields.map((f, j) => (
                  <View key={j} style={f.inline ? styles.fieldInline : styles.fieldFull}>
                    <Text style={styles.fieldName}>{f.name}</Text>
                    <Text style={styles.fieldValue}>{f.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {e.footer || stamp ? (
              <Text style={styles.footer}>
                {[e.footer?.text, stamp].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  // Baloncugun icerik genisligine uyar (alignSelf stretch); uzun kelime kendiliginden satir kirar.
  card: {
    alignSelf: 'stretch',
    marginTop: 4,
    borderLeftWidth: 4,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bgSidebar,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  author: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, fontWeight: '600' },
  title: { color: theme.colors.textPrimary, fontSize: theme.fontSize.sm, fontWeight: '700' },
  titleLink: { color: theme.colors.accent500 },
  description: { color: theme.colors.textPrimary, fontSize: theme.fontSize.sm, lineHeight: 18 },
  // Dar ekranda satir sarar: inline alan en az 100 genislikte, sigmazsa alta iner.
  fields: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 6 },
  fieldFull: { width: '100%' },
  fieldInline: { flexGrow: 1, flexBasis: 100, minWidth: 100 },
  fieldName: { color: theme.colors.textPrimary, fontSize: theme.fontSize.xs, fontWeight: '700' },
  fieldValue: { color: theme.colors.textBody, fontSize: theme.fontSize.sm },
  footer: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
});
