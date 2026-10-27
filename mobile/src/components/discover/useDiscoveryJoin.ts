import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { discoveryApi } from '@/api/discovery';
import { extractErrorCode, extractErrorMessage } from '@/api/errors';

/**
 * Sprint C18 §1 — Keşfet'ten katılma akışı (Keşfet ekranı + ana ekran öneri bloğu ortak kullanır).
 *
 * 🔴 T&S: yaş, ban ve zaten-üye kapıları SUNUCUDA (`join-discovery`). Burada hiçbir kapı kurulmaz;
 * ret olursa kullanıcıya sunucunun Türkçe `message`'ı gösterilir. Katılma sonrası yönlendirme
 * `join-guild.tsx` ile aynı: ana ekrana `joinedGuildId` verilir, ray tazelenir ve ortam seçilir.
 */
export function useDiscoveryJoin() {
  const router = useRouter();
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  // State güncellemesi asenkron; ikinci dokunuşu ref ile senkron yutarız.
  const busy = useRef(false);

  function goToGuild(guildId: string) {
    router.replace({ pathname: '/(app)/(tabs)/home', params: { joinedGuildId: guildId } });
  }

  async function join(guildId: string) {
    if (busy.current) return;
    busy.current = true;
    setJoiningId(guildId);
    setError('');
    try {
      const guild = await discoveryApi.joinDiscovery(guildId);
      goToGuild(guild.id);
    } catch (e) {
      // ALREADY_MEMBER hata değil: kullanıcı zaten oradaysa ortama götürülür (join-guild ile aynı).
      if (extractErrorCode(e) === 'ALREADY_MEMBER') {
        goToGuild(guildId);
      } else {
        setError(extractErrorMessage(e));
      }
    } finally {
      busy.current = false;
      setJoiningId(null);
    }
  }

  return { joiningId, error, join, goToGuild };
}
