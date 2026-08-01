import { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { guildsApi, type GuildSummaryDto } from '@/api/guilds';
import { extractErrorMessage } from '@/api/errors';
import { useAuthStore } from '@/stores/auth';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SettingsRow } from '@/components/guild/SettingsRow';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1e §2.2 — Ortam Ayarları ana ekranı. Discord'un "Sunucu Ayarları" gruplu liste düzeni;
 * **düzen alındı, içerik alınmadı.**
 *
 * 🔴 KONMAYANLAR (Discord'da var, bizde YOK): Moderasyon/AutoMod · Entegrasyonlar · Emoji ·
 * Topluluk · Güvenlik · Şablonlar. Bunlar için ne uç ne kavram var.
 *
 * 🔴 İkon/afiş **gösterilir, yüklenmez** (M1d §10.3 kalıcı kuralı; sahip istisnası yalnız
 * kullanıcının kendi profiliydi). Bu yüzden başlıktaki ikonda kalem YOK.
 *
 * Bölümlerin bir kısmı B yarısında geliyor (Genel · Roller · Davetler · Denetim Kaydı · Ortamı Sil);
 * **hedefi olmayan satır bu ekrana konmaz** — boş yüzey açma kuralı.
 */
export default function GuildSettingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const guildId = params.id;
  const myUserId = useAuthStore((s) => s.user?.id ?? null);

  const [guild, setGuild] = useState<GuildSummaryDto | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Ortam listesi tek kaynak: ad/ikon buradan okunur (route parametresi yalnız ilk kare için).
  useFocusEffect(
    useCallback(() => {
      guildsApi
        .list()
        .then((list) => setGuild(list.find((g) => g.id === guildId) ?? null))
        .catch(() => {});
    }, [guildId]),
  );

  const isOwner = !!guild && !!myUserId && guild.ownerId === myUserId;
  const name = guild?.name ?? params.name ?? '';

  async function onConfirmLeave() {
    setLeaving(true);
    setErrorMessage('');
    try {
      await guildsApi.leave(guildId);
      setLeaveOpen(false);
      // Ray'i tazelemek ana ekranın işi (M1d §6 deseni: yeni store açılmaz).
      router.replace({ pathname: '/(app)/(tabs)/home', params: { refreshGuilds: '1' } });
    } catch (e) {
      // 🔴 OWNER ayrılamaz: sunucu reddeder ve SEBEBİ yazar. İstemci kapıyı taklit edip satırı
      // gizlemiyor — gizleseydi kullanıcı neden ayrılamadığını hiç öğrenemezdi (§2.6).
      setErrorMessage(extractErrorMessage(e));
      setLeaveOpen(false);
    } finally {
      setLeaving(false);
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('guildSettings.title') }} />

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.header}>
          {guild?.iconUrl ? (
            <Image source={{ uri: guild.iconUrl }} style={styles.icon} />
          ) : (
            <View style={[styles.icon, styles.iconFallback]}>
              <Text style={styles.iconFallbackText}>{name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.guildName} numberOfLines={2}>
            {name}
          </Text>
        </View>

        <Text style={styles.groupLabel}>{t('guildSettings.nav.genel')}</Text>
        <View style={styles.group}>
          <SettingsRow
            icon="people-outline"
            label={t('member.panel')}
            onPress={() =>
              router.push({ pathname: '/guild-members', params: { id: guildId, name } })
            }
          />
          <SettingsRow
            icon="ban-outline"
            label={t('guildSettings.nav.yasaklar')}
            onPress={() => router.push({ pathname: '/guild-bans', params: { id: guildId, name } })}
            last
          />
        </View>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        {/* Ayrılma her üyeye açık; OWNER'da sunucu reddeder ve sebebi yukarıda görünür. */}
        <View style={styles.group}>
          <SettingsRow
            icon="exit-outline"
            label={t('guild.leave')}
            danger
            onPress={() => setLeaveOpen(true)}
            last
          />
        </View>

        {/* Sahibe önceden söylenir; metin sunucunun ret mesajıyla AYNI şeyi söyler (iki yerde farklı
            cümle olursa hangisi doğru diye sorulur). */}
        {isOwner ? <Text style={styles.hint}>{t('mobile.guildSettings.leaveOwnerHint')}</Text> : null}
      </ScrollView>

      {leaveOpen && (
        <ConfirmDialog
          message={t('guild.leaveConfirm', { name })}
          confirmLabel={t('guild.leave')}
          loading={leaving}
          onConfirm={onConfirmLeave}
          onCancel={() => setLeaveOpen(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  body: {
    padding: theme.layout.panelGap,
    paddingBottom: theme.layout.panelGap * 2,
  },
  header: {
    alignItems: 'center',
    gap: 10,
    marginBottom: theme.layout.panelGap,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.lg,
  },
  iconFallback: {
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconFallbackText: {
    color: theme.colors.textSecondary,
    fontSize: 28,
    fontWeight: '700',
  },
  guildName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    textAlign: 'center',
  },
  groupLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 6,
  },
  group: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgSidebar,
    overflow: 'hidden',
    marginBottom: 14,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    marginBottom: 10,
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
  },
});
