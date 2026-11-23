import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { mergeResults, normalizeQuery, type LocalSearchHit } from '@kankaverse/e2ee-client';
import { messagesApi, type MessageDto } from '@/api/messages';
import { extractErrorMessage } from '@/api/errors';
import { useDmStore } from '@/stores/dm';
import { useE2eeStore } from '@/stores/e2ee';
import { formatMentionsPlain } from '@/utils/mentions';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  channelId: string;
  onClose: () => void;
  onJump: (messageId: string) => void;
}

/** Sonuç satırı: sunucu mesajı ya da yerel (şifreli) eşleşme; ikisi de aynı alanlarla çizilir. */
type SearchRow = Pick<MessageDto, 'id' | 'createdAt' | 'author' | 'content'>;

const localRow = (h: LocalSearchHit): SearchRow => ({
  id: h.id,
  createdAt: h.createdAt,
  author: h.author,
  content: h.body,
});

/**
 * E7 §5: şifreli grup DM'de sunucu şifreli mesajı aramaz; bu cihazda çözülmüş kayıtlar yerelde aranır.
 * Yerel arama düşerse (ağ, kilit) yalnız sunucu sonucu gösterilir: arama tamamen bozulmasın.
 */
async function searchLocal(channelId: string, q: string, plain: (body: string) => string): Promise<LocalSearchHit[]> {
  const { engine, channels } = useE2eeStore.getState();
  if (!engine || channels[channelId]?.encrypted !== true) return [];
  try {
    return await engine.searchLocal(channelId, q, plain);
  } catch (e) {
    console.error('[E2EE] yerel arama', e instanceof Error ? e.name : typeof e);
    return [];
  }
}

/** Eşleşme bundan sonra başlıyorsa satır eşleşmeden biraz önce "…" ile başlar (2 satırda görünsün). */
const SNIPPET_AFTER = 60;
const SNIPPET_LEAD = 24;

/**
 * Sonuç metni, eşleşmeler vurgulu (web `SearchPopover.highlight` karşılığı). Eşleme aramayla aynı Türkçe kural
 * (İ↔i, I↔ı): küçük harfli metinde bulunur, vurgu özgün metne aynı konumdan uygulanır. Küçültme uzunluğu
 * değiştirirse (Türkçe dışı nadir harf) vurgusuz düz metin.
 */
function Highlighted({ text, term }: { text: string; term: string }) {
  const lower = normalizeQuery(text);
  const needle = normalizeQuery(term.trim());
  const first = needle ? lower.indexOf(needle) : -1;
  if (first === -1 || lower.length !== text.length) return <>{text}</>;
  const start = first > SNIPPET_AFTER ? first - SNIPPET_LEAD : 0;
  const parts: { s: string; hit: boolean }[] = start > 0 ? [{ s: '…', hit: false }] : [];
  let from = start;
  for (let i = first; i !== -1; i = lower.indexOf(needle, i + needle.length)) {
    if (i > from) parts.push({ s: text.slice(from, i), hit: false });
    parts.push({ s: text.slice(i, i + needle.length), hit: true });
    from = i + needle.length;
  }
  parts.push({ s: text.slice(from), hit: false });
  return (
    <>
      {parts.map((p, k) =>
        p.hit ? (
          <Text key={k} style={styles.hit}>
            {p.s}
          </Text>
        ) : (
          p.s
        ),
      )}
    </>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  // Kök CLAUDE.md TR tarih/saat formatı.
  return (
    d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
  );
}

// Sözleşme §3.5 — sohbet içinde mesaj arama. Web `SearchPopover.vue`'nun mobil karşılığı (yerleşim
// popover değil, modal — mobilde ekran dar). `GET /channels/:id/messages/search` backend'de min
// 2 karakter zorunlu kılıyor (`QUERY_TOO_SHORT`); istemci aynı eşiği önden uygular (gereksiz istek
// atmaz + `messageSearch.minChars` ipucu web ile aynı).
export function MessageSearchModal({ channelId, onClose, onJump }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchRow[]>([]);
  // Grup DM'de bahsetme adı üyelerden çözülür (yerel eşleme de bu düz metinde arar, E7 §5.2).
  const members = useDmStore((s) => {
    const c = s.channels.find((x) => x.id === channelId);
    return c?.type === 'GROUP_DM' ? c.members : undefined;
  });
  const plain = (content: string) =>
    formatMentionsPlain(content, (id) => members?.find((m) => m.id === id)?.username, t('mention.unknown'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError('');
      return;
    }
    // Yazarken yeni sorgu başlarsa eski cevap ekrana yazılmaz (yerel tarama sunucudan yavaş dönebilir).
    let stale = false;
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      setError('');
      Promise.all([messagesApi.search(channelId, { q: trimmed }), searchLocal(channelId, trimmed, plain)])
        .then(([list, local]) => {
          if (!stale) setResults(mergeResults<SearchRow>(list, local, localRow));
        })
        .catch((e) => {
          if (!stale) setError(extractErrorMessage(e));
        })
        .finally(() => {
          if (!stale) setLoading(false);
        });
    }, 300);
    return () => {
      stale = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // `plain` üyelerden türer; üye listesi değişince arama yeniden koşmasın (sonuç satırı zaten çizimde çözer).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, channelId]);

  const trimmedLen = query.trim().length;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t('messageSearch.panelTitle')}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('messageSearch.inputPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            autoFocus
          />

          <View style={styles.resultsArea}>
            {trimmedLen > 0 && trimmedLen < 2 && <Text style={styles.hint}>{t('messageSearch.minChars')}</Text>}

            {loading && (
              <View style={styles.center}>
                <ActivityIndicator color={theme.colors.accent500} />
              </View>
            )}

            {!loading && error ? <Text style={styles.error}>{error}</Text> : null}

            {!loading && !error && trimmedLen >= 2 && results.length === 0 && (
              <Text style={styles.hint}>{t('messageSearch.empty')}</Text>
            )}

            {!loading && results.length > 0 && (
              <FlatList
                data={results}
                keyExtractor={(m) => m.id}
                renderItem={({ item }) => (
                  <Pressable onPress={() => onJump(item.id)} style={styles.resultRow}>
                    {item.author.avatarUrl ? (
                      <Image source={{ uri: item.author.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarFallbackText}>{item.author.username.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={styles.resultBody}>
                      <View style={styles.resultHeaderLine}>
                        <Text style={styles.resultAuthor} numberOfLines={1}>
                          {item.author.username}
                        </Text>
                        <Text style={styles.resultTime}>{formatTime(item.createdAt)}</Text>
                      </View>
                      <Text style={styles.resultContent} numberOfLines={2}>
                        <Highlighted text={plain(item.content)} term={query} />
                      </Text>
                    </View>
                  </Pressable>
                )}
              />
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.bgOverlay,
    justifyContent: 'flex-start',
    paddingTop: 60,
    paddingHorizontal: theme.layout.panelGap,
  },
  panel: {
    maxHeight: '80%',
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  closeIcon: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.lg,
  },
  input: {
    margin: theme.layout.panelGap,
    marginBottom: 8,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgContent,
    color: theme.colors.textPrimary,
    paddingHorizontal: 14,
    fontSize: theme.fontSize.base,
  },
  resultsArea: {
    paddingBottom: 8,
  },
  center: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: theme.layout.panelGap,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: theme.layout.panelGap,
  },
  resultRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  resultBody: {
    flex: 1,
    minWidth: 0,
  },
  resultHeaderLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 2,
  },
  resultAuthor: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    flexShrink: 1,
  },
  resultTime: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
  hit: { color: theme.colors.textPrimary, backgroundColor: theme.colors.accentSubtle, fontWeight: '700' },
  resultContent: {
    color: theme.colors.textBody,
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
  },
});
