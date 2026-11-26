import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { emojisByCategory } from "rn-emoji-keyboard";
import { t } from "@/i18n";
import { theme } from "@/theme";

const COLUMNS = 8;

/** Tüm emojiler tek listede (kategori tekrarları ayıklanır); bir kez kurulur. */
const ALL = (() => {
  const seen = new Set<string>();
  const out: { emoji: string; terms: string }[] = [];
  for (const c of emojisByCategory) {
    for (const e of c.data) {
      if (seen.has(e.emoji)) continue;
      seen.add(e.emoji);
      out.push({
        emoji: e.emoji,
        terms: [e.name.replace(/_/g, " "), ...(e.keywords ?? [])]
          .join(" ")
          .toLowerCase(),
      });
    }
  }
  return out;
})();

interface Props {
  onPick: (emoji: string) => void;
  onClose: () => void;
}

/**
 * C81 Rev.2 — WhatsApp gibi ikonla açılan emoji araması. Kütüphanenin kendi arama kutusu kullanılmadı: odak
 * verilemiyor (ikona basınca klavye açılmazdı) ve bileşen ilk çizimden sonra prop değişikliklerini yok sayıyor
 * (`memo(() => true)`), arama açılıp kapatılamazdı. Eşleşme kütüphaneyle aynı kaynaktan (ad + anahtar kelimeler).
 */
export function EmojiSearchPanel({ onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Rev.2: kutu boşken tüm emojiler; yazdıkça süzülür.
    if (!q) return ALL;
    // Emojinin kendisiyle arama da çalışsın ("❤" yazınca kalpler).
    return ALL.filter((e) => e.terms.includes(q) || e.emoji.includes(q)).slice(
      0,
      200,
    );
  }, [query]);

  return (
    <View style={styles.flex}>
      <View style={styles.bar}>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("mobile.attach.back")}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color={theme.colors.textSecondary}
          />
        </Pressable>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("mobile.emojiGif.search")}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          autoFocus
          autoCorrect={false}
        />
        {query ? (
          <Pressable
            onPress={() => setQuery("")}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("common.clear")}
          >
            <Ionicons name="close" size={20} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {query.trim() && results.length === 0 ? (
        <Text style={styles.empty}>{t("mobile.emojiGif.noResults")}</Text>
      ) : (
        <FlatList
          data={results}
          numColumns={COLUMNS}
          keyExtractor={(e) => e.emoji}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={64}
          windowSize={7}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item.emoji)}
              style={styles.cell}
              accessibilityRole="button"
              accessibilityLabel={item.emoji}
            >
              <Text style={styles.emoji}>{item.emoji}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: theme.layout.panelGap,
    marginBottom: 8,
    paddingHorizontal: 14,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
  },
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    paddingVertical: 8,
  },
  grid: { paddingHorizontal: 8 },
  cell: {
    flex: 1 / COLUMNS,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 28 },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    marginTop: 24,
  },
});
