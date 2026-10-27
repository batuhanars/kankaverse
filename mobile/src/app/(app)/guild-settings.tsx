import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { guildsApi, type GuildSummaryDto } from '@/api/guilds';
import { extractErrorMessage } from '@/api/errors';
import { useAuthStore } from '@/stores/auth';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SettingsRow } from '@/components/guild/SettingsRow';
import { GuildMediaFields } from '@/components/guild/GuildMediaFields';
import { useGuildMediaEdit } from '@/components/guild/useGuildMediaEdit';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1e §2.2 — Ortam Ayarları ana ekranı. Discord'un "Sunucu Ayarları" gruplu liste düzeni;
 * **düzen alındı, içerik alınmadı.**
 *
 * 🔴 KONMAYANLAR (Discord'da var, bizde YOK): Moderasyon/AutoMod · Entegrasyonlar · Emoji ·
 * Topluluk · Güvenlik · Şablonlar. Bunlar için ne uç ne kavram var.
 *
 * C19: ortam simgesi ve afişi **yalnız OWNER** için yüklenir/değiştirilir (M1d §10.3 kuralı bu sözleşmeyle
 * gevşetildi). Akış `profile-edit.tsx` ile aynı: seç, konumlandır / kesit seç, yükle.
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
  const loadGuild = useCallback(() => {
    guildsApi
      .list()
      .then((list) => setGuild(list.find((g) => g.id === guildId) ?? null))
      .catch(() => {});
  }, [guildId]);
  useFocusEffect(loadGuild);
  const media = useGuildMediaEdit(guildId, loadGuild, { icon: !!guild?.iconUrl, banner: !!guild?.bannerUrl });


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
        {/* Sahip kararı 2026-10-27: profil düzenlemedeki gibi afiş + üstüne binen simge, köşelerinde kalem. */}
        <GuildMediaFields
          guild={guild}
          fallbackName={name}
          editable={isOwner}
          onEditIcon={() => media.pick('GUILD_ICON')}
          onEditBanner={() => media.pick('GUILD_BANNER')}
        />

        <Text style={styles.groupLabel}>{t('guildSettings.nav.genel')}</Text>
        <View style={styles.group}>
          {/* Genel ayarlar (ad · açıklama · 18+ · keşfet · etiketler · ortamı sil) uçları
              **yalnız OWNER** kabul ediyor → satır ADMIN'e render edilmez. */}
          {isOwner && (
            <SettingsRow
              icon="settings-outline"
              // Satır ve ekran başlığı AYNI anahtardan (sahip bulgusu: "Kanallar"da ikisi
              // ayrışmıştı, aynı hatayı tekrarlamayalım).
              label={t('mobile.guildSettings.generalTitle')}
              onPress={() => router.push({ pathname: '/guild-general', params: { id: guildId } })}
            />
          )}
          {/* Kanallar — sahip kararı 2026-08-01. PM önerisi koymamaktı (kanal CRUD ortam panelinde
              ve kanal satırında zaten var); sahip "her yerden erişilsin" diyerek koymayı seçti.
              Ekran düzenlemeyi YENİDEN YAZMIYOR, mevcut ekranlara yönlendiriyor — iki giriş, tek
              uygulama. */}
          <SettingsRow
            icon="list-outline"
            // Ekran başlığıyla AYNI anahtar: satır "Metin Kanalları" derken açılan ekran
            // "Kanallar" diyordu (sahip bulgusu 2026-08-01). Tek kaynak, iki yerde aynı ad.
            label={t('mobile.guildSettings.channelsTitle')}
            onPress={() => router.push({ pathname: '/guild-channels', params: { id: guildId } })}
          />
          <SettingsRow
            icon="people-outline"
            label={t('member.panel')}
            onPress={() =>
              router.push({ pathname: '/guild-members', params: { id: guildId, name } })
            }
          />
          {/* Roller — liste her üyeye açık ama oluştur/düzenle OWNER/ADMIN; ayarlara zaten
              yalnız yetkili giriyor. */}
          <SettingsRow
            icon="shield-outline"
            label={t('guildSettings.nav.roller')}
            onPress={() => router.push({ pathname: '/guild-roles', params: { id: guildId } })}
          />
          <SettingsRow
            icon="link-outline"
            label={t('guildSettings.nav.davetler')}
            onPress={() => router.push({ pathname: '/guild-invites', params: { id: guildId } })}
          />
          <SettingsRow
            icon="ban-outline"
            label={t('guildSettings.nav.yasaklar')}
            onPress={() => router.push({ pathname: '/guild-bans', params: { id: guildId, name } })}
          />
          <SettingsRow
            icon="clipboard-outline"
            label={t('audit.title')}
            onPress={() => router.push({ pathname: '/guild-audit', params: { id: guildId } })}
            last
          />
        </View>

        {errorMessage || media.error ? <Text style={styles.error}>{errorMessage || media.error}</Text> : null}

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

      {media.sheet}

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
