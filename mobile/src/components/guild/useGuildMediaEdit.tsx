import { useState } from 'react';
import { t } from '@/i18n';
import type { AnimatedTarget } from '@/api/users';
import { guildsApi } from '@/api/guilds';
import { extractErrorMessage } from '@/api/errors';
import { useAuthStore } from '@/stores/auth';
import {
  ANIMATED_GIF_MAX_BYTES,
  AnimatedPickError,
  pickProfileMedia,
  type PickedProfileMedia,
  type ProfileMediaMode,
} from '@/utils/animatedMedia';
import { AnimatedClipSheet } from '@/components/me/AnimatedClipSheet';
import { MediaSourceSheet } from '@/components/me/MediaSourceSheet';

type GuildTarget = Extract<AnimatedTarget, 'GUILD_ICON' | 'GUILD_BANNER'>;

/**
 * Sprint C19 §4.1 — ortam simgesi/afişi seçimi: `profile-edit.tsx`'teki akışın aynısı (seç, konumlandır /
 * kesit seç, yükle). Statik görsel de her zaman `AnimatedClipSheet`ten geçer: sunucu statik girdiyi hareketli
 * bayrağı kapalıyken de kabul eder (C13b), bu yüzden eski PATCH yoluna düşme dalı yok.
 * C22: `pick(target)` önce MediaSourceSheet'i açar (görsel / GIF-video / kaldır); hareketli kapısı
 * sunucudan gelen `animatedAllowed`. `sheet` ekranda bir kez render edilir.
 */
export function useGuildMediaEdit(
  guildId: string,
  onChanged: () => void,
  has: { icon: boolean; banner: boolean },
) {
  const [clip, setClip] = useState<{ media: PickedProfileMedia; target: GuildTarget } | null>(null);
  // choice pencere kapanınca da kalır: seçici ve kaldırma sayfa kapandıktan sonra çalışır
  const [choice, setChoice] = useState<GuildTarget>('GUILD_ICON');
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [error, setError] = useState('');
  const animatedAllowed = useAuthStore((s) => s.user?.animatedAllowed === true);

  function pick(target: GuildTarget) {
    if (clip) return;
    setChoice(target);
    setChoiceOpen(true);
  }

  async function remove() {
    setChoiceOpen(false);
    setError('');
    try {
      if (choice === 'GUILD_ICON') await guildsApi.setIcon(guildId, null);
      else await guildsApi.setBanner(guildId, null);
      onChanged();
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  }

  async function pickFile(mode: ProfileMediaMode) {
    setChoiceOpen(false);
    setError('');
    let media: PickedProfileMedia | null;
    try {
      media = await pickProfileMedia(mode);
    } catch (e) {
      if (e instanceof AnimatedPickError) setError(t(e.key));
      return;
    }
    if (!media) return;
    if (media.kind === 'gif' && media.size > ANIMATED_GIF_MAX_BYTES) {
      setError(t('profile.animated.errorGifSize'));
      return;
    }
    setClip({ media, target: choice });
  }

  const sheet = (
    <>
      <MediaSourceSheet
        visible={choiceOpen}
        title={t(choice === 'GUILD_ICON' ? 'media.source.title.guildIcon' : 'media.source.title.guildBanner')}
        animatedAllowed={animatedAllowed}
        canRemove={choice === 'GUILD_ICON' ? has.icon : has.banner}
        onClose={() => setChoiceOpen(false)}
        onPick={(mode) => void pickFile(mode)}
        onRemove={() => void remove()}
        onAiVideo={(media) => setClip({ media, target: choice })}
      />
      <AnimatedClipSheet
        media={clip?.media ?? null}
        target={clip?.target ?? 'GUILD_ICON'}
        guildId={guildId}
        onClose={() => setClip(null)}
        onDone={() => {
          setClip(null);
          onChanged();
        }}
        onDisabled={() => {
          // Sunucu reddetti (arayüz kapısı ile gerçek arasında fark): sebebi söyle. Kapı sunucudan okunur (C22).
          setClip(null);
          setError(t('profile.animated.disabled'));
        }}
      />
    </>
  );

  return { pick, error, sheet };
}
