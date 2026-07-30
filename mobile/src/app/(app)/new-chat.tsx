import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFriendsStore } from '@/stores/friends';
import { useDmStore } from '@/stores/dm';
import { extractErrorMessage } from '@/api/errors';
import { dmRouteParams } from '@/utils/dmRoute';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1b contract §3.2 (Yeni DM başlat) + §3.3 (Grup DM kur) — web `StartChatModal.vue`
// deseni: kanka listesinden çoklu seçim; 1 seçim → 1-1 DM (`POST /dm/channels`), 2+ seçim → grup
// DM (`POST /dm/groups`, opsiyonel ad). İki ayrı ekran yerine tek akış — aynı arkadaş listesini iki
// kez çizmemek için bilinçli bir birleştirme (dev kararı, sözleşme ekran sayısını "3.2 ekranı" ve
// "3.3 kurma akışı" olarak ayrı ANLATIYOR ama ayrı ROUTE zorunlu kılmıyor; rapora not edildi).
export default function NewChatScreen() {
  const router = useRouter();
  const friends = useFriendsStore((s) => s.friends);
  const fetchAll = useFriendsStore((s) => s.fetchAll);
  const createChannel = useDmStore((s) => s.createChannel);
  const createGroup = useDmStore((s) => s.createGroup);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const isGroup = selected.size >= 2;

  async function onSubmit() {
    if (selected.size === 0 || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const ids = Array.from(selected);
      // Sözleşme §3.3 🔴 T&S — grup kurma minöre kapalı + üyeler arkadaş olmak zorunda; sunucu bu
      // retleri jenerik verir (`GROUP_MINOR_FORBIDDEN`/`NOT_FRIEND` → "Kullanıcı eklenemedi." vb.).
      // İstemci sebebi tahmin etmez, `extractErrorMessage` sunucunun Türkçe mesajını gösterir.
      const channel = isGroup ? await createGroup(ids, groupName.trim() || undefined) : await createChannel(ids[0]);
      router.replace(dmRouteParams(channel));
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stack.Screen options={{ title: t('startChat.title') }} />

      {isGroup && (
        <View style={styles.nameField}>
          <Text style={styles.label}>{t('startChat.groupNameLabel')}</Text>
          <TextInput
            value={groupName}
            onChangeText={setGroupName}
            placeholder={t('startChat.groupNamePlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            maxLength={50}
            style={styles.input}
          />
        </View>
      )}

      <Text style={styles.sectionLabel}>{t('startChat.selectFriends')}</Text>

      {friends.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{t('startChat.noFriends')}</Text>
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(f) => f.user.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.user.id);
            return (
              <Pressable onPress={() => toggle(item.user.id)} style={[styles.row, isSelected && styles.rowSelected]}>
                <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                  {isSelected && <Ionicons name="checkmark" size={12} color={theme.colors.textPrimary} />}
                </View>
                {item.user.avatarUrl ? (
                  <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarFallbackText}>{item.user.username.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.name} numberOfLines={1}>
                  {item.user.username}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      <View style={styles.footer}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          onPress={onSubmit}
          disabled={selected.size === 0 || submitting}
          style={[styles.submitButton, (selected.size === 0 || submitting) && styles.disabled]}
        >
          {submitting ? (
            <ActivityIndicator color={theme.colors.textPrimary} />
          ) : (
            <Text style={styles.submitButtonText}>{isGroup ? t('startChat.createGroup') : t('startChat.openChat')}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  nameField: {
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: theme.layout.panelGap,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginBottom: 6,
  },
  input: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgSidebar,
    color: theme.colors.textPrimary,
    paddingHorizontal: 14,
    fontSize: theme.fontSize.base,
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: theme.layout.panelGap,
    paddingBottom: 6,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap * 1.5,
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.base,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: theme.radius.md,
  },
  rowSelected: {
    backgroundColor: theme.colors.accentSubtle,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: theme.colors.accent500,
    borderColor: theme.colors.accent500,
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
  name: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '500',
  },
  footer: {
    padding: theme.layout.panelGap,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.xs,
    marginBottom: 8,
  },
  submitButton: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
});
