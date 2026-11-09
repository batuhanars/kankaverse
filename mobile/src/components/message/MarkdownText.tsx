import { useMemo, type ReactNode } from 'react';
import { Linking, Platform, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { endsWithTextBlock, parseMarkdown, restoreMentions, type InlineRun, type MdBlock } from '@/utils/markdown';
import { splitMentions } from '@/utils/mentions';
import { t } from '@/i18n';
import { theme } from '@/theme';

// C56 §3 — mesaj/embed metnini markdown ağacından RN bileşenlerine çizer. Ağaç `utils/markdown.ts`te
// yalnız içeriğe bağlı üretilir; bahsetme çözümü burada (çözümleyici değişince yalnız çizim yenilenir).

interface Props {
  content: string;
  isMine: boolean;
  resolveMention: (userId: string) => string | undefined;
  resolveRole?: (roleId: string) => string | undefined;
  /** Link üzerinde uzun basma (mesaj menüsü). Verilmezse link yalnız dokunmayla açılır. */
  onLongPress?: () => void;
  /** Metin boyutu/rengi (balon: content stili, embed: açıklama stili). */
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  /** Son satıra eklenir (saat boşluğu, MetaSpacer). Yalnız son blok paragraf/başlıksa çizilir. */
  trailing?: ReactNode;
}

interface Ctx {
  isMine: boolean;
  resolveMention: Props['resolveMention'];
  resolveRole?: Props['resolveRole'];
  onLongPress?: () => void;
  textStyle?: StyleProp<TextStyle>;
}

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

function mentionText(text: string, ctx: Ctx, keyBase: string): ReactNode[] {
  return splitMentions(restoreMentions(text), ctx.resolveMention, t('mention.unknown'), ctx.resolveRole).map((seg, i) =>
    seg.isMention ? (
      <Text key={`${keyBase}-${i}`} style={ctx.isMine ? styles.mentionMine : styles.mention}>
        {seg.text}
      </Text>
    ) : (
      seg.text
    ),
  );
}

function renderRuns(runs: InlineRun[], ctx: Ctx): ReactNode[] {
  return runs.map((run, i) => {
    const decoration = [run.href ? 'underline' : '', run.strike ? 'line-through' : ''].filter(Boolean).join(' ');
    const style: StyleProp<TextStyle> = [
      run.bold && styles.bold,
      run.italic && styles.italic,
      run.code && (ctx.isMine ? styles.codeInlineMine : styles.codeInline),
      run.href && (ctx.isMine ? styles.linkMine : styles.link),
      decoration ? { textDecorationLine: decoration as TextStyle['textDecorationLine'] } : null,
    ];
    const href = run.href;
    return (
      <Text
        key={i}
        style={style}
        onPress={href ? () => void Linking.openURL(href) : undefined}
        onLongPress={href ? ctx.onLongPress : undefined}
        accessibilityRole={href ? 'link' : undefined}
      >
        {mentionText(run.text, ctx, String(i))}
      </Text>
    );
  });
}

function renderBlock(block: MdBlock, ctx: Ctx, key: number, trailing?: ReactNode): ReactNode {
  const gap = key > 0 && block.type !== 'heading' ? styles.blockGap : null;
  switch (block.type) {
    case 'paragraph':
      return (
        <Text key={key} style={[ctx.textStyle, gap]}>
          {renderRuns(block.runs, ctx)}
          {trailing}
        </Text>
      );
    case 'heading':
      return (
        <Text key={key} style={[ctx.textStyle, styles.heading, styles[`h${block.level}`], gap]}>
          {renderRuns(block.runs, ctx)}
          {trailing}
        </Text>
      );
    case 'quote':
      return (
        <View key={key} style={[styles.quote, ctx.isMine ? styles.quoteBarMine : styles.quoteBar, gap]}>
          {renderBlocks(block.children, ctx)}
        </View>
      );
    case 'list':
      return (
        <View key={key} style={[styles.list, gap]}>
          {block.items.map((item, idx) => (
            <View key={idx} style={styles.item}>
              <Text style={[ctx.textStyle, styles.marker]}>{block.ordered ? `${block.start + idx}.` : '•'}</Text>
              <View style={styles.itemBody}>{renderBlocks(item, ctx)}</View>
            </View>
          ))}
        </View>
      );
    case 'code':
      return (
        <View key={key} style={[styles.codeBlock, gap]}>
          <Text style={[ctx.textStyle, styles.codeBlockText]}>{mentionText(block.text, ctx, `c${key}`)}</Text>
        </View>
      );
  }
}

function renderBlocks(blocks: MdBlock[], ctx: Ctx, trailing?: ReactNode): ReactNode[] {
  const last = blocks.length - 1;
  return blocks.map((b, i) => renderBlock(b, ctx, i, i === last ? trailing : undefined));
}

export function MarkdownText({
  content,
  isMine,
  resolveMention,
  resolveRole,
  onLongPress,
  textStyle,
  style,
  trailing,
}: Props) {
  // Ağaç yalnız içeriğe bağlı: 16.000 karakterlik mesaj kaydırmada yeniden ayrıştırılmaz.
  const blocks = useMemo(() => parseMarkdown(content), [content]);
  const tree = useMemo(
    () =>
      renderBlocks(
        blocks,
        { isMine, resolveMention, resolveRole, onLongPress, textStyle },
        endsWithTextBlock(blocks) ? trailing : undefined,
      ),
    [blocks, isMine, resolveMention, resolveRole, onLongPress, textStyle, trailing],
  );
  return <View style={style}>{tree}</View>;
}

const styles = StyleSheet.create({
  blockGap: { marginTop: 4 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  // PM revizesi: baloncuk dar, web ölçüleri (22/18/16) uygulanmaz. Gövde 15 (`base`); başlık en fazla
  // 1-2 kademe büyük: h1 18, h2 16, h3 15 (= gövde, yalnız kalın). Dikey boşluk 2.
  heading: { fontWeight: '700', marginTop: 2 },
  h1: { fontSize: theme.fontSize.xl, lineHeight: 22 },
  h2: { fontSize: theme.fontSize.lg, lineHeight: 21 },
  h3: { fontSize: theme.fontSize.base, lineHeight: 20 },
  // Mention/link: MessageBubble'daki eski stillerin aynısı (M2d R1).
  mention: { color: theme.colors.accent500, backgroundColor: theme.colors.accentSubtle, fontWeight: '500' },
  mentionMine: { color: theme.colors.textPrimary, fontWeight: '500' },
  link: { color: theme.colors.accent500 },
  linkMine: { color: theme.colors.textPrimary },
  codeInline: { fontFamily: MONO, backgroundColor: theme.colors.bgSidebar },
  codeInlineMine: { fontFamily: MONO, backgroundColor: 'rgba(0, 0, 0, 0.25)' },
  // Kaydırma yok: satırlar sarılır, baloncuk genişliğini aşmaz (`alignSelf: 'stretch'` + flexShrink).
  codeBlock: {
    alignSelf: 'stretch',
    flexShrink: 1,
    backgroundColor: theme.colors.bgSidebar,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  codeBlockText: { fontFamily: MONO, fontSize: theme.fontSize.sm, lineHeight: 18 },
  quote: { borderLeftWidth: 2, paddingLeft: 6 },
  quoteBar: { borderLeftColor: theme.colors.accent500 },
  quoteBarMine: { borderLeftColor: theme.colors.textSecondary },
  list: { alignSelf: 'stretch' },
  item: { flexDirection: 'row', alignItems: 'flex-start' },
  marker: { minWidth: 14, paddingRight: 4, textAlign: 'left' },
  itemBody: { flex: 1 },
});
