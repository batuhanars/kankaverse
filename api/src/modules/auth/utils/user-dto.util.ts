import { User } from '@prisma/client';
import { effectiveQuickReactions } from '../../../common/quick-reactions';

/** Prisma User → istemciye dönen UserDto. passwordHash/totpSecret vb. hassas alanlar ASLA dahil edilmez. */
export function toUserDto(user: User, animatedAllowed: boolean, aiVideoAllowed = false) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl ?? null,
    // C13: hareketli WebP adresleri (avatarUrl/bannerUrl statik kare kalır → eski istemciler kırılmaz)
    avatarAnimatedUrl: user.avatarAnimatedUrl ?? null,
    bannerAnimatedUrl: user.bannerAnimatedUrl ?? null,
    bio: user.bio,
    bannerColor: user.bannerColor ?? null,
    dmPolicy: user.dmPolicy,
    // C12: okundu bilgisi paylaşımı (karşılıklı). İstemci Gizlilik ekranında kendi durumunu okur.
    readReceipts: user.readReceipts,
    // C24: etkin hızlı tepki şeridi (kayıtlı ya da varsayılan beşli).
    quickReactions: effectiveQuickReactions(user.quickReactions),
    isMinor: user.isMinor,
    verificationStatus: user.verificationStatus,
    createdAt: user.createdAt.toISOString(),
    emailVerified: user.emailVerifiedAt !== null,
    twoFactorEnabled: user.twoFactorEnabled,
    isModerator: user.isModerator,
    friendCode: user.friendCode,
    // C22: hareketli yükleme kapısı (AnimatedMediaService.canCreateAnimated). İstemci arayüzü içindir; sunucu yine otoritedir.
    animatedAllowed,
    // C14: yapay zeka video kapısı (canUseAiVideo, guard ile AYNI fonksiyon). Arayüz ipucu; sunucu otoritedir.
    aiVideoAllowed,
  };
}
