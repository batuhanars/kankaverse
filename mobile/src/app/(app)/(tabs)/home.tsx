import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { guildsApi, type GuildSummaryDto } from '@/api/guilds';
import { useAuthStore } from '@/stores/auth';
import type { ChannelSummaryDto } from '@/api/channels';
import type { DmChannelDto } from '@/api/dm';
import { DmMenuHost } from '@/components/home/DmMenuHost';
import { GuildRail, type RailSelection } from '@/components/home/GuildRail';
import { DmSidebar } from '@/components/home/DmSidebar';
import { ChannelSidebar } from '@/components/home/ChannelSidebar';
import { GuildMenuSheet } from '@/components/home/GuildMenuSheet';
import { AddGuildSheet } from '@/components/home/AddGuildSheet';
import { ChannelMenuSheet } from '@/components/home/ChannelMenuSheet';
import { CategoryMenuSheet } from '@/components/home/CategoryMenuSheet';
import type { CategoryDto } from '@/api/categories';
import { channelsApi } from '@/api/channels';
import { dmRouteParams } from '@/utils/dmRoute';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1a contract §2 — Ana Sayfa (rail + sidebar), tek ekran, kalıcı. Bu dosya SADECE compose
// eder (web/CLAUDE.md "view sadece compose eder" ilkesi mobilde de izlendi); veri çekme/render
// mantığı GuildRail/DmSidebar/ChannelSidebar'a dağılmış durumda.
export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ joinedGuildId?: string; refreshGuilds?: string }>();
  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const [selection, setSelection] = useState<RailSelection>({ type: 'dm' });

  const [lastOpenedChannelId, setLastOpenedChannelId] = useState<string>();

  const [guildState, setGuildState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [guilds, setGuilds] = useState<GuildSummaryDto[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [guildMenuOpen, setGuildMenuOpen] = useState(false);
  // Uzun basılan kanal — panel bunun üzerinden açılır (sahip revizesi: uzun basış doğrudan
  // düzenleme ekranına atlamıyor, önce "ne yapabilirim" panelini gösteriyor).
  const [menuChannel, setMenuChannel] = useState<ChannelSummaryDto | null>(null);
  const [menuCategory, setMenuCategory] = useState<CategoryDto | null>(null);
  // M1d-C §2.3 — uzun basılan DM. Panel LİSTEDEN açılır; sohbetin içinden değil (orada başlığa
  // dokunmak profili açar). Panelin İÇ akışı `DmMenuHost`ta — bu ekran yalnız "hangi DM" bilgisini tutar.
  const [menuDm, setMenuDm] = useState<DmChannelDto | null>(null);

  // Sprint M1d §6 — seçili ortamdaki kendi rolüm. Sunucuda "benim rolüm" diye ayrı bir uç YOK;
  // web de (stores/channels.ts) üye listesini çekip kendini buluyor, mobil aynı yolu izler.
  // **Yeni bir guild store AÇILMADI** (sözleşme §6): bu kayıt yalnız bu ekranın ihtiyacı, tek
  // tüketicisi var. İkinci bir ekran rol bilmek zorunda kalırsa acı gerçektir → dur, PM'e sor.
  const [myRoleByGuild, setMyRoleByGuild] = useState<Record<string, string>>({});

  // react-hooks/set-state-in-effect: effect gövdesi setState'i SENKRON çağırmaz (ilk değer zaten
  // 'loading') — yalnız fetch'i başlatır, sonuç .then/.catch'te (asenkron) yazılır. "Tekrar dene"
  // butonu effect DIŞINDA (Pressable onPress) 'loading'i senkron set edip fetch'i tetikler.
  const fetchGuilds = useCallback(() => {
    guildsApi
      .list()
      .then((list) => {
        setGuilds(list);
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

  // Seçili ortamın rolünü çek (yalnız bir kez ortam başına). Hata SESSİZ: rol öğrenilemezse
  // "Davet Et" görünmez — yetkisiz kullanıcıya düğme göstermektense yetkiliye göstermemek
  // daha az zararlı (fail-closed).
  useEffect(() => {
    if (selection.type !== 'guild' || !myUserId) return;
    const guildId = selection.id;
    if (myRoleByGuild[guildId]) return;
    guildsApi
      .getMembers(guildId)
      .then((members) => {
        const me = members.find((m) => m.userId === myUserId);
        if (me) setMyRoleByGuild((prev) => ({ ...prev, [guildId]: me.role }));
      })
      .catch(() => {
        // sessiz
      });
  }, [selection, myUserId, myRoleByGuild]);

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

  // Davet üretme yetkisi (sözleşme §2.4): OWNER veya ADMIN. OWNER `ownerId`'den anında bilinir,
  // ADMIN için üye listesinden çözülen rol gerekir. Yetkisize düğme **hiç render edilmez**
  // (disabled gösterilmez — M1b grup yönetimi deseni). Sunucu da aynı kapıyı tutuyor (403);
  // buradaki kontrol yalnız UX.
  const canManage = useMemo(() => {
    if (selection.type !== 'guild') return false;
    const guild = guilds.find((g) => g.id === selection.id);
    if (guild && myUserId && guild.ownerId === myUserId) return true;
    const role = myRoleByGuild[selection.id];
    return role === 'OWNER' || role === 'ADMIN';
  }, [guilds, selection, myUserId, myRoleByGuild]);

  function openChannel(channel: ChannelSummaryDto) {
    // Sözleşme §8.1-A/1 — vurgu için "en son açılan kanal" burada tutulur (ChannelSidebar ortam
    // değişiminde remount olduğu için kendi içinde tutamaz; ayrıca kanal ekranı ayrı bir route).
    setLastOpenedChannelId(channel.id);
    // `guildId` M1h ile eklendi: kanal ekranı sabitleme yetkisini (MANAGE_MESSAGES) bunun
    // üzerinden hesaplıyor. Kanal nesnesi zaten taşıyor, ek istek yok.
    router.push({
      pathname: '/channel/[id]',
      params: { id: channel.id, name: channel.name ?? '', guildId: channel.guildId ?? '' },
    });
  }

  function openDm(channel: DmChannelDto) {
    router.push(dmRouteParams(channel));
  }

  return (
    // PM bulgusu #2: rail/sidebar başlıkları durum çubuğunun altına giriyordu (mesaj ekranı native
    // Stack başlığı sayesinde güvende, bu ekranın headerShown:false — kendi üst inset'ini vermesi
    // gerekiyor). me.tsx/notifications.tsx ile aynı desen: SafeAreaView edges=['top'].
    <SafeAreaView style={styles.row} edges={['top']}>
      <GuildRail
        selection={selection}
        guilds={guilds}
        state={guildState}
        onRetry={retryGuilds}
        onSelectDm={() => setSelection({ type: 'dm' })}
        onSelectGuild={(id) => setSelection({ type: 'guild', id })}
        onAddGuild={() => setAddOpen(true)}
      />
      {selection.type === 'dm' ? (
        <View style={styles.dmPane}>
          <DmSidebar
            onOpenDm={openDm}
            onDmMenu={(c) => setMenuDm(c)}
            onOpenRequests={() => router.push('/dm-requests')}
            onOpenSearch={() => router.push('/search')}
            onOpenAddFriend={() => router.push('/friends-add')}
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
          selectedChannelId={lastOpenedChannelId}
          onOpenChannel={openChannel}
          guildBannerUrl={selectedGuild?.bannerUrl}
          onOpenGuildMenu={() => setGuildMenuOpen(true)}
          canManage={canManage}
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

      <CategoryMenuSheet
        visible={!!menuCategory}
        categoryName={menuCategory?.name ?? ''}
        onClose={() => setMenuCategory(null)}
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

      <ChannelMenuSheet
        visible={!!menuChannel}
        channelName={menuChannel?.name ?? ''}
        onClose={() => setMenuChannel(null)}
        onMarkRead={() => {
          const id = menuChannel?.id;
          setMenuChannel(null);
          // Hata sessiz: okundu işaretleme kritik değil, kullanıcıyı hata ekranıyla durdurmaya değmez.
          if (id) void channelsApi.markRead(id).catch(() => {});
        }}
        onEdit={() => {
          const c = menuChannel;
          setMenuChannel(null);
          if (c)
            router.push({
              pathname: '/channel-edit',
              params: { id: c.id, name: c.name ?? '', ageGated: String(c.ageGated) },
            });
        }}
      />

      <GuildMenuSheet
        visible={guildMenuOpen}
        guildName={selectedGuildName}
        guildIconUrl={selectedGuild?.iconUrl}
        canManage={canManage}
        onClose={() => setGuildMenuOpen(false)}
        onInvite={() => {
          setGuildMenuOpen(false);
          if (selection.type === 'guild')
            router.push({
              pathname: '/guild-invite',
              params: { id: selection.id, name: selectedGuildName },
            });
        }}
        onSettings={() => {
          setGuildMenuOpen(false);
          if (selection.type === 'guild')
            router.push({
              pathname: '/guild-settings',
              params: { id: selection.id, name: selectedGuildName },
            });
        }}
        onCreateChannel={() => {
          setGuildMenuOpen(false);
          if (selection.type === 'guild')
            router.push({ pathname: '/channel-new', params: { guildId: selection.id } });
        }}
        onCreateCategory={() => {
          setGuildMenuOpen(false);
          if (selection.type === 'guild')
            router.push({ pathname: '/category-edit', params: { guildId: selection.id } });
        }}
      />

      <DmMenuHost
        channel={menuDm}
        onClose={() => setMenuDm(null)}
        onOpenDm={openDm}
        onAddFriend={() => router.push('/friends-add')}
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
  row: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.colors.bgContent,
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
