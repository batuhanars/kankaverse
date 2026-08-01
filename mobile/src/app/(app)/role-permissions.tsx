import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { rolesApi, PERMISSION_GROUPS, type RoleDto } from '@/api/roles';
import { extractErrorMessage } from '@/api/errors';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1e-B §3.5 — izin matrisi. 16 bayrak, gruplu.
 *
 * 🔴 Etiket ve açıklamalar `guildSettings.permsFlags.<FLAG>.label/desc` anahtarlarından geliyor —
 * mobilde izin metni YAZILMADI. İzin adları hukuki/yetki metni; iki istemcide farklı cümle
 * kurulması kabul edilemez.
 *
 * 🔴 `CANNOT_GRANT_PERMISSION`: sahip olmadığın izni bir role veremezsin. Bu kararı **sunucu**
 * veriyor. İstemci listeyi kısmıyor ve anahtarı kilitlemiyor; ret gelirse sunucunun mesajı
 * gösteriliyor ve anahtar eski hâline dönüyor.
 */
export default function RolePermissionsScreen() {
  const params = useLocalSearchParams<{ id: string; guildId: string }>();

  const [role, setRole] = useState<RoleDto | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useFocusEffect(
    useCallback(() => {
      rolesApi
        .listByGuild(params.guildId)
        .then((list) => {
          const r = list.find((x) => x.id === params.id) ?? null;
          setRole(r);
          setPermissions(r?.permissions ?? []);
          setState('ready');
        })
        .catch((e) => {
          setErrorMessage(extractErrorMessage(e));
          setState('error');
        });
    }, [params.guildId, params.id]),
  );

  const dirty = !!role && permissions.slice().sort().join('|') !== role.permissions.slice().sort().join('|');

  function toggle(flag: string) {
    setErrorMessage('');
    setPermissions((prev) => (prev.includes(flag) ? prev.filter((p) => p !== flag) : [...prev, flag]));
  }

  async function onSave() {
    if (!dirty || busy) return;
    setBusy(true);
    setErrorMessage('');
    try {
      const updated = await rolesApi.update(params.id, { permissions });
      setRole(updated);
      setPermissions(updated.permissions);
    } catch (e) {
      // Sunucu reddettiyse ekrandaki hâl yanıltmasın: kaydedilmiş değere geri dönülür.
      setErrorMessage(extractErrorMessage(e));
      if (role) setPermissions(role.permissions);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          title: t('guildSettings.roles.tabPermissions'),
          headerRight: () =>
            busy ? (
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

      {state === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {state === 'ready' && (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.hint}>{t('guildSettings.roles.permsGrantHint')}</Text>

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          {PERMISSION_GROUPS.map((group) => (
            <View key={group.key}>
              <Text style={styles.groupLabel}>{t(`guildSettings.permsGroups.${group.key}`)}</Text>
              <View style={styles.group}>
                {group.flags.map((flag, idx) => (
                  <View
                    key={flag}
                    style={[styles.row, idx < group.flags.length - 1 && styles.divider]}
                  >
                    <View style={styles.rowText}>
                      <Text style={styles.flagLabel}>
                        {t(`guildSettings.permsFlags.${flag}.label`)}
                      </Text>
                      <Text style={styles.flagDesc}>
                        {t(`guildSettings.permsFlags.${flag}.desc`)}
                      </Text>
                    </View>
                    <Switch
                      value={permissions.includes(flag)}
                      onValueChange={() => toggle(flag)}
                      trackColor={{ true: theme.colors.accent500, false: theme.colors.bgElevated }}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: theme.layout.panelGap, paddingBottom: theme.layout.panelGap * 2, gap: 4 },
  hint: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, lineHeight: 17, marginBottom: 8 },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm, marginBottom: 8 },
  groupLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 6,
  },
  group: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgSidebar,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 12,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: theme.colors.borderSubtle },
  rowText: { flex: 1, minWidth: 0 },
  flagLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  flagDesc: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
    marginTop: 2,
  },
  headerAction: { marginRight: 12 },
  headerActionText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  headerActionDisabled: { color: theme.colors.textMuted },
});
