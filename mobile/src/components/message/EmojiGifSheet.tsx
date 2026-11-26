import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  EmojiKeyboard,
  emojisByCategory,
  tr as emojiTr,
  type EmojisByCategory,
} from "rn-emoji-keyboard";
import { emojiPickerTheme } from "./emojiPickerTheme";
import { EmojiSearchPanel } from "./EmojiSearchPanel";
import { buildDraftAttachment } from "./attachmentDraft";
import { sheetBottomPadding, useSheetInsets } from "../home/sheetInsets";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  type DraftAttachment,
} from "@/utils/attachmentUpload";
import { loadRecentEmojis, recordEmojiUse } from "@/utils/recentEmojis";
import {
  replaceSlot,
  saveQuickReactions,
  useQuickReactions,
} from "@/utils/quickReactions";
import { extractErrorMessage } from "@/api/errors";
import { t } from "@/i18n";
import { theme } from "@/theme";

type Tab = "emoji" | "gif";

interface Props {
  visible: boolean;
  onClose: () => void;
  onEmojiSelected: (emoji: string) => void;
  /** Düzenleme modunda GIF sekmesi gösterilmez (ataç gibi: var olan mesaja ek bağlanamaz). */
  showGif: boolean;
  existingCount?: number;
  /** Seçilen GIF taslak şeride düşer (AttachmentSheet ile aynı akış, gönderilmez). */
  onGifDraft?: (draft: DraftAttachment) => void;
  /** Sık kullanılanlar bölümü + kayıt. Hızlı tepki yuvası seçicisi kapatır (yuva seçimi kullanım sayılmaz). */
  useRecent?: boolean;
  /**
   * C81: tepki seçerken listenin üstünde "Varsayılan tepkiler" (hızlı tepki şeridi) bölümü. "Düzenle" ile yuvalar
   * burada değiştirilir; ayarlar ekranına gitmek gerekmez (sahip isteği).
   */
  defaultReactions?: boolean;
}

const SHEET_RATIO = 0.6;
/** Arama açıkken klavye sayfanın altını kaplar; sonuçlar üstte kalsın diye sayfa neredeyse tam ekran. */
const SEARCH_RATIO = 0.92;

/**
 * Sık kullanılanlar kütüphanenin İLK kategorisi olarak verilir (sahip 2026-11-09): ikon çubuğunun
 * altında, kütüphanenin kendi ızgarasında görünür. Kütüphanenin yerleşik "recent" deposu yalnız sırayı
 * bilir ve global tek depodur; bizim sıklık × yakınlık listemizi `emojisByCategory` ile veriyoruz.
 * `name` bilerek emojinin kendisi: arama adı/anahtar kelimeyi tarar, kopya bu yüzden aramada çıkmaz
 * ve ızgara anahtarı (name) gerçek emojiyle çakışmaz.
 */
function withRecent(recent: string[]): EmojisByCategory[] {
  if (recent.length === 0) return emojisByCategory;
  const known = new Map(
    emojisByCategory.flatMap((c) => c.data).map((e) => [e.emoji, e.v]),
  );
  const data = recent.map((emoji) => ({
    emoji,
    name: emoji,
    v: known.get(emoji) ?? "1.0",
    toneEnabled: false,
  }));
  return [
    { title: "recently_used", data } as EmojisByCategory,
    ...emojisByCategory,
  ];
}

/**
 * C23 §0.2 — mesaj kutusu emoji düğmesinin açtığı iki sekmeli alt sayfa (Emoji | GIF).
 *
 * Emoji sekmesi eski `EmojiPicker` modal'ının içeriğiyle aynı (aynı tema/dil/son kullanılanlar;
 * emoji seçilince sayfa kapanır). GIF sekmesi bugün yalnız "GIF yükle"; kütüphane/arama sonraki sprintte bu
 * sekmenin üstüne gelir, o yüzden bugün boş iskele konmadı.
 *
 * GIF `buildDraftAttachment` huni ağzından geçer (tür+boyut, AttachmentSheet ile aynı hata
 * anahtarları). Galeri seçicisi GIF'e süzemez; seçimden sonra GIF mi diye doğrulanır.
 */
export function EmojiGifSheet({
  visible,
  onClose,
  onEmojiSelected,
  showGif,
  existingCount = 0,
  onGifDraft,
  useRecent = true,
  defaultReactions = false,
}: Props) {
  const { height } = useWindowDimensions();
  const bottomInset = useSheetInsets();
  const [tab, setTab] = useState<Tab>("emoji");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const activeTab: Tab = showGif ? tab : "emoji";
  // C24 §0.4: sık kullanılanlar. Sayfa her açıldığında okunur; seçim sırasında liste yerinde durur
  // (parmağın altında yeniden dizilmesin), yeni sıra bir sonraki açılışta görünür.
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    if (visible && useRecent) void loadRecentEmojis().then(setRecent);
  }, [visible, useRecent]);
  const categories = useMemo(() => withRecent(recent), [recent]);
  const emojiTranslation = useMemo(
    () => ({ ...emojiTr, recently_used: t("mobile.emojiGif.recent") }),
    [],
  );

  // C81 — varsayılan tepkiler bölümü: düzenleme kipinde seçilen yuva, listeden seçilen emojiyle değişir.
  const quick = useQuickReactions();
  const [editing, setEditing] = useState(false);
  // C81 Rev.2: WhatsApp gibi ikonla açılan arama (kütüphanenin kendi arama kutusu kapalı).
  const [searching, setSearching] = useState(false);
  const [slot, setSlot] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function replaceDefault(index: number, emoji: string) {
    const next = replaceSlot(quick, index, emoji);
    if (!next) return;
    setSaving(true);
    try {
      await saveQuickReactions(next);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function pick(emoji: string) {
    // Düzenleme kipinde liste seçimi tepki değildir: seçili yuvayı değiştirir, sayfa açık kalır.
    if (editing) {
      if (slot === null) return;
      const index = slot;
      setSlot(null);
      void replaceDefault(index, emoji);
      return;
    }
    if (useRecent) void recordEmojiUse(emoji);
    onEmojiSelected(emoji);
    // Seçimden sonra sayfa kapanır (eski modal seçici gibi); üç kullanım yerinin hepsi için tek nokta.
    close();
  }

  function close() {
    setError("");
    setTab("emoji");
    setEditing(false);
    setSlot(null);
    setSearching(false);
    onClose();
  }

  async function pickGif() {
    setError("");
    if (existingCount >= MAX_ATTACHMENTS_PER_MESSAGE) {
      setError(
        t("mobile.attach.limit", { count: MAX_ATTACHMENTS_PER_MESSAGE }),
      );
      return;
    }
    // Galeri seçicisi, düzenleme/dönüştürme YOK: GIF olduğu gibi gelir (bkz. `pickProfileMedia`).
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.length) return;
    const file = result.assets[0];
    const name = (file.fileName ?? file.uri).toLowerCase();
    const looksGif =
      (file.mimeType && file.mimeType !== "image/*" ? file.mimeType : "") ===
        "image/gif" || name.endsWith(".gif");
    if (!looksGif) {
      setError(t("mobile.emojiGif.onlyGif"));
      return;
    }
    setBusy(true);
    try {
      const r = await buildDraftAttachment({
        uri: file.uri,
        filename: file.fileName ?? "gif.gif",
        contentType: "image/gif",
        size: file.fileSize,
      });
      if (!r.ok) {
        setError(t(r.errorKey));
        return;
      }
      setTab("emoji");
      onGifDraft?.(r.draft);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropTap}
          onPress={close}
          accessibilityLabel={t("common.close")}
        />
        <View
          style={[
            styles.sheet,
            {
              height: height * (searching ? SEARCH_RATIO : SHEET_RATIO),
              paddingBottom: sheetBottomPadding(bottomInset),
            },
          ]}
        >
          <View style={styles.grabber} />
          {searching ? (
            <EmojiSearchPanel
              onPick={(e) => {
                // Düzenleme kipinde aramadan seçilen emoji de yuvaya gider; aramadan çıkılır.
                if (editing) setSearching(false);
                pick(e);
              }}
              onClose={() => setSearching(false)}
            />
          ) : (
            <>
              {/* C81 Rev.2 — WhatsApp düzeni: solda arama ikonu, ortada Emoji | GIF; kategori şeridi en altta. */}
              <View style={styles.headerRow}>
                {activeTab === "emoji" ? (
                  <Pressable
                    onPress={() => setSearching(true)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={t("mobile.emojiGif.openSearch")}
                    style={styles.searchButton}
                  >
                    <Ionicons
                      name="search"
                      size={22}
                      color={theme.colors.textSecondary}
                    />
                  </Pressable>
                ) : (
                  <View style={styles.searchButton} />
                )}
                {showGif && (
                  <View style={styles.tabs}>
                    {(["emoji", "gif"] as const).map((key) => (
                      <Pressable
                        key={key}
                        onPress={() => setTab(key)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: activeTab === key }}
                        style={[
                          styles.tab,
                          activeTab === key && styles.tabActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.tabText,
                            activeTab === key && styles.tabTextActive,
                          ]}
                        >
                          {t(
                            key === "emoji"
                              ? "mobile.emojiGif.tabEmoji"
                              : "mobile.emojiGif.tabGif",
                          )}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              {activeTab === "emoji" && defaultReactions && (
                <View style={styles.defaults}>
                  <View style={styles.defaultsHeader}>
                    <Text style={styles.defaultsTitle}>
                      {t("mobile.emojiGif.defaults")}
                    </Text>
                    <Pressable
                      onPress={() => {
                        setEditing((v) => !v);
                        setSlot(null);
                        setError("");
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                    >
                      <Text style={styles.defaultsAction}>
                        {editing
                          ? t("mobile.emojiGif.defaultsDone")
                          : t("mobile.emojiGif.defaultsEdit")}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.defaultsRow}>
                    {quick.map((emoji, i) => (
                      <Pressable
                        key={`${i}-${emoji}`}
                        onPress={() => (editing ? setSlot(i) : pick(emoji))}
                        disabled={saving}
                        style={[
                          styles.defaultSlot,
                          editing && slot === i && styles.defaultSlotActive,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={emoji}
                      >
                        <Text style={styles.defaultEmoji}>{emoji}</Text>
                      </Pressable>
                    ))}
                    {saving ? (
                      <ActivityIndicator color={theme.colors.textMuted} />
                    ) : null}
                  </View>
                  {editing ? (
                    <Text style={styles.defaultsHint}>
                      {t("mobile.emojiGif.defaultsHint")}
                    </Text>
                  ) : null}
                  {error ? <Text style={styles.error}>{error}</Text> : null}
                </View>
              )}

              {activeTab === "emoji" ? (
                <View style={styles.body}>
                  <EmojiKeyboard
                    onEmojiSelected={(e) => pick(e.emoji)}
                    translation={emojiTranslation}
                    emojisByCategory={categories}
                    categoryPosition="bottom"
                    theme={emojiPickerTheme}
                  />
                </View>
              ) : (
                <View style={styles.gifBody}>
                  <Pressable
                    onPress={() => void pickGif()}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={t("mobile.emojiGif.uploadGif")}
                    style={[styles.row, busy && styles.rowBusy]}
                  >
                    <Ionicons
                      name="image-outline"
                      size={22}
                      color={theme.colors.textSecondary}
                    />
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle}>
                        {t("mobile.emojiGif.uploadGif")}
                      </Text>
                      <Text style={styles.rowHint}>
                        {t("mobile.emojiGif.uploadGifHint")}
                      </Text>
                    </View>
                    {busy ? (
                      <ActivityIndicator color={theme.colors.textMuted} />
                    ) : (
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={theme.colors.textMuted}
                      />
                    )}
                  </Pressable>
                  {error ? <Text style={styles.error}>{error}</Text> : null}
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "flex-end",
  },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: theme.colors.bgSidebar,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    overflow: "hidden",
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    marginVertical: 10,
    backgroundColor: theme.colors.borderStrong,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: theme.layout.panelGap,
    marginBottom: 8,
  },
  searchButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: {
    flex: 1,
    flexDirection: "row",
    gap: 4,
    marginRight: 36,
    padding: 3,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
  },
  tabActive: { backgroundColor: theme.colors.accentSubtle },
  tabText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    fontWeight: "600",
  },
  tabTextActive: { color: theme.colors.accent500 },
  body: { flex: 1 },
  gifBody: { paddingHorizontal: theme.layout.panelGap, paddingTop: 4, gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  rowBusy: { opacity: 0.6 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: "500",
  },
  rowHint: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    marginTop: 1,
  },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
  defaults: {
    paddingHorizontal: theme.layout.panelGap,
    paddingBottom: 8,
    gap: 6,
  },
  defaultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  defaultsTitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
  },
  defaultsAction: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
  },
  defaultsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  defaultSlot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.bgElevated,
  },
  defaultSlotActive: {
    borderWidth: 2,
    borderColor: theme.colors.accent500,
    backgroundColor: theme.colors.accentSubtle,
  },
  defaultEmoji: { fontSize: 24 },
  defaultsHint: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
});
