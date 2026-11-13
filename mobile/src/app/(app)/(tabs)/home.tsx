import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useGuildSyncStore } from '@/stores/guildSync';
import { guildsApi, type GuildSummaryDto } from '@/api/guilds';
import type { ChannelSummaryDto } from '@/api/channels';
import type { DmChannelDto } from '@/api/dm';
import { DmMenuHost } from '@/components/home/DmMenuHost';
import { EmailVerificationBanner } from '@/components/EmailVerificationBanner';
import { AppUpdateBanner } from '@/components/AppUpdateBanner';
import { GuildRail, type RailSelection } from '@/components/home/GuildRail';
import { DmSidebar } from '@/components/home/DmSidebar';
import { ChannelSidebar } from '@/components/home/ChannelSidebar';
import { GuildMenuSheet } from '@/components/home/GuildMenuSheet';
import { SuggestedGuilds } from '@/components/discover/SuggestedGuilds';
import { AddGuildSheet } from '@/components/home/AddGuildSheet';
import { ChannelMenuHost } from '@/components/home/ChannelMenuHost';
import { CategoryMenuSheet } from '@/components/home/CategoryMenuSheet';
import { VoiceChannelSheet } from '@/components/home/VoiceChannelSheet';
import type { CategoryDto } from '@/api/categories';
import { channelsApi, ChannelType } from '@/api/channels';
import { useUnreadStore } from '@/stores/unread';
import { useVoiceStore } from '@/stores/voice';
import { useGuildPermission } from '@/hooks/useGuildPermission';
import { dmRouteParams } from '@/utils/dmRoute';
import { clearLast, getGuildChannelMap, setLastToGuild, takePendingTarget, takeResumedGuild } from '@/utils/resumeLastScreen';
import { useAuthStore } from '@/stores/auth';
import { useReportStore } from '@/stores/report';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1a contract §2 — Ana Sayfa (rail + sidebar), tek ekran, kalıcı. Bu dosya SADECE compose
// eder (web/CLAUDE.md "view sadece compose eder" ilkesi mobilde de izlendi); veri çekme/render
// mantığı GuildRail/DmSidebar/ChannelSidebar'a dağılmış durumda.
export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ joinedGuildId?: string; refreshGuilds?: string }>();
  // C38 — soğuk açılışta son sohbet bir ortam kanalıysa ana ekran o ortam seçili açılır (geri tuşuyla
  // dönülen yer); aksi halde bugünkü gibi DM. Değer `app/index.tsx` doğrulamasından geçmiştir.
  const [selection, setSelection] = useState<RailSelection>(() => {
    const resumed = takeResumedGuild();
    return resumed ? { type: 'guild', id: resumed } : { type: 'dm' };
  });

  // C38 §2.3 — ortam başına son açılan kanal (vurgu için; OTOMATİK AÇILMAZ). Eskiden tek bir
  // "son açılan kanal" vardı, ortam değişince kayboluyordu; artık kalıcı harita.
  const myUserId = useAuthStore((s) => s.user?.id);
  const emailUnverified = useAuthStore((s) => s.user?.emailVerified === false);
  const [lastChannelByGuild, setLastChannelByGuild] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!myUserId) return;
    void getGuildChannelMap(myUserId).then((map) => setLastChannelByGuild((cur) => ({ ...map, ...cur })));
  }, [myUserId]);

  const [guildState, setGuildState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [guilds, setGuilds] = useState<GuildSummaryDto[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  // §4 (M5c, PM revizesi) — uzun basılan ortam. `menuChannel`/`menuDm` ile AYNI desen: panel
  // `selection`dan BAĞIMSIZ kendi hedefini taşır, uzun basış rail'in mevcut seçimini DEĞİŞTİRMEZ.
  // İlk sürüm `setSelection`i de çağırıyordu (kanal paneli de o ortama atlıyordu) — sahip bunu
  // reddetti: uzun basışın amacı "hangi ortamdayım" karışıklığını gidermek, kullanıcıyı
  // bulunduğu yerden habersizce koparmak değil (Discord referansı da böyle: uzun basış yalnız
  // menü açar, ortam değiştirmez).
  const [menuGuildId, setMenuGuildId] = useState<string | null>(null);
  // Uzun basılan kanal — panel bunun üzerinden açılır (sahip revizesi: uzun basış doğrudan
  // düzenleme ekranına atlamıyor, önce "ne yapabilirim" panelini gösteriyor).
  const [menuChannel, setMenuChannel] = useState<ChannelSummaryDto | null>(null);
  const [menuCategory, setMenuCategory] = useState<CategoryDto | null>(null);
  // M1d-C §2.3 — uzun basılan DM. Panel LİSTEDEN açılır; sohbetin içinden değil (orada başlığa
  // dokunmak DM detay ekranını açar — M3b §2.1). Panelin İÇ akışı `DmMenuHost`ta — bu ekran yalnız
  // "hangi DM" bilgisini tutar.
  const [menuDm, setMenuDm] = useState<DmChannelDto | null>(null);

  // Sprint M4c §3 — ses kanalına katılma sürüyorken ikinci dokunuşu yutar (`dm/[id].tsx`
  // `callBusy` ile aynı desen).
  const [voiceJoining, setVoiceJoining] = useState(false);
  // Sprint M4z §B (D48) — dokunulan ses kanalı; null ise ara panel kapalı. Panel açık olmak
  // katılım DEĞİLDİR: odaya yalnız panelin "Sese Katıl" düğmesi sokar.
  const [voiceSheetChannel, setVoiceSheetChannel] = useState<ChannelSummaryDto | null>(null);

  // react-hooks/set-state-in-effect: effect gövdesi setState'i SENKRON çağırmaz (ilk değer zaten
  // 'loading') — yalnız fetch'i başlatır, sonuç .then/.catch'te (asenkron) yazılır. "Tekrar dene"
  // butonu effect DIŞINDA (Pressable onPress) 'loading'i senkron set edip fetch'i tetikler.
  const fetchGuilds = useCallback(() => {
    guildsApi
      .list()
      .then((list) => {
        setGuilds(list);
        // Sprint M2a §5 — rail pip/bahsetme rozetinin İLK hydrate kaynağı.
        useUnreadStore.getState().hydrateGuilds(list);
        setGuildState('ready');
      })
      .catch(() => setGuildState('error'));
  }, []);

  useEffect(() => {
    fetchGuilds();
  }, [fetchGuilds]);

  // 🔴 Odaklanmada da tazele (sahip bulgusu 2026-08-01): ortam simgesi Ayarlar'dan değiştirilince
  // ray eski ikonu göstermeye devam ediyordu. Bu ekran bir SEKME, yani oturum boyunca mount'lu
  // kalıyor; `useEffect(..., [])` bir kez çalışıp bir daha çalışmıyor. Ayarlar ekranı ad/ikon/afiş
  // değiştirebildiği için parametreyle haber vermek yetmez (hangi alanın değiştiğini bilmek
  // gerekirdi) — odaklanmada tazelemek doğru çözüm. Bildirimler sekmesindeki (M1d-0 R1-b) aynı ders.
  useFocusEffect(fetchGuilds);

  // C38 — ana ekran odaktayken son sohbet: DM listesi görünümünde yok (DM geri yüklenmez), ortam
  // kanal listesi görünümünde o ortamın son kanalı. Kanal ekranı açılınca kendi kaydını yazar.
  const selectionGuildId = selection.type === 'guild' ? selection.id : null;
  useFocusEffect(
    useCallback(() => {
      if (!myUserId) return;
      if (selectionGuildId) void setLastToGuild(myUserId, selectionGuildId);
      else void clearLast(myUserId);
    }, [myUserId, selectionGuildId]),
  );

  // C38 — soğuk açılışta Index'in çözdüğü son sohbet: ana ekran odaklandığında (navigasyon hazır)
  // bir kez push edilir; geri tuşu bu ekrana döner. Bildirim/derin bağlantı yolunda hedef yoktur.
  useFocusEffect(
    useCallback(() => {
      const target = takePendingTarget();
      if (!target) return;
      console.log('[resume] push from home');
      router.push(target);
    }, [router]),
  );

  // Katılma/kurma ekranları buraya parametreyle döner (sözleşme §6: ray tazelenir, yeni store yok).
  // `joinedGuildId` → listeyi tazele + o ortamı seç. `refreshGuilds` → yalnız tazele (ALREADY_MEMBER
  // yolu; sunucu o durumda ortam kimliği dönmüyor, kullanıcı zaten üye olduğu için liste yeter).
  // Parametre işlendikten sonra TEMİZLENİR — aksi hâlde ekrana her dönüşte yeniden tetiklenirdi.
  useEffect(() => {
    if (!params.joinedGuildId && !params.refreshGuilds) return;
    const joinedId = params.joinedGuildId;
    fetchGuilds();
    if (joinedId) setSelection({ type: 'guild', id: joinedId });
    router.setParams({ joinedGuildId: undefined, refreshGuilds: undefined });
  }, [params.joinedGuildId, params.refreshGuilds, fetchGuilds, router]);

  // C62 §5 — soket: `guild.joined` listeyi tazeler; atılan/ayrılan bensem ortam yerelden düşer ve
  // seçiliyse DM görünümüne dönülür (ortam ekranlarını `(app)/_layout.tsx` kapatır).
  const refreshTick = useGuildSyncStore((s) => s.refreshTick);
  const removed = useGuildSyncStore((s) => s.removed);
  useEffect(() => {
    if (refreshTick > 0) fetchGuilds();
  }, [refreshTick, fetchGuilds]);
  useEffect(() => {
    if (!removed) return;
    setGuilds((cur) => cur.filter((g) => g.id !== removed.guildId));
    setSelection((cur) => (cur.type === 'guild' && cur.id === removed.guildId ? { type: 'dm' } : cur));
  }, [removed]);

  function retryGuilds() {
    setGuildState('loading');
    fetchGuilds();
  }

  function openAdd(target: '/join-guild' | '/new-guild') {
    setAddOpen(false);
    router.push(target);
  }

  const selectedGuild = useMemo(() => {
    if (selection.type !== 'guild') return null;
    return guilds.find((g) => g.id === selection.id) ?? null;
  }, [guilds, selection]);
  const selectedGuildName = selectedGuild?.name ?? '';
  const selectedGuildId = selection.type === 'guild' ? selection.id : null;

  // Davet üretme + ortam yönetimi yetkisi (sözleşme §2.4). Yetkisize düğme **hiç render edilmez**
  // (disabled gösterilmez — M1b grup yönetimi deseni). Sunucu da aynı kapıyı tutuyor (403);
  // buradaki kontrol yalnız UX.
  //
  // 🔴 Sprint R20 (§0.1) — eskiden `myRoleByGuild` enum'una (`role === 'OWNER' || role === 'ADMIN'`)
  // bakıyordu; enum-ADMIN katmanı kaldırıldığı için bu kısa devre `useGuildPermission`e devredildi
  // (sahiplik + `ADMINISTRATOR` bayrağı — hook'un kendi hesabı, bkz. `hooks/useGuildPermission.ts`).
  // `permission` olarak BİLİNÇLİ `'ADMINISTRATOR'` verildi: hook zaten `granted.has('ADMINISTRATOR')`u
  // ayrıca kontrol ediyor, yani bu çağrı saf hâliyle "sahiplik VEYA ADMINISTRATOR bayrağı" anlamına
  // gelir — eski OWNER/ADMIN ikilisinin BİREBİR karşılığı. Menüdeki tek tek eylemler (davet/kanal
  // oluştur/kategori oluştur/bildirim) MANAGE_GUILD/MANAGE_CHANNELS/CREATE_INVITE gibi farklı
  // granüler bayraklara ayrılabilirdi ama `canManage` tek bir bayrak olarak tüketiliyor (aynı sheet
  // içinde birden çok eylemi gösterip gizliyor) — daha ince taneli bir ayrım bu ekranın mevcut
  // tasarımını değiştirir, sözleşme bunu istemiyor.
  //
  // ⚠️ İki ayrı ortam için İKİ hook çağrısı (seçili + uzun basılan menü) — sözleşmenin izin verdiği
  // kadar; üçüncü bir çağrı YOK.
  const canManage = useGuildPermission(selectedGuildId, 'ADMINISTRATOR');

  // §4 (M5c, PM revizesi) — uzun basılan ortamın kendi verisi, `selection`dan bağımsız (rail'de
  // seçili OLMAYAN bir ortama uzun basılabilir). `selectedGuild`/`canManage` ile aynı hesap,
  // yalnız `menuGuildId` üzerinden — iki kullanım (Rule of Three: üçüncüde çıkar, ikide bekle).
  const menuGuild = useMemo(
    () => guilds.find((g) => g.id === menuGuildId) ?? null,
    [guilds, menuGuildId],
  );
  const menuGuildName = menuGuild?.name ?? '';
  const menuGuildCanManage = useGuildPermission(menuGuildId, 'ADMINISTRATOR');

  /**
   * Sprint M2a §4.5 — dolaşma deseni web `useGuildMenuActions.ts` `markGuildRead`'in birebir aynısı:
   * yalnız `unreadCount > 0 || unreadMentionCount > 0` olan kanallara `markRead`, hata SESSİZ (biri
   * düşse diğerleri denenir). İşlem bitince yerel `unread` store'u da her kanal için temizlenir —
   * bugünkü eksik tam buydu (sunucuya gidiyordu, ekranda rozet kalıyordu).
   */
  async function markChannelsRead(channelList: ChannelSummaryDto[], guildId: string) {
    for (const c of channelList) {
      if (c.unreadCount > 0 || c.unreadMentionCount > 0) {
        try {
          await channelsApi.markRead(c.id);
        } catch {
          // sessiz — bir kanal düşse diğerleri denenir
        }
        useUnreadStore.getState().clearChannel(c.id, guildId);
      }
    }
  }

  /** Ortam paneli §4.5 — "Okundu İşaretle" (web menüsünün 1. maddesi). Taze liste çekilir: bu
   *  ekranın kendi state'i yok merkezi bir kanal store'u (M1d bilinçli kararı), tek tüketicili
   *  bir bulk-aksiyon için store lift etmek erken soyutlama olurdu. */
  async function markGuildRead(guildId: string) {
    try {
      const list = await channelsApi.listByGuild(guildId);
      await markChannelsRead(
        list.filter((c) => c.type === ChannelType.GUILD_TEXT),
        guildId,
      );
    } catch {
      // sessiz — okundu işaretleme kritik değil
    }
  }

  /** Kategori paneli §4.5 — yalnız o kategorinin kanallarını dolaşır. */
  async function markCategoryRead(guildId: string, categoryId: string) {
    try {
      const list = await channelsApi.listByGuild(guildId);
      await markChannelsRead(
        list.filter((c) => c.type === ChannelType.GUILD_TEXT && c.categoryId === categoryId),
        guildId,
      );
    } catch {
      // sessiz
    }
  }

  // Sprint M4c §8 — item 6 pariteti (web `ChannelPanel.vue` `selectChannel`): kilitli özel kanal
  // HERKESE görünür ama giriş yok — sessizce yutmak yerine Türkçe uyarı (T&S, R7 "sessizce
  // gizleme yok"). Metin/ses ikisi için de geçerli; `openChannel` tek giriş noktası olduğu için tek yerde.
  function openChannel(channel: ChannelSummaryDto) {
    if (channel.locked) {
      Alert.alert(t('channel.lockedToast'));
      return;
    }
    // Sprint M4z §B (D48) — ses kanalı satırına dokunma artık ARA PANEL açar, odaya girmez.
    // M4c §2'de doğrudan katılımdı (web pariteti); mobilde yanlışlıkla dokunup sese düşmek çok
    // kolaydı ve girmeden kimin içeride olduğu görünmüyordu. Katılım bir dokunuş daha derinde.
    if (channel.type === ChannelType.GUILD_VOICE) {
      setVoiceSheetChannel(channel);
      return;
    }
    // Sözleşme §8.1-A/1 — vurgu için "en son açılan kanal" burada tutulur (ChannelSidebar ortam
    // değişiminde remount olduğu için kendi içinde tutamaz; ayrıca kanal ekranı ayrı bir route).
    if (channel.guildId) setLastChannelByGuild((cur) => ({ ...cur, [channel.guildId as string]: channel.id }));
    // `guildId` M1h ile eklendi: kanal ekranı sabitleme yetkisini (MANAGE_MESSAGES) bunun
    // üzerinden hesaplıyor. Kanal nesnesi zaten taşıyor, ek istek yok.
    router.push({
      pathname: '/channel/[id]',
      params: { id: channel.id, name: channel.name ?? '', guildId: channel.guildId ?? '' },
    });
  }

  // Sprint M4c §3 — davetsiz katılım (`kind: 'guild'`, bkz. `stores/voice.ts` `startOrJoin` yorumu).
  // `dm/[id].tsx` `handleCallPress` ile AYNI izin/hata deseni (mic_denied → "Ayarları Aç"); tek
  // fark davet yok, `label` DM'deki karşı ad yerine kanal adı (bildirim gövdesi §3).
  //
  // 🔴 PM takibi (2026-08-07) — `/call`a `kind`/`channelName`/`guildName` route parametresi olarak
  // ARTIK GEÇİLMİYOR: `MiniCallWindow`'un kendi push'u bunları hiç taşımıyordu ve ekran DM moduna
  // düşüyordu (sahip cihaz bulgusu). Otorite artık `stores/voice.ts` (`startOrJoin` bu bilgiyi
  // duruma yazıyor) — `/call` hangi yoldan açılırsa açılsın aynı gerçeği okur. Bu ekran yalnız
  // `channelId`i taşır (o zaten tekil ve tartışmasız).
  //
  // Sprint M4z §B (D48) — çağıran artık satır değil, ara panelin "Sese Katıl" düğmesi. Akışın
  // KENDİSİ değişmedi (`kind: 'guild'`, aynı izin/hata deseni); yalnız panel başarı yolunda
  // kapatılır. Hata yolunda panel AÇIK kalır: kullanıcı uyarıyı okuyup aynı yerden tekrar dener.
  async function joinVoiceChannel(channel: ChannelSummaryDto) {
    if (voiceJoining) return;
    if (useVoiceStore.getState().connectedChannelId === channel.id) {
      setVoiceSheetChannel(null);
      router.push({ pathname: '/call', params: { channelId: channel.id } });
      return;
    }
    setVoiceJoining(true);
    // Sprint M4t §2 — C7 nudge kapısı: yalnız kanal `ageGated` değilken VE ortam `adultsOnly`
    // değilken kamera uyarısı sorulacak (bkz. `stores/voice.ts` `isGeneralVoiceChannel` yorumu).
    // Hesap yalnız BURADA yapılabilir: `ChannelSummaryDto.ageGated` + `GuildSummaryDto.adultsOnly`
    // ikisi de bu closure'da hazır, `startOrJoin` sonrasında (call.tsx'te) elde YOK.
    const isGeneralVoiceChannel = !channel.ageGated && !(selectedGuild?.adultsOnly ?? false);
    const res = await useVoiceStore.getState().startOrJoin(channel.id, channel.name ?? '', {
      kind: 'guild',
      guildName: selectedGuildName,
      // Sprint M4h §1 — moderasyon sheet'inin (call.tsx) `useGuildPermission`/`channelsApi.listByGuild`
      // için ihtiyaç duyduğu id; `channel.guildId` zaten elde (ekstra istek yok).
      guildId: channel.guildId,
      isGeneralVoiceChannel,
    });
    setVoiceJoining(false);
    if (res.ok) {
      setVoiceSheetChannel(null);
      router.push({ pathname: '/call', params: { channelId: channel.id } });
      return;
    }
    if (res.reason === 'mic_denied') {
      Alert.alert(res.message ?? t('common.error'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('mobile.call.micPermissionSettings'), onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    if (res.message) Alert.alert(res.message);
  }

  function openDm(channel: DmChannelDto) {
    router.push(dmRouteParams(channel));
  }

  return (
    // PM bulgusu #2: rail/sidebar başlıkları durum çubuğunun altına giriyordu (mesaj ekranı native
    // Stack başlığı sayesinde güvende, bu ekranın headerShown:false — kendi üst inset'ini vermesi
    // gerekiyor). me.tsx/notifications.tsx ile aynı desen: SafeAreaView edges=['top'].
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Doğrulanmamış hesaba her açılışta görünen şerit (web AppShell karşılığı); rail+panelin üstünde, tam genişlik. */}
      {emailUnverified ? <EmailVerificationBanner /> : null}
      <AppUpdateBanner />
      <View style={styles.row}>
      <GuildRail
        selection={selection}
        guilds={guilds}
        state={guildState}
        onRetry={retryGuilds}
        onSelectDm={() => setSelection({ type: 'dm' })}
        onSelectGuild={(id) => setSelection({ type: 'guild', id })}
        // §4 (M5c, PM revizesi) — uzun basış YALNIZ `menuGuildId`'yi set eder, `setSelection`
        // ÇAĞRILMAZ: kısa basış davranışı ve rail'in seçimi bundan etkilenmez.
        onLongPressGuild={(id) => setMenuGuildId(id)}
        onAddGuild={() => setAddOpen(true)}
        onDiscover={() => router.push('/discover')}
      />
      {selection.type === 'dm' ? (
        <View style={styles.dmPane}>
          <DmSidebar
            onOpenDm={openDm}
            onDmMenu={(c) => setMenuDm(c)}
            onOpenRequests={() => router.push('/dm-requests')}
            onOpenSearch={() => router.push('/search')}
            onOpenAddFriend={() => router.push('/friends-add')}
            // Sprint C18 — yalnız ortamı olmayan kullanıcıya. `guildState === 'ready'` şartı: liste
            // yüklenirken (ya da hata verdiyse) "ortamın yok" yanlış okunup blok flaş etmesin.
            welcome={guildState === 'ready' && guilds.length === 0 ? <SuggestedGuilds /> : null}
          />
          {/* Sözleşme §13/1 — FAB, eski "Mesajlar" başlığı yanındaki "+"nın yerini alıyor (o
              DmSidebar'dan kaldırıldı). Kor dolgu, gölge YOK (web/CLAUDE.md tasarım sistemi: katman
              ayrımı ton+kenarlık ile, gölge yok) — daire arka planla zaten ayrışıyor.
              R3 revizyonu — `Ionicons`'ta baloncuk+artı bileşik glifi yok; `MaterialCommunityIcons`
              `message-plus` bunu tek glif veriyor ve `@expo/vector-icons` seti zaten paketliyor
              (yeni bağımlılık yok). */}
          <Pressable
            onPress={() => router.push('/new-message')}
            style={styles.fab}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.newMessage.title')}
            hitSlop={8}
          >
            <MaterialCommunityIcons name="message-plus" size={24} color={theme.colors.textPrimary} />
          </Pressable>
        </View>
      ) : (
        // key: ortam değişince sidebar TAM yeniden mount olur (state 'loading'a resetlenir —
        // aksi halde guildId değişince önceki ortamın kanal listesi kısa süre ekranda kalırdı).
        <ChannelSidebar
          key={selection.id}
          guildId={selection.id}
          guildName={selectedGuildName}
          selectedChannelId={lastChannelByGuild[selection.id]}
          onOpenChannel={openChannel}
          guildBannerUrl={selectedGuild?.bannerUrl}
          guildBannerAnimatedUrl={selectedGuild?.bannerAnimatedUrl}
          // §4 (M5c) — panel artık `menuGuildId` üzerinden çalışıyor (rail uzun basışıyla PAYLAŞILAN
          // aynı state); burada `selection` zaten 'guild' (bu dal yalnız o zaman render edilir).
          onOpenGuildMenu={() => setMenuGuildId(selection.id)}
          onEditChannel={(c) => setMenuChannel(c)}
          onEditCategory={(c) => setMenuCategory(c)}
          // Sprint M1g §2.1 — şerit aksiyonları. Davet MEVCUT ekrana gider (ortam panelindeki
          // "Davet Et" ile aynı varış); şerit yeni bir yol açmıyor, kısayol veriyor.
          onOpenSearch={() =>
            router.push({ pathname: '/guild-search', params: { guildId: selection.id } })
          }
          onInvite={() =>
            router.push({
              pathname: '/guild-invite',
              params: { id: selection.id, name: selectedGuildName },
            })
          }
          // Sprint M1j — şeridin üçüncü aksiyonu: ortam etkinlikleri.
          onOpenEvents={() =>
            router.push({ pathname: '/guild-events', params: { guildId: selection.id } })
          }
        />
      )}
      </View>

      <CategoryMenuSheet
        visible={!!menuCategory}
        categoryName={menuCategory?.name ?? ''}
        canManage={canManage}
        onClose={() => setMenuCategory(null)}
        onMarkRead={() => {
          const c = menuCategory;
          setMenuCategory(null);
          if (c && selection.type === 'guild') void markCategoryRead(selection.id, c.id);
        }}
        onEdit={() => {
          const c = menuCategory;
          setMenuCategory(null);
          if (c && selection.type === 'guild')
            router.push({
              pathname: '/category-edit',
              params: { guildId: selection.id, id: c.id, name: c.name },
            });
        }}
        onCreateChannel={() => {
          const c = menuCategory;
          setMenuCategory(null);
          // Kategoriye kanal ekleme yolu BURADA açılıyor — `channel-new` bu parametreyi baştan
          // alıyordu ama geçen bir giriş yoktu (sahip bulgusu).
          if (c && selection.type === 'guild')
            router.push({
              pathname: '/channel-new',
              params: { guildId: selection.id, categoryId: c.id },
            });
        }}
      />

      <ChannelMenuHost
        channel={menuChannel}
        guildId={selection.type === 'guild' ? selection.id : ''}
        guildName={selectedGuildName}
        guildIconUrl={selectedGuild?.iconUrl}
        canManage={canManage}
        onClose={() => setMenuChannel(null)}
        onMarkRead={(c) => {
          // Hata sessiz: okundu işaretleme kritik değil, kullanıcıyı hata ekranıyla durdurmaya değmez.
          void channelsApi.markRead(c.id).catch(() => {});
          // Sözleşme §4.5 — yerel rozet de anında temizlenir (bugünkü eksik: sunucuya gidiyordu,
          // ekranda rozet kalıyordu).
          if (c.guildId) useUnreadStore.getState().clearChannel(c.id, c.guildId);
        }}
        onEdit={(c) => {
          router.push({
            pathname: '/channel-edit',
            params: {
              id: c.id,
              name: c.name ?? '',
              ageGated: String(c.ageGated),
              // 🔴 PM düzeltmesi (2026-08-08) — bu üçü BURADAN HİÇ TAŞINMIYORDU ve `channel-edit`
              // onları koşulsuz gönderdiği için ana ekrandan kaydetmek özel kanalı herkese açıyor,
              // yavaş modu sıfırlıyor, kanalı kategorisinden düşürüyordu. Ekran tarafında da kapı
              // kondu (parametre yoksa alan gönderilmez), burada da gerçek değerler taşınıyor.
              isPrivate: String(c.isPrivate),
              slowModeSeconds: String(c.slowModeSeconds),
              categoryId: c.categoryId ?? '',
              // M4g §3 — `type` taşınmazsa `channel-edit` ses alanlarını fail-closed'a düşürür;
              // bu satır o düşüşü önler.
              type: c.type,
              userLimit: String(c.userLimit),
              bitrate: String(c.bitrate),
              mediaEnabled: String(c.mediaEnabled),
              readOnly: String(c.readOnly),
            },
          });
        }}
      />

      {/* §4 (M5c, PM revizesi) — `selection`dan bağımsız: `menuGuildId` rail'de seçili olmayan bir
          ortam olabilir (uzun basış onu değiştirmiyor). Tüm eylemler `menuGuildId`den türetilir. */}
      <GuildMenuSheet
        visible={!!menuGuildId}
        guildName={menuGuildName}
        guildIconUrl={menuGuild?.iconUrl}
        guildDescription={menuGuild?.description}
        canManage={menuGuildCanManage}
        // E4 §4.1 — kendi ortamını şikâyet edemezsin (web ChannelPanel `!isOwner`).
        canReport={!!menuGuild && menuGuild.ownerId !== myUserId}
        onReport={() => {
          const id = menuGuildId;
          setMenuGuildId(null);
          if (id) useReportStore.getState().openReport({ targetType: 'GUILD', targetId: id });
        }}
        onClose={() => setMenuGuildId(null)}
        onMarkRead={() => {
          const id = menuGuildId;
          setMenuGuildId(null);
          if (id) void markGuildRead(id);
        }}
        onInvite={() => {
          const id = menuGuildId;
          setMenuGuildId(null);
          if (id) router.push({ pathname: '/guild-invite', params: { id, name: menuGuildName } });
        }}
        onSettings={() => {
          const id = menuGuildId;
          setMenuGuildId(null);
          if (id) router.push({ pathname: '/guild-settings', params: { id, name: menuGuildName } });
        }}
        onCreateChannel={() => {
          const id = menuGuildId;
          setMenuGuildId(null);
          if (id) router.push({ pathname: '/channel-new', params: { guildId: id } });
        }}
        onCreateCategory={() => {
          const id = menuGuildId;
          setMenuGuildId(null);
          if (id) router.push({ pathname: '/category-edit', params: { guildId: id } });
        }}
        onNotifications={() => {
          const id = menuGuildId;
          setMenuGuildId(null);
          if (id)
            router.push({
              pathname: '/guild-notifications',
              params: { guildId: id, guildName: menuGuildName },
            });
        }}
      />

      <DmMenuHost
        channel={menuDm}
        onClose={() => setMenuDm(null)}
        // M3b §2.1 — panelin ilk satırı DM detay ekranına gider (sohbeti açmıyor: sohbet zaten
        // satıra kısa dokunuşla açılıyor, aynı hedefe ikinci kapı gereksizdi).
        onOpenDetails={(c) => router.push({ pathname: '/dm-details', params: { id: c.id } })}
        onAddFriend={() => router.push('/friends-add')}
      />

      {/* Sprint M4z §B (D48) — ses kanalı ara paneli: kanal adı + içerdekiler + Katıl. */}
      <VoiceChannelSheet
        channel={voiceSheetChannel}
        joining={voiceJoining}
        onClose={() => setVoiceSheetChannel(null)}
        onJoin={() => {
          const c = voiceSheetChannel;
          if (c) void joinVoiceChannel(c);
        }}
      />

      <AddGuildSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onCreate={() => openAdd('/new-guild')}
        onJoin={() => openAdd('/join-guild')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  dmPane: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: theme.layout.panelGap,
    bottom: theme.layout.panelGap,
    width: theme.layout.fabSize,
    height: theme.layout.fabSize,
    borderRadius: theme.layout.fabSize / 2,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
