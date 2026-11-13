import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useDmStore } from '@/stores/dm';
import { useNotificationPrefsStore } from '@/stores/notificationPrefs';
import { NotifTargetType } from '@/api/notifications';
import { getMuteDurationOptions, muteMinutesFromValue } from '@/utils/notifPrefUi';
import { channelTitle } from '@/utils/channelTitle';
import { MessageSearchModal } from '@/components/MessageSearchModal';
import { SelectSheet } from '@/components/guild/SelectSheet';
import { PinnedMessagesList } from '@/components/guild/PinnedMessagesList';
import { ChannelMediaTab } from '@/components/guild/ChannelMediaTab';
import { ChannelLinksTab } from '@/components/guild/ChannelLinksTab';
import { ChannelFilesTab } from '@/components/guild/ChannelFilesTab';
import { ChannelDetailsTabBar, type ChannelDetailsTab } from '@/components/guild/ChannelDetailsTabBar';
import { DmDetailsHeader } from '@/components/dm/DmDetailsHeader';
import { DmMoreHost } from '@/components/dm/DmMoreHost';
import { GroupMembersTab } from '@/components/dm/GroupMembersTab';
import { ProfileSheet } from '@/components/profile/ProfileSheet';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M3b §2 — **DM detay ekranı**: DM/grup DM başlığına dokununca açılır. M2c'de yapılan kanal
 * detay ekranının DM ikizi. Grup DM'in eski üye listesi ekranı (`group/[id].tsx`) bu ekranın bir
 * SEKMESİNE katlandı ve rotası kaldırıldı (§2.3.1) — grup başlığına dokunmak artık doğrudan üye
 * listesine atmıyor.
 *
 * 🔴 Sekme İÇLERİ kopyalanmadı: Medya/Bağlantılar/Dosyalar/Sabitlemeler M2c bileşenlerinin ta
 * kendisi. Bunu mümkün kılan §5.1'deki uç taşıması (arama artık kanal kapsamlı) — DM'in `guildId`si
 * olmadığı için eski ortam ucu burada çalışamazdı.
 *
 * 🔴 Tek istisna `ChannelMembersTab`: ortam üyesi rol taşır ve o sekme role göre bölümlüyor; grup
 * DM'de rol diye bir şey yok → grup kendi düz sekmesini aldı (`GroupMembersTab`, §2.1 gerekçesi).
 *
 * `channel-details.tsx` AYRI kaldı: başlığı, `canManage` kararı ve Ayarlar/Davet Et düğmeleri
 * tamamen farklı. Ortak olan sekme gövdesi, ortak olmayan kabuk.
 *
 * 🔴 **R2 §A — native header KAPALI** (sahip turu 2026-08-04): şeridin sorunu rengi değil BOŞ
 * olmasıydı; içi dolu olduğu ekranlarda (Ortam Ayarları) ve altında mesaj listesi aktığı için
 * ayrışmanın işe yaradığı sohbet ekranlarında duruyor. Bu yüzden global `screenOptions`a
 * DOKUNULMADI — yalnız bu ekran ve `channel-details.tsx` kendi `headerShown: false`ını veriyor.
 * Header gidince durum çubuğunun altına giriyoruz → üst pay **sabit sayı değil gerçek inset**
 * (`useSafeAreaInsets`; sabit dolgunun cihaza göre kaydığı dersi projede kayıtlı).
 */
export default function DmDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  // Grup ekranının devraldığı desen: kanal ayrı bir uçtan çekilmiyor, `useDmStore` listesinde
  // zaten var (bu ekrana her zaman DM ekranından/listeden geliniyor). Sıfır ek REST çağrısı.
  const channel = useDmStore((s) => s.channels.find((c) => c.id === id));

  const isGroup = channel?.type === 'GROUP_DM';
  // 1-1 DM'de Üyeler sekmesi ÇİZİLMEZ (§2.3): iki kişilik listede gösterecek bir şey yok, sekme
  // çubuğu 4 sekmeyle başlar. Grup DM'de ilk sekme Üyeler.
  const [tab, setTab] = useState<ChannelDetailsTab>(() => (isGroup ? 'members' : 'media'));
  const [searchVisible, setSearchVisible] = useState(false);
  const [muteSheetOpen, setMuteSheetOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // 🔴 R1 §A — 1-1 DM'de başlıktaki kimliğe dokunuş profil panelini açar (T&S: engellemeye giden
  // yolun kapanmaması). Grup DM'de açılmaz, orada yol Üyeler sekmesi.
  const [profileOpen, setProfileOpen] = useState(false);

  const muted = useNotificationPrefsStore((s) => s.isMuted(NotifTargetType.CHANNEL, id ?? ''));

  // C62 — eski grupta detay/üye yönetimi kapalı (sunucu 403): ekran açıkken ayrılma gelirse geri dön.
  const departed = channel?.type === 'GROUP_DM' && !!channel.departed;
  useEffect(() => {
    if (departed) router.back();
  }, [departed, router]);

  const tabs = useMemo(() => {
    const rest: { key: ChannelDetailsTab; label: string }[] = [
      { key: 'media', label: t('mobile.channelDetails.tabMedia') },
      { key: 'pins', label: t('mobile.channelDetails.tabPins') },
      { key: 'links', label: t('mobile.channelDetails.tabLinks') },
      { key: 'files', label: t('mobile.channelDetails.tabFiles') },
    ];
    if (!isGroup) return rest;
    return [{ key: 'members' as const, label: t('mobile.channelDetails.tabMembers') }, ...rest];
  }, [isGroup]);

  if (!id || !channel) {
    // Kanal store'da yoksa (derin link) boş yüzey açmak yerine boş ekran — `group/[id].tsx`in
    // devraldığı davranış. Header burada da kapalı ki iki durum arasında şerit gelip gitmesin.
    return (
      <View style={[styles.flex, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
      </View>
    );
  }

  const title = channelTitle(channel);
  // 1-1 DM'de karşı taraf: hem başlık avatarı hem profil panelinin hedefi (aynı kaynak, tek okuma).
  const otherUser = channel.type === 'DM' ? channel.otherUser : null;
  const activeTab = tabs.some((x) => x.key === tab) ? tab : tabs[0].key;

  // Sustur akışı — `channel-details.tsx`/`DmMenuHost` ile AYNI mantık (iyimser yaz, hata sessiz
  // yut): susturulmuşsa tek dokunuşla açılır, değilse süre seçici gelir.
  function onMutePress() {
    if (muted) {
      void useNotificationPrefsStore
        .getState()
        .setPref({ targetType: NotifTargetType.CHANNEL, targetId: id, muted: false, mutedUntil: null })
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
      .setPref({ targetType: NotifTargetType.CHANNEL, targetId: id, muted: true, mutedUntil: nextMutedUntil })
      .catch(() => {});
    setMuteSheetOpen(false);
  }

  /** Sekmelerden ortak "mesaja git" — DM ekranını `jumpTo` ile açar (kanal detayıyla aynı yol). */
  function openMessage(messageId: string) {
    router.push({ pathname: '/dm/[id]', params: { id, jumpTo: messageId } });
  }

  return (
    // Üst pay gerçek inset'ten (R2 §A) — sabit sayı üç tuşlu/jest ve çentikli/çentiksiz cihazlarda
    // kayar. `SafeAreaView` yerine dolgu: sekme içeriği alt kenara kadar akmaya devam etsin.
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <DmDetailsHeader
        title={title}
        // R2 §B — avatar yalnız 1-1 DM'de. Grup DM başlık-only (kanal detayıyla aynı dil).
        showAvatar={!!otherUser}
        avatarUrl={otherUser?.avatarUrl ?? null}
        muted={muted}
        onMore={() => setMoreOpen(true)}
        // R1 §A — yalnız 1-1 DM'de dokunulabilir kimlik (grupta Üyeler sekmesi zaten var).
        onPressIdentity={otherUser ? () => setProfileOpen(true) : undefined}
        // R1 §B — Ara yalnız grup DM'de. 1-1'de mesaj arama sahip kararıyla kaldırılmıştı
        // (2026-08-01); sohbet ekranındaki `searchable={!isDm}` ile aynı kural, detay ekranı
        // o kararı delmiyor.
        onSearch={isGroup ? () => setSearchVisible(true) : undefined}
        onMute={onMutePress}
      />

      {/* Soğuk açılışta kanal store'a sonradan düşerse başlangıç sekmesi 1-1 varsayımıyla
          seçilmiş olabilir; çubukta olmayan bir sekme aktif görünmesin diye ilk sekmeye düşülür. */}
      <ChannelDetailsTabBar active={activeTab} onChange={setTab} tabs={tabs} />

      <View style={styles.tabBody}>
        {activeTab === 'members' && channel.type === 'GROUP_DM' && <GroupMembersTab channel={channel} />}
        {activeTab === 'media' && <ChannelMediaTab channelId={id} onOpenMessage={openMessage} />}
        {activeTab === 'pins' && (
          <PinnedMessagesList channelId={id} onOpenMessage={(m) => openMessage(m.id)} />
        )}
        {activeTab === 'links' && <ChannelLinksTab channelId={id} onOpenMessage={openMessage} />}
        {activeTab === 'files' && <ChannelFilesTab channelId={id} onOpenMessage={openMessage} />}
      </View>

      <DmMoreHost channel={channel} visible={moreOpen} onClose={() => setMoreOpen(false)} />

      {profileOpen && otherUser && (
        <ProfileSheet
          userId={otherUser.id}
          username={otherUser.username}
          avatarUrl={otherUser.avatarUrl}
          onClose={() => setProfileOpen(false)}
          // Engelleme/kankalıktan çıkarma sonrası DM bayrakları tazelensin — sohbet ekranı
          // `canMessage`/`selfBlocked`'ı store'dan okuyor (geri dönünce giriş kutusu doğru olsun).
          onChanged={() => useDmStore.getState().fetchAll()}
        />
      )}

      {searchVisible && (
        <MessageSearchModal
          channelId={id}
          onClose={() => setSearchVisible(false)}
          onJump={(messageId) => {
            setSearchVisible(false);
            openMessage(messageId);
          }}
        />
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
  tabBody: { flex: 1 },
});
