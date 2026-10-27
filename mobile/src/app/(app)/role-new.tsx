import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { rolesApi } from '@/api/roles';
import { extractErrorMessage } from '@/api/errors';
import { RoleColorSheet } from '@/components/guild/RoleColorSheet';
import { RoleEmojiRow } from '@/components/guild/RoleEmojiRow';
import { t } from '@/i18n';
import { theme } from '@/theme';

const NAME_MAX = 50;
/** Sunucunun varsayılanı (`Role.color @default("#99AAB5")`) — istemci başka bir varsayılan uydurmaz. */
const DEFAULT_COLOR = '#99AAB5';

/**
 * Sprint M1e-B §3.3 — rol oluştur. **Tek adım**: ad + renk.
 *
 * Discord'un 3 adımlı sihirbazı (ad/renk → izinler → üyeler) **kopyalanmadı**: izinler ve üyeler
 * rol ekranında zaten var, kurma anında sormak aynı işi ikinci kez yapmak olurdu. Rol oluşunca
 * doğrudan rol ekranına düşülüyor — izin vermek isteyen oradan devam eder.
 */
export default function RoleNewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ guildId: string }>();

  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [emoji, setEmoji] = useState(''); // C21 ('' = yok)
  const [colorSheet, setColorSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const canSubmit = name.trim().length > 0 && !busy;

  async function onCreate() {
    if (!canSubmit) return;
    setBusy(true);
    setErrorMessage('');
    try {
      const role = await rolesApi.create(params.guildId, {
        name: name.trim(),
        color,
        ...(emoji && { unicodeEmoji: emoji }),
      });
      // Oluşturduktan sonra rol ekranına: kullanıcı izin/üye eklemek isteyecek, listeye
      // döndürmek onu bir dokunuş daha uğraştırırdı.
      router.replace({ pathname: '/role-edit', params: { id: role.id, guildId: params.guildId } });
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stack.Screen options={{ title: t('guildSettings.roles.createButton') }} />

      <View style={styles.body}>
        <Text style={styles.label}>{t('guildSettings.roles.nameLabel')}</Text>
        <TextInput
          value={name}
          onChangeText={(v) => {
            setName(v.slice(0, NAME_MAX));
            setErrorMessage('');
          }}
          placeholder={t('guildSettings.roles.namePlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={onCreate}
        />

        <RoleEmojiRow value={emoji} onChange={setEmoji} />

        <Text style={styles.label}>{t('guildSettings.roles.colorLabel')}</Text>
        <Pressable style={styles.colorRow} onPress={() => setColorSheet(true)}>
          <View style={[styles.swatch, { backgroundColor: color }]} />
          <Text style={styles.colorValue}>{color.toLowerCase()}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </Pressable>
        <Text style={styles.hint}>{t('guildSettings.roles.colorHint')}</Text>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <Pressable
          onPress={onCreate}
          disabled={!canSubmit}
          style={[styles.primaryButton, !canSubmit && styles.disabled]}
        >
          {busy ? (
            <ActivityIndicator color={theme.colors.textPrimary} />
          ) : (
            <Text style={styles.primaryText}>{t('guildSettings.roles.createButton')}</Text>
          )}
        </Pressable>
      </View>

      <RoleColorSheet
        visible={colorSheet}
        initialColor={color}
        onClose={() => setColorSheet(false)}
        onSelect={(hex) => {
          setColor(hex);
          setColorSheet(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  body: { padding: theme.layout.panelGap, gap: 10 },
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
  hint: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, lineHeight: 17 },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
  primaryButton: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  disabled: { opacity: 0.5 },
  primaryText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
});
