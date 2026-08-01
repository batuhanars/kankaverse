import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { rolesApi, type RoleDto } from '@/api/roles';
import { extractErrorMessage } from '@/api/errors';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1e-B §3.2 — Roller listesi.
 *
 * `@everyone` en üstte AYRI durur (Discord düzeni): o bir rol değil, ortamın varsayılan izin
 * kümesi. Adı/rengi/hoist'i değiştirilemez, silinemez — sunucu reddediyor, rol ekranı da o
 * alanları render etmiyor.
 *
 * 🔴 **Sürükle-sırala YOK** (`reorder` ucu bağlanmadı): dokunmatik sürükle-sırala mobilde tutarlı
 * olarak erteleniyor (kanal/kategori kararıyla aynı). Sıra sunucudan `position` DESC geliyor.
 */
export default function GuildRolesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const guildId = params.id;

  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useFocusEffect(
    useCallback(() => {
      rolesApi
        .listByGuild(guildId)
        .then((list) => {
          setRoles(list);
          setState('ready');
        })
        .catch((e) => {
          setErrorMessage(extractErrorMessage(e));
          setState('error');
        });
    }, [guildId]),
  );

  const everyone = roles.find((r) => r.isEveryone) ?? null;
  const custom = roles.filter((r) => !r.isEveryone);

  function openRole(role: RoleDto) {
    router.push({ pathname: '/role-edit', params: { id: role.id, guildId } });
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          title: t('guildSettings.nav.roller'),
          headerRight: () => (
            <View style={styles.headerActions}>
              {/* Sprint M1i — rol sırası HİYERARŞİDİR (yetki devralma yönü), yalnız görsel
                  sıralama değil. Kendi ekranında sürüklenir; sunucu `@everyone`i kabul etmediği
                  için o satır listede hiç yok. */}
              <Pressable
                onPress={() => router.push({ pathname: '/reorder', params: { guildId, kind: 'roles' } })}
                hitSlop={10}
                style={styles.headerAction}
                accessibilityLabel={t('mobile.reorder.action')}
              >
                <Ionicons name="swap-vertical" size={22} color={theme.colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => router.push({ pathname: '/role-new', params: { guildId } })}
                hitSlop={10}
                style={styles.headerAction}
                accessibilityLabel={t('guildSettings.roles.createButton')}
              >
                <Ionicons name="add" size={24} color={theme.colors.accent500} />
              </Pressable>
            </View>
          ),
        }}
      />

      {state === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {state === 'error' && (
        <View style={styles.center}>
          <Text style={styles.error}>{errorMessage}</Text>
        </View>
      )}

      {state === 'ready' && (
        <FlatList
          data={custom}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>
              <Text style={styles.desc}>{t('guildSettings.roles.listDesc')}</Text>
              {everyone && (
                <Pressable style={styles.everyoneRow} onPress={() => openRole(everyone)}>
                  <Ionicons name="people" size={20} color={theme.colors.textSecondary} />
                  <View style={styles.rowBody}>
                    <Text style={styles.roleName}>{t('guildSettings.roles.everyoneCardTitle')}</Text>
                    <Text style={styles.roleSub}>{t('guildSettings.roles.everyoneCardSubtitle')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </Pressable>
              )}
              <Text style={styles.groupLabel}>{t('guildSettings.roles.rolesCountHeader')}</Text>
            </>
          }
          ListEmptyComponent={<Text style={styles.empty}>{t('guildSettings.roles.noRoleSelected')}</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => openRole(item)}>
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <View style={styles.rowBody}>
                <Text style={styles.roleName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.roleSub}>
                  {t('guildSettings.roles.memberCount', { n: item.memberCount })}
                </Text>
              </View>
              {item.isDefault && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{t('guildSettings.roles.defaultBadge')}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap,
  },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm, textAlign: 'center' },
  list: { padding: theme.layout.panelGap, paddingBottom: 24 },
  desc: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    marginBottom: 12,
  },
  groupLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 6,
  },
  everyoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: theme.layout.panelGap,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgSidebar,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 12,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgSidebar,
    marginBottom: 8,
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
  rowBody: { flex: 1, minWidth: 0 },
  roleName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  roleSub: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 2 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: theme.colors.accentSubtle,
  },
  badgeText: { color: theme.colors.accent500, fontSize: theme.fontSize.xs, fontWeight: '700' },
  empty: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, textAlign: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerAction: { marginRight: 12 },
});
