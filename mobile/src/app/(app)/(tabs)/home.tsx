import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { guildsApi, type GuildSummaryDto } from '@/api/guilds';
import { useAuthStore } from '@/stores/auth';
import type { ChannelSummaryDto } from '@/api/channels';
import type { DmChannelDto } from '@/api/dm';
import { GuildRail, type RailSelection } from '@/components/home/GuildRail';
import { DmSidebar } from '@/components/home/DmSidebar';
import { ChannelSidebar } from '@/components/home/ChannelSidebar';
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

  const selectedGuildName = useMemo(() => {
    if (selection.type !== 'guild') return '';
    return guilds.find((g) => g.id === selection.id)?.name ?? '';
  }, [guilds, selection]);

  // Davet üretme yetkisi (sözleşme §2.4): OWNER veya ADMIN. OWNER `ownerId`'den anında bilinir,
  // ADMIN için üye listesinden çözülen rol gerekir. Yetkisize düğme **hiç render edilmez**
  // (disabled gösterilmez — M1b grup yönetimi deseni). Sunucu da aynı kapıyı tutuyor (403);
  // buradaki kontrol yalnız UX.
  const canInvite = useMemo(() => {
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
    router.push({ pathname: '/channel/[id]', params: { id: channel.id, name: channel.name ?? '' } });
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
            onOpenRequests={() => router.push('/dm-requests')}
            onOpenSearch={() => router.push('/search')}
            onOpenAddFriend={() => router.push('/friends-add')}
          />
          {/* Sözleşme §13/1 — FAB, eski "Mesajlar" başlığı yanındaki "+"nın yerini alıyor (o
              DmSidebar'dan kaldırıldı). Kor dolgu, gölge YOK (web/CLAUDE.md tasarım sistemi: katman
              ayrımı ton+kenarlık ile, gölge yok) — daire arka planla zaten ayrışıyor.
              R3 revizyonu — sahip "iki ikon üst üste" görünümünü fark etti (chatbubble + bindirilmiş
              add rozeti). `Ionicons`'ta baloncuk+artı BİLEŞİK glifi yok (yalnız `chatbubble*`
              varyantları var); `MaterialCommunityIcons` setinde `message-plus` bunu TEK glif olarak
              veriyor. `@expo/vector-icons` bu seti zaten paketliyor — yeni bağımlılık yok, yalnız
              başka bir hazır ikon setinden tek bir isim seçildi. */}
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
          onOpenInvite={
            canInvite
              ? () =>
                  router.push({
                    pathname: '/guild-invite',
                    params: { id: selection.id, name: selectedGuildName },
                  })
              : undefined
          }
        />
      )}

      {/* Web `ServerModal` `choose` adımının mobil karşılığı (sözleşme §3): tek "+" iki seçenek
          açar. Ayrı iki ray düğmesi konmadı. */}
      <Modal transparent visible={addOpen} animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{t('guild.modal.chooseTitle')}</Text>
            <Text style={styles.sheetDesc}>{t('guild.modal.chooseDesc')}</Text>

            <Pressable style={styles.sheetOption} onPress={() => openAdd('/new-guild')}>
              <Text style={styles.sheetOptionTitle}>{t('guild.modal.createOption')}</Text>
              <Text style={styles.sheetOptionDesc}>{t('guild.modal.createOptionDesc')}</Text>
            </Pressable>

            <Pressable style={styles.sheetOption} onPress={() => openAdd('/join-guild')}>
              <Text style={styles.sheetOptionTitle}>{t('guild.modal.joinOption')}</Text>
              <Text style={styles.sheetOptionDesc}>{t('guild.modal.joinOptionDesc')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.bgSidebar,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.layout.panelGap,
    gap: 8,
  },
  sheetTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
  sheetDesc: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 19,
    marginBottom: 4,
  },
  sheetOption: {
    padding: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
    gap: 2,
  },
  sheetOptionTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  sheetOptionDesc: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
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
