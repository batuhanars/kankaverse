import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MentionCandidate } from './useMentionCompose';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M2d §4.2 — bahsetme öneri listesi. Mesaj kutusunun **ÜSTÜNDE**, giriş şeridine yapışık.
 * Mobilde aşağı açılamaz: klavye orayı kaplıyor.
 *
 * 🔴 **`Modal` KULLANILMAZ.** Klavye açıkken üstüne Modal bindirmek Android'de kırılgan (aynı not
 * `EventCard`/`DmMenuHost` dosyalarında da var) ve klavyeyi kapatır — kullanıcı yazmanın ortasında.
 * Bu yüzden liste, giriş şeridiyle aynı ağaçta sıradan bir `View` olarak durur.
 *
 * `keyboardShouldPersistTaps="handled"`: dokunuş listeye ulaşmadan klavye kapanırsa ilk dokunuş
 * yutulur ve kullanıcı iki kez basmak zorunda kalır.
 */
interface Props {
  suggestions: MentionCandidate[];
  onSelect: (candidate: MentionCandidate) => void;
}

export function MentionSuggestionList({ suggestions, onSelect }: Props) {
  if (!suggestions.length) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll}>
        {suggestions.map((c) => (
          <Pressable
            key={c.id}
            style={styles.row}
            onPress={() => onSelect(c)}
            accessibilityRole="button"
            accessibilityLabel={c.isEveryone ? t('mobile.mention.everyoneLabel') : `@${c.username}`}
          >
            {c.isEveryone ? (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Ionicons name="people-outline" size={16} color={theme.colors.textSecondary} />
              </View>
            ) : c.avatarUrl ? (
              <Image source={{ uri: c.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarText}>{c.username.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.textWrap}>
              <Text style={styles.name} numberOfLines={1}>
                {c.isEveryone ? t('mobile.mention.everyoneLabel') : c.username}
              </Text>
              {c.isEveryone && (
                <Text style={styles.hint} numberOfLines={1}>
                  {t('mobile.mention.everyoneHint')}
                </Text>
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.bgElevated,
  },
  // Sözleşme §4.2 — en fazla ~200dp; fazlası klavyeyle birlikte ekranı yutar.
  scroll: { maxHeight: 200 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    // ≥44dp dokunma hedefi (sözleşme §4.5)
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: theme.layout.panelGap,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarFallback: {
    backgroundColor: theme.colors.bgSidebar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  textWrap: { flex: 1, minWidth: 0 },
  name: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 1,
  },
});
