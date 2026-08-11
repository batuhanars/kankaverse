import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { channelsApi, type ChannelSummaryDto } from '@/api/channels';
import { guildsApi, type GuildMemberDto } from '@/api/guilds';
import { extractErrorMessage } from '@/api/errors';
import { NotifTargetType } from '@/api/notifications';
import { useGuildPermission } from '@/hooks/useGuildPermission';
import { useNotificationPrefsStore } from '@/stores/notificationPrefs';
import { SelectSheet } from '@/components/guild/SelectSheet';
import { getMuteDurationOptions, muteMinutesFromValue } from '@/utils/notifPrefUi';
import { ChannelDetailsHeader } from '@/components/guild/ChannelDetailsHeader';
import { PinnedMessagesList } from '@/components/guild/PinnedMessagesList';
import { ChannelMembersTab } from '@/components/guild/ChannelMembersTab';
import { ChannelMediaTab } from '@/components/guild/ChannelMediaTab';
import { ChannelLinksTab } from '@/components/guild/ChannelLinksTab';
import { ChannelFilesTab } from '@/components/guild/ChannelFilesTab';
import { ChannelDetailsTabBar, type ChannelDetailsTab } from '@/components/guild/ChannelDetailsTabBar';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M2c contract §4 — kanal detay ekranı. Sohbet başlığında kanal adına dokununca açılır (§3),
 * yalnız ORTAM kanallarında (DM/grup DM başlığı kendi mevcut davranışını korur).
 *
 * Route parametreleri BİLİNÇLİ olarak yalnız `{ channelId, guildId }` (contract §3, "sapamaz") —
 * kanal adı/yaş-kapısı gibi görüntü verisi burada TEKRAR çekilir (`channelsApi.listByGuild`),
 * route'tan taşınmaz. Bu hem sözleşmeye sadık kalır hem ekran her açıldığında güncel veri gösterir
 * (kanal az önce yeniden adlandırılmış olabilir).
 *
 * Üye listesi de mount'ta EN BAŞTA çekilir (yalnız Üyeler sekmesi açılınca değil) — Ayarlar/Davet Et
 * düğmelerinin gösterilip gösterilmeyeceği (`canManage`) buna bağlı, o karar sekme seçilmeden önce
 * gerekiyor. Medya/Bağlantılar/Dosyalar sekmeleri ise sözleşme §4.3 gereği yalnız İLK açıldıklarında
 * çekilir (aşağıda `tab === 'x'` koşuluyla mount ediliyorlar).
 */
export default function ChannelDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { channelId, guildId } = useLocalSearchParams<{ channelId: string; guildId: string }>();

  const [channel, setChannel] = useState<ChannelSummaryDto | null>(null);
  const [channelState, setChannelState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [channelError, setChannelError] = useState('');

  const [members, setMembers] = useState<GuildMemberDto[]>([]);
  const [membersState, setMembersState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [membersError, setMembersError] = useState('');

  const [tab, setTab] = useState<ChannelDetailsTab>('members');
  const [muteSheetOpen, setMuteSheetOpen] = useState(false);

  const loadChannel = useCallback(() => {
    if (!guildId || !channelId) return;
    setChannelState('loading');
    channelsApi
      .listByGuild(guildId)
      .then((list) => {
        const found = list.find((c) => c.id === channelId);
        if (!found) {
          setChannelError(t('mobile.channelDetails.notFound'));
          setChannelState('error');
          return;
        }
        setChannel(found);
        setChannelState('ready');
      })
      .catch((e) => {
        setChannelError(extractErrorMessage(e));
        setChannelState('error');
      });
  }, [guildId, channelId]);

  const loadMembers = useCallback(() => {
    if (!guildId) return;
    setMembersState('loading');
    guildsApi
      .getMembers(guildId)
      .then((list) => {
        setMembers(list);
        setMembersState('ready');
      })
      .catch((e) => {
        setMembersError(extractErrorMessage(e));
        setMembersState('error');
      });
  }, [guildId]);

  useEffect(() => {
    loadChannel();
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, guildId]);

  // "canManage" — mevcut sidebar mantığıyla BİREBİR (`home.tsx` `canManage`, `GuildMenuSheet` /
  // `ChannelMenuSheet` "Kanalı Düzenle"/"Davet Et" gating'i).
  //
  // 🔴 Sprint R20 (§0.1, PM talimatı 2026-08-11) — eskiden üye listesinden çözülen enum'a
  // (`me?.role === 'OWNER' || me?.role === 'ADMIN'`) bakıyordu; enum-ADMIN katmanı kalktığı için
  // `home.tsx`teki AYNI çeviri burada da uygulandı: `useGuildPermission(guildId, 'ADMINISTRATOR')`
  // (sahiplik + ADMINISTRATOR bayrağı, hook'un kendi hesabı). Gerekçe aynı: tek bayrak birden fazla
  // eylemi (Düzenle/Davet Et) birlikte gösterip gizliyor, granüler bir izne daraltmak davranışı
  // değiştirirdi.
  const canManage = useGuildPermission(guildId, 'ADMINISTRATOR');

  const muted = useNotificationPrefsStore((s) => s.isMuted(NotifTargetType.CHANNEL, channelId));

  // Sözleşme §4.2 — M2b'nin süre seçicisi (`SelectSheet` + `notifPrefUi`), `ChannelMenuHost`taki
  // mute akışıyla AYNI mantık (bkz. components/home/ChannelMenuHost.tsx). O bileşen kendisi
  // BURADA reuse edilmedi çünkü `ChannelMenuSheet`in tüm menüsüne bağlı; yalnız state-mantığı
  // (iyimser yaz, hata sessiz yut) tekrarlandı — sözleşme zaten yalnız `SelectSheet`+`notifPrefUi`yi
  // adlandırıyor.
  function onMutePress() {
    if (muted) {
      void useNotificationPrefsStore
        .getState()
        .setPref({ targetType: NotifTargetType.CHANNEL, targetId: channelId, muted: false, mutedUntil: null })
        .catch(() => {});
      return;
    }
    setMuteSheetOpen(true);
  }

  function onMuteDurationSelect(value: string) {
    const minutes = muteMinutesFromValue(value);
    const nextMutedUntil = minutes === null ? null : new Date(Date.now() + minutes * 60_000).toISOString();
    void useNotificationPrefsStore
      .getState()
      .setPref({ targetType: NotifTargetType.CHANNEL, targetId: channelId, muted: true, mutedUntil: nextMutedUntil })
      .catch(() => {});
    setMuteSheetOpen(false);
  }

  /** Medya/Bağlantılar/Dosyalar/Sabitlemeler sekmelerinden ortak "mesaja git" — kanal ekranını
   *  `jumpTo` ile açar (M1g R1'deki aynı yol). `guildId` burada HER ZAMAN mevcut (bu ekran zaten
   *  guildId olmadan açılamıyor), bu yüzden kanal ekranındaki başlık chevron'u da bu yoldan
   *  dönüldüğünde çalışır. */
  function openMessage(messageId: string) {
    router.push({
      pathname: '/channel/[id]',
      params: { id: channelId, name: channel?.name ?? '', guildId, jumpTo: messageId },
    });
  }

  if (!channelId || !guildId) return null;

  return (
    // R2 §A — üst pay gerçek inset'ten; header kalktığı için durum çubuğunun altına giriyoruz.
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      {/* 🔴 R2 §A (sahip turu 2026-08-04) — native header TAMAMEN kapalı. M2c'de başlık buraya
          taşınmıştı çünkü "boş şerit + ekran içi başlık" ölü alan bırakıyordu; sahip teşhisi
          sorunun şeridin BOŞ olması olduğunu gösterdi, yani semptom tedavi edilmişti. Şerit
          gidince başlık `ChannelDetailsHeader`daki kendi yerine döndü. Global `screenOptions`a
          dokunulmadı — içi dolu header'ı olan ~40 ekran aynen duruyor. */}
      <Stack.Screen options={{ headerShown: false }} />

      {channelState === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {channelState === 'error' && (
        <View style={styles.center}>
          <Text style={styles.error}>{channelError}</Text>
          <Pressable onPress={loadChannel} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      )}

      {channelState === 'ready' && channel && (
        <>
          <ChannelDetailsHeader
            channel={channel}
            muted={muted}
            canManage={canManage}
            onSearch={() =>
              router.push({
                pathname: '/guild-search',
                params: { guildId, channelId, channelName: channel.name ?? '' },
              })
            }
            onMute={onMutePress}
            onSettings={() =>
              router.push({
                pathname: '/channel-edit',
                params: {
                  id: channel.id,
                  name: channel.name ?? '',
                  ageGated: String(channel.ageGated),
                  isPrivate: String(channel.isPrivate),
                  slowModeSeconds: String(channel.slowModeSeconds),
                  categoryId: channel.categoryId ?? '',
                  guildId,
                  // M4g §3 — fail-closed savunması bu taşımaya bağlı.
                  type: channel.type,
                  userLimit: String(channel.userLimit),
                  bitrate: String(channel.bitrate),
                  mediaEnabled: String(channel.mediaEnabled),
                },
              })
            }
          />

          <ChannelDetailsTabBar
            active={tab}
            onChange={setTab}
            tabs={[
              { key: 'members', label: t('mobile.channelDetails.tabMembers') },
              { key: 'media', label: t('mobile.channelDetails.tabMedia') },
              { key: 'pins', label: t('mobile.channelDetails.tabPins') },
              { key: 'links', label: t('mobile.channelDetails.tabLinks') },
              { key: 'files', label: t('mobile.channelDetails.tabFiles') },
            ]}
          />

          <View style={styles.tabBody}>
            {tab === 'members' && (
              <ChannelMembersTab
                members={members}
                state={membersState}
                errorMessage={membersError}
                onRetry={loadMembers}
                canInvite={canManage}
                onInvite={() => router.push({ pathname: '/guild-invite', params: { id: guildId } })}
                onOpenMember={(userId, username) =>
                  router.push({ pathname: '/guild-member', params: { guildId, userId, name: username } })
                }
              />
            )}
            {/* M3b §5.1 — üç sekme artık kanal kapsamlı arama ucuna gidiyor; `guildId` prop'u
                düştü. Sonuç kümesi DEĞİŞMEMELİ: eski çağrı da `in=<channelId>` ile tek kanala
                daraltılmıştı, erişim kapısı ikisinde de sunucuda. */}
            {tab === 'media' && <ChannelMediaTab channelId={channelId} onOpenMessage={openMessage} />}
            {tab === 'pins' && (
              <PinnedMessagesList channelId={channelId} onOpenMessage={(m) => openMessage(m.id)} />
            )}
            {tab === 'links' && <ChannelLinksTab channelId={channelId} onOpenMessage={openMessage} />}
            {tab === 'files' && <ChannelFilesTab channelId={channelId} onOpenMessage={openMessage} />}
          </View>
        </>
      )}

      {muteSheetOpen && (
        <SelectSheet
          title={t('mobile.channelDetails.muteAction')}
          options={getMuteDurationOptions()}
          selected=""
          onSelect={onMuteDurationSelect}
          onClose={() => setMuteSheetOpen(false)}
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
    paddingHorizontal: theme.layout.panelGap * 1.5,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginBottom: theme.layout.panelGap,
  },
  retryButton: {
    minHeight: theme.layout.control,
    paddingHorizontal: theme.layout.panelGap,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.sm, fontWeight: '600' },
  tabBody: { flex: 1 },
});
