import { useState } from 'react';
import { t } from '@/i18n';
import type { AnimatedTarget } from '@/api/users';
import {
  ANIMATED_GIF_MAX_BYTES,
  AnimatedPickError,
  pickProfileMedia,
  type PickedProfileMedia,
} from '@/utils/animatedMedia';
import { AnimatedClipSheet } from '@/components/me/AnimatedClipSheet';

type GuildTarget = Extract<AnimatedTarget, 'GUILD_ICON' | 'GUILD_BANNER'>;

/**
 * Sprint C19 §4.1 — ortam simgesi/afişi seçimi: `profile-edit.tsx`'teki akışın aynısı (seç, konumlandır /
 * kesit seç, yükle). Statik görsel de her zaman `AnimatedClipSheet`ten geçer: sunucu statik girdiyi hareketli
 * bayrağı kapalıyken de kabul eder (C13b), bu yüzden eski PATCH yoluna düşme dalı yok.
 * `sheet` ekranda bir kez render edilir; `pick(target)` seçiciyi açar.
 */
export function useGuildMediaEdit(guildId: string, onChanged: () => void) {
  const [clip, setClip] = useState<{ media: PickedProfileMedia; target: GuildTarget } | null>(null);
  const [animatedOff, setAnimatedOff] = useState(false);
  const [error, setError] = useState('');

  async function pick(target: GuildTarget) {
    if (clip) return;
    setError('');
    let media: PickedProfileMedia | null;
    try {
      media = await pickProfileMedia(!animatedOff);
    } catch (e) {
      if (e instanceof AnimatedPickError) setError(t(e.key));
      return;
    }
    if (!media) return;
    if (media.kind === 'gif' && media.size > ANIMATED_GIF_MAX_BYTES) {
      setError(t('profile.animated.errorGifSize'));
      return;
    }
    setClip({ media, target });
  }

  const sheet = (
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
        // Bayrak kapalı: bu oturumda yalnız statik görsel seçilir (C8 UPLOADS_DISABLED deseni).
        setClip(null);
        setAnimatedOff(true);
        setError(t('profile.animated.disabled'));
      }}
    />
  );

  return { pick, error, sheet };
}
