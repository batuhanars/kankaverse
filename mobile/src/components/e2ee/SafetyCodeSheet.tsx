import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { SafetyCodeView } from "@kankaverse/e2ee-client";
import { Button, Card } from "@/components/transfer/TransferSheets";
import { useE2eeStore } from "@/stores/e2ee";
import { t } from "@/i18n";
import { theme } from "@/theme";

interface Member {
  id: string;
  username: string;
}

/**
 * E7 §4.7 güvenlik kodu (web `SafetyCodeModal` karşılığı). 1-1 DM'de kod doğrudan; grupta önce kişi seçilir
 * (kod iki kişi arasındadır). 12 grup × 5 hane, telefonda 4 satır × 3 grup: 320 dp'de de tek satıra sığsın.
 * "Doğrulandı" işareti yalnız bu cihazda (§10-2). Karşı tarafın kimliği yoksa (eski sürüm) kod yerine açıklama.
 */
export function SafetyCodeSheet({
  members,
  onClose,
}: {
  members: Member[];
  onClose: () => void;
}) {
  const engine = useE2eeStore((s) => s.engine);
  const [selectedId, setSelectedId] = useState<string | null>(
    members.length === 1 ? members[0].id : null,
  );
  const [code, setCode] = useState<SafetyCodeView | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const selected = members.find((m) => m.id === selectedId) ?? null;
  const showBack = !!selected && members.length > 1;

  const load = useCallback(
    async (userId: string) => {
      setCode(null);
      const identity = engine?.identity;
      if (!identity) return;
      setLoading(true);
      try {
        setCode(await identity.safetyCode(userId));
      } catch (e) {
        console.error(
          "[E2EE] güvenlik kodu okunamadı",
          e instanceof Error ? e.name : typeof e,
        );
      } finally {
        setLoading(false);
      }
    },
    [engine],
  );

  useEffect(() => {
    if (selectedId) void load(selectedId);
    else setCode(null);
  }, [selectedId, load]);

  async function toggleVerified() {
    const identity = engine?.identity;
    if (!identity || !selectedId || !code) return;
    setSaving(true);
    try {
      await identity.setVerified(selectedId, !code.verified);
      await load(selectedId);
    } finally {
      setSaving(false);
    }
  }

  const rows = useMemo(() => {
    const g = code?.groups ?? [];
    return [g.slice(0, 3), g.slice(3, 6), g.slice(6, 9), g.slice(9, 12)];
  }, [code]);

  return (
    <Card title={t("e2ee.identity.codeTitle")} onClose={onClose} closeIcon>
      {!selected ? (
        <>
          <Text style={styles.muted}>{t("e2ee.identity.pickMember")}</Text>
          <View>
            {members.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => setSelectedId(m.id)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.member,
                  pressed && styles.memberPressed,
                ]}
              >
                <Text style={styles.body} numberOfLines={1}>
                  {m.username}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.strong}>
            {t("e2ee.identity.codeWith", { name: selected.username })}
          </Text>
          {loading ? (
            <ActivityIndicator color={theme.colors.textMuted} />
          ) : !code ? (
            <Text style={styles.muted}>
              {t("e2ee.identity.codeMissing", { name: selected.username })}
            </Text>
          ) : (
            <>
              <View style={styles.code} accessibilityLiveRegion="polite">
                {rows.map((row, i) => (
                  // Büyük yazı tipi ayarında satır bölünmesin: kod satırı küçülerek sığar.
                  <Text
                    key={i}
                    style={styles.codeRow}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {row.join("  ")}
                  </Text>
                ))}
              </View>
              <Text style={styles.body}>
                {t("e2ee.identity.codeHelp", { name: selected.username })}
              </Text>
              {code.verified ? (
                <Text style={styles.verified} accessibilityRole="text">
                  {t("e2ee.identity.verified")}
                </Text>
              ) : null}
              <Text style={styles.small}>{t("e2ee.identity.localOnly")}</Text>
            </>
          )}
        </>
      )}

      {showBack || code ? (
        <View style={styles.actions}>
          {showBack ? (
            <Button
              kind="ghost"
              label={t("e2ee.identity.back")}
              onPress={() => setSelectedId(null)}
            />
          ) : null}
          {code ? (
            <Button
              kind="ghost"
              label={
                code.verified
                  ? t("e2ee.identity.unmarkVerified")
                  : t("e2ee.identity.markVerified")
              }
              onPress={() => void toggleVerified()}
              disabled={saving}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: {
    flexShrink: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    lineHeight: 21,
  },
  strong: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: "700",
  },
  muted: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  small: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  verified: {
    color: theme.colors.online,
    fontSize: theme.fontSize.base,
    fontWeight: "700",
  },
  member: {
    minHeight: theme.layout.inputMinHeight,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
  },
  memberPressed: { backgroundColor: theme.colors.bgElevated },
  code: { alignItems: "center", gap: 4, paddingVertical: 4 },
  codeRow: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 1.5,
    fontVariant: ["tabular-nums"],
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
  },
});
