import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { guildsApi, type GuildSummaryDto } from '@/api/guilds';
import type { ChannelSummaryDto } from '@/api/channels';
import type { DmChannelDto } from '@/api/dm';
import { GuildRail, type RailSelection } from '@/components/home/GuildRail';
import { DmSidebar } from '@/components/home/DmSidebar';
import { ChannelSidebar } from '@/components/home/ChannelSidebar';
import { theme } from '@/theme';

// Sprint M1a contract §2 — Ana Sayfa (rail + sidebar), tek ekran, kalıcı. Bu dosya SADECE compose
// eder (web/CLAUDE.md "view sadece compose eder" ilkesi mobilde de izlendi); veri çekme/render
// mantığı GuildRail/DmSidebar/ChannelSidebar'a dağılmış durumda.
export default function HomeScreen() {
  const router = useRouter();
  const [selection, setSelection] = useState<RailSelection>({ type: 'dm' });

  const [guildState, setGuildState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [guilds, setGuilds] = useState<GuildSummaryDto[]>([]);

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

  function retryGuilds() {
    setGuildState('loading');
    fetchGuilds();
  }

  const selectedGuildName = useMemo(() => {
    if (selection.type !== 'guild') return '';
    return guilds.find((g) => g.id === selection.id)?.name ?? '';
  }, [guilds, selection]);

  function openChannel(channel: ChannelSummaryDto) {
    router.push({ pathname: '/channel/[id]', params: { id: channel.id, name: channel.name ?? '' } });
  }

  function openDm(channel: DmChannelDto) {
    if (channel.type === 'DM') {
      router.push({
        pathname: '/dm/[id]',
        params: {
          id: channel.id,
          title: channel.otherUser.username,
          avatarUrl: channel.otherUser.avatarUrl ?? '',
          kind: 'dm',
          canMessage: String(channel.canMessage),
          selfBlocked: String(channel.selfBlocked),
        },
      });
      return;
    }
    const name = channel.name ?? channel.members.map((m) => m.username).slice(0, 3).join(', ');
    router.push({ pathname: '/dm/[id]', params: { id: channel.id, title: name, kind: 'group' } });
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
      />
      {selection.type === 'dm' ? (
        <DmSidebar onOpenDm={openDm} onOpenRequests={() => router.push('/dm-requests')} />
      ) : (
        // key: ortam değişince sidebar TAM yeniden mount olur (state 'loading'a resetlenir —
        // aksi halde guildId değişince önceki ortamın kanal listesi kısa süre ekranda kalırdı).
        <ChannelSidebar key={selection.id} guildId={selection.id} guildName={selectedGuildName} onOpenChannel={openChannel} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.colors.bgContent,
  },
});
