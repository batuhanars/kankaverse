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
import { Ionicons } from '@expo/vector-icons';
import { rolesApi, type RoleDto } from '@/api/roles';
import { extractErrorMessage } from '@/api/errors';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RoleColorSheet } from '@/components/guild/RoleColorSheet';
import { RoleEmojiRow } from '@/components/guild/RoleEmojiRow';
import { SettingsRow } from '@/components/guild/SettingsRow';
import { t } from '@/i18n';
import { theme } from '@/theme';

const NAME_MAX = 50;

/**
 * Sprint M1e-B §3.4 — rol ekranı: ad · renk · ayrı göster · bahsedilebilir · izinler · üyeler · sil.
 *
 * 🔴 `@everyone` (isEveryone) **farklı bir şey**: ortamın varsayılan izin kümesi, bir rol değil.
 * Sunucu adını/hoist'ini değiştirmiyor ve silmiyor → o alanlar **hiç render edilmez**, ekranda
 * yalnız izinler kalır. Sebebi de yazılır (`everyoneNote`), sessizce boş bırakılmaz.
 *
 * Sunucuda "tek rol getir" ucu YOK; liste çekilip id ile bulunuyor (üye ekranındaki desen).
 */
export default function RoleEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; guildId: string }>();

  const [role, setRole] = useState<RoleDto | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#99AAB5');
  const [emoji, setEmoji] = useState(''); // C21 ('' = yok)
  const [hoist, setHoist] = useState(false);
  const [mentionable, setMentionable] = useState(false);
  const [colorSheet, setColorSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useFocusEffect(
    useCallback(() => {
      rolesApi
        .listByGuild(params.guildId)
        .then((list) => {
          const r = list.find((x) => x.id === params.id) ?? null;
          if (!r) return;
          setRole(r);
          setName(r.name);
          setColor(r.color);
          setEmoji(r.unicodeEmoji ?? '');
          setHoist(r.hoist);
          setMentionable(r.mentionable);
        })
        .catch((e) => setErrorMessage(extractErrorMessage(e)));
    }, [params.guildId, params.id]),
  );

  const isEveryone = !!role?.isEveryone;
  const dirty =
    !!role &&
    (name.trim() !== role.name ||
      color.toLowerCase() !== role.color.toLowerCase() ||
      emoji !== (role.unicodeEmoji ?? '') ||
      hoist !== role.hoist ||
      mentionable !== role.mentionable);

  async function onSave() {
    if (!dirty || busy) return;
    setBusy(true);
    setErrorMessage('');
    try {
      // `@everyone`de ad ve hoist gönderilmez — sunucu reddediyor, göndermek gereksiz hata üretir.
      const updated = await rolesApi.update(
        params.id,
        isEveryone
          ? { mentionable, color }
          : { name: name.trim(), color, hoist, mentionable, unicodeEmoji: emoji || null },
      );
      setRole(updated);
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    setBusy(true);
    try {
      await rolesApi.remove(params.id);
      setConfirmDelete(false);
      router.back();
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
          title: role?.name ?? '',
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
        {isEveryone && <Text style={styles.note}>{t('guildSettings.roles.everyoneNote')}</Text>}

        {!isEveryone && (
          <>
            <Text style={styles.label}>{t('guildSettings.roles.nameLabel')}</Text>
            <TextInput
              value={name}
              onChangeText={(v) => setName(v.slice(0, NAME_MAX))}
              style={styles.input}
              autoCorrect={false}
            />
          </>
        )}

        {!isEveryone && <RoleEmojiRow value={emoji} onChange={setEmoji} />}

        <Text style={styles.label}>{t('guildSettings.roles.colorLabel')}</Text>
        <Pressable style={styles.colorRow} onPress={() => setColorSheet(true)}>
          <View style={[styles.swatch, { backgroundColor: color }]} />
          <Text style={styles.colorValue}>{color.toLowerCase()}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </Pressable>

        {!isEveryone && (
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>{t('guildSettings.roles.hoistLabel')}</Text>
              <Text style={styles.toggleDesc}>{t('guildSettings.roles.hoistDesc')}</Text>
            </View>
            <Switch
              value={hoist}
              onValueChange={setHoist}
              trackColor={{ true: theme.colors.accent500, false: theme.colors.bgElevated }}
            />
          </View>
        )}

        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.toggleLabel}>{t('guildSettings.roles.mentionableLabel')}</Text>
            <Text style={styles.toggleDesc}>{t('guildSettings.roles.mentionableDesc')}</Text>
          </View>
          <Switch
            value={mentionable}
            onValueChange={setMentionable}
            trackColor={{ true: theme.colors.accent500, false: theme.colors.bgElevated }}
          />
        </View>

        <View style={styles.group}>
          <SettingsRow
            icon="key-outline"
            label={t('guildSettings.roles.tabPermissions')}
            onPress={() =>
              router.push({ pathname: '/role-permissions', params: { id: params.id, guildId: params.guildId } })
            }
          />
          {/* Üye atama `@everyone`de anlamsız: rol zaten tüm üyelerde. */}
          {!isEveryone && (
            <SettingsRow
              icon="people-outline"
              label={t('guildSettings.roles.tabMembers')}
              onPress={() =>
                router.push({ pathname: '/role-members', params: { id: params.id, guildId: params.guildId } })
              }
              last
            />
          )}
        </View>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        {!isEveryone && (
          <Pressable onPress={() => setConfirmDelete(true)} style={styles.dangerButton}>
            <Text style={styles.dangerText}>{t('guildSettings.roles.deleteButton')}</Text>
          </Pressable>
        )}
      </ScrollView>

      <RoleColorSheet
        visible={colorSheet}
        initialColor={color}
        onClose={() => setColorSheet(false)}
        onSelect={(hex) => {
          setColor(hex);
          setColorSheet(false);
        }}
      />

      {confirmDelete && (
        <ConfirmDialog
          message={t('guildSettings.roles.deleteConfirmMessage', { name: role?.name ?? '' })}
          confirmLabel={t('guildSettings.roles.deleteConfirmButton')}
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
  note: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, lineHeight: 20 },
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
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
  },
  swatch: { width: 26, height: 26, borderRadius: theme.radius.sm },
  colorValue: { flex: 1, color: theme.colors.textSecondary, fontSize: theme.fontSize.base },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
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
  group: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgSidebar,
    overflow: 'hidden',
    marginTop: 12,
  },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
  dangerButton: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  dangerText: { color: theme.colors.danger, fontSize: theme.fontSize.base, fontWeight: '600' },
  headerAction: { marginRight: 12 },
  headerActionText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  headerActionDisabled: { color: theme.colors.textMuted },
});
