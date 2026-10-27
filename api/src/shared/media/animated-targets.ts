import { Guild, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AnimatedTarget } from './animated.constants';

/**
 * C19 — hedef → (tablo, statik alan, hareketli alan) eşlemesi TEK yerde. `ownerId`: kullanıcı hedeflerinde
 * userId, ortam hedeflerinde guildId (public bucket anahtarı `${prefix}/${ownerId}/...` ile aynı kimlik).
 * R7: statik alan (iconUrl/bannerUrl/avatarUrl) yalnız statik kare alır, hareketli içerik ASLA oraya yazılmaz.
 */
export const ANIMATED_TARGET_FIELDS: Record<
  AnimatedTarget,
  { model: 'user' | 'guild'; staticField: string; animatedField: string }
> = {
  AVATAR: { model: 'user', staticField: 'avatarUrl', animatedField: 'avatarAnimatedUrl' },
  BANNER: { model: 'user', staticField: 'bannerUrl', animatedField: 'bannerAnimatedUrl' },
  GUILD_ICON: { model: 'guild', staticField: 'iconUrl', animatedField: 'iconAnimatedUrl' },
  GUILD_BANNER: { model: 'guild', staticField: 'bannerUrl', animatedField: 'bannerAnimatedUrl' },
};

export interface PreviousMedia {
  staticUrl: string | null;
  animatedUrl: string | null;
}

export async function readPreviousMedia(
  prisma: PrismaService,
  target: AnimatedTarget,
  ownerId: string,
): Promise<PreviousMedia> {
  const { model, staticField, animatedField } = ANIMATED_TARGET_FIELDS[target];
  const select = { [staticField]: true, [animatedField]: true };
  const row = (
    model === 'user'
      ? await prisma.user.findUnique({ where: { id: ownerId }, select })
      : await prisma.guild.findUnique({ where: { id: ownerId }, select })
  ) as Record<string, string | null> | null;
  return { staticUrl: row?.[staticField] ?? null, animatedUrl: row?.[animatedField] ?? null };
}

export function writeMedia(
  prisma: PrismaService,
  target: AnimatedTarget,
  ownerId: string,
  staticUrl: string,
  animatedUrl: string | null,
): Promise<User | Guild> {
  const { model, staticField, animatedField } = ANIMATED_TARGET_FIELDS[target];
  const data = { [staticField]: staticUrl, [animatedField]: animatedUrl };
  return model === 'user'
    ? prisma.user.update({ where: { id: ownerId }, data })
    : prisma.guild.update({ where: { id: ownerId }, data });
}
