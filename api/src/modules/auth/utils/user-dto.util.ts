import { User } from '@prisma/client';

/** Prisma User → istemciye dönen UserDto. passwordHash/totpSecret vb. hassas alanlar ASLA dahil edilmez. */
export function toUserDto(user: User) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
    isMinor: user.isMinor,
    verificationStatus: user.verificationStatus,
    createdAt: user.createdAt.toISOString(),
    emailVerified: user.emailVerifiedAt !== null,
    twoFactorEnabled: user.twoFactorEnabled,
    friendCode: user.friendCode,
  };
}
