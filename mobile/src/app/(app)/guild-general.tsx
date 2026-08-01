import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { guildsApi, type GuildSummaryDto } from '@/api/guilds';
import { extractErrorMessage } from '@/api/errors';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TagEditor } from '@/components/guild/TagEditor';
import { t } from '@/i18n';
import { theme } from '@/theme';

const NAME_MAX = 50;
const DESC_MAX = 2000;

/**
 * Sprint M1e-B §3.1 — Ortam Ayarları > Genel. **Yalnız OWNER** (uç öyle istiyor; ekrana giriş
 * satırı da sahibe render ediliyor).
 *
 * Sözleşmede yalnız "ad + adultsOnly + sil" yazıyordu; `UpdateGuildDto` kaynaktan okununca
 * `description` · `discoverable` · `tags` da çıktı ve parite kuralı gereği alındı.
 *
 * 🔴 `adultsOnly` bir **T&S kapısıdır** (Sprint 7A: minör davetle bile giremez) — sessiz bir
 * anahtar değil, ne yaptığı yazıyla açıklanır.
 * 🔴 Afiş RENGİ burada yok: preset/hex kararı açık (bkz. TASK.md). Yarım bir seçici koymaktansa
 * hiç koymamak doğru.
 */
export default function GuildGeneralScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const guildId = params.id;

  const [guild, setGuild] = useState<GuildSummaryDto | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [adultsOnly, setAdultsOnly] = useState(false);
  const [discoverable, setDiscoverable] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useFocusEffect(
    useCallback(() => {
      guildsApi
        .list()
        .then((list) => {
          const g = list.find((x) => x.id === guildId) ?? null;
          if (!g) return;
          setGuild(g);
          setName(g.name);
          setDescription(g.description ?? '');
          setAdultsOnly(g.adultsOnly);
          setDiscoverable(g.discoverable);
          setTags(g.tags);
        })
        .catch((e) => setErrorMessage(extractErrorMessage(e)));
    }, [guildId]),
  );

  const dirty =
    !!guild &&
    (name.trim() !== guild.name ||
      description.trim() !== (guild.description ?? '') ||
      adultsOnly !== guild.adultsOnly ||
      discoverable !== guild.discoverable ||
      tags.join('|') !== guild.tags.join('|'));

  async function onSave() {
    if (!dirty || busy) return;
    setBusy(true);
    setErrorMessage('');
    setSavedNotice('');
    try {
      const updated = await guildsApi.update(guildId, {
        name: name.trim(),
        description: description.trim(),
        adultsOnly,
        discoverable,
        tags,
      });
      setGuild(updated);
      setSavedNotice(t('guildSettings.saveAll'));
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    setBusy(true);
    setErrorMessage('');
    try {
      await guildsApi.remove(guildId);
      setConfirmDelete(false);
      // Ray tazelensin: silinen ortam listeden düşer (M1d §6 deseni).
      router.replace({ pathname: '/(app)/(tabs)/home', params: { refreshGuilds: '1' } });
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stack.Screen
        options={{
          title: t('mobile.guildSettings.generalTitle'),
          headerRight: () =>
            busy && !confirmDelete ? (
              <ActivityIndicator color={theme.colors.accent500} style={styles.headerAction} />
            ) : (
              <Pressable onPress={onSave} disabled={!dirty} hitSlop={10} style={styles.headerAction}>
                <Text style={[styles.headerActionText, !dirty && styles.headerActionDisabled]}>
                  {t('common.save')}
                </Text>
              </Pressable>
            ),
        }}
      />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.label}>{t('guildSettings.nameLabel')}</Text>
        <TextInput
          value={name}
          onChangeText={(v) => {
            setName(v.slice(0, NAME_MAX));
            setSavedNotice('');
          }}
          style={styles.input}
          autoCorrect={false}
        />

        <Text style={styles.label}>{t('guildSettings.descriptionSection')}</Text>
        <TextInput
          value={description}
          onChangeText={(v) => {
            setDescription(v.slice(0, DESC_MAX));
            setSavedNotice('');
          }}
          placeholder={t('guildSettings.descriptionPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, styles.multiline]}
          multiline
        />

        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.toggleLabel}>{t('guildSettings.adultsOnlyLabel')}</Text>
            <Text style={styles.toggleDesc}>{t('guildSettings.adultsOnlyDesc')}</Text>
          </View>
          <Switch
            value={adultsOnly}
            onValueChange={(v) => {
              setAdultsOnly(v);
              setSavedNotice('');
            }}
            trackColor={{ true: theme.colors.accent500, false: theme.colors.bgElevated }}
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.toggleLabel}>{t('guildSettings.discoverableLabel')}</Text>
            <Text style={styles.toggleDesc}>{t('guildSettings.discoverableHint')}</Text>
          </View>
          <Switch
            value={discoverable}
            onValueChange={(v) => {
              setDiscoverable(v);
              setSavedNotice('');
            }}
            trackColor={{ true: theme.colors.accent500, false: theme.colors.bgElevated }}
          />
        </View>

        <Text style={styles.label}>{t('guildSettings.featuresLabel')}</Text>
        <TagEditor
          tags={tags}
          onChange={(next) => {
            setTags(next);
            setSavedNotice('');
          }}
        />

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        {savedNotice ? <Text style={styles.saved}>{savedNotice}</Text> : null}

        <Pressable onPress={() => setConfirmDelete(true)} style={styles.dangerButton}>
          <Text style={styles.dangerText}>{t('guildSettings.deleteButton')}</Text>
        </Pressable>
        <Text style={styles.hint}>{t('guildSettings.deleteDesc')}</Text>
      </ScrollView>

      {confirmDelete && (
        <ConfirmDialog
          message={t('guildSettings.deleteConfirmMessage', { name: guild?.name ?? '' })}
          confirmLabel={t('guildSettings.deleteConfirmButton')}
          loading={busy}
          onConfirm={onDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  body: { padding: theme.layout.panelGap, gap: 10, paddingBottom: theme.layout.panelGap * 2 },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    marginTop: 8,
  },
  input: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    paddingHorizontal: 12,
  },
  multiline: {
    minHeight: 90,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  toggleText: { flex: 1, minWidth: 0 },
  toggleLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  toggleDesc: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
    marginTop: 2,
  },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
  saved: { color: theme.colors.accent500, fontSize: theme.fontSize.sm },
  hint: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, lineHeight: 17 },
  dangerButton: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  dangerText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  headerAction: { marginRight: 12 },
  headerActionText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  headerActionDisabled: { color: theme.colors.textMuted },
});
