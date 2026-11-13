import { Prisma } from '@prisma/client';

/**
 * E2 §2.5 🔴 R7 — katılım öncesi şifreli mesaj süzgeci (YALNIZ GROUP_DM). Bir kullanıcıya dönen her yüzeyde,
 * `encrypted = true` VE `createdAt < o kullanıcının ChannelMember.createdAt` olan mesaj YOKTUR. Düz (şifreleme
 * öncesi) eski mesajlar bugünkü gibi görünür. `clearedAt` süzgeciyle aynı kalıp: tek yardımcı, her yüzey buradan.
 *
 * Neden sunucuda: MLS yeni üyenin eski epoch'taki mesajı çözmesine zaten izin vermez; ama şifreli yükü ona
 * hiç göndermemek hem "çözülemedi" gürültüsünü hem üst veri (zaman, yazar) sızıntısını önler.
 */
export function preJoinEncryptedFilter(
  joinedAt: Date | null | undefined,
): Prisma.MessageWhereInput {
  return joinedAt ? { NOT: { encrypted: true, createdAt: { lt: joinedAt } } } : {};
}

/** Aynı kuralın bellek içi karşılığı (zaten yüklenmiş tek mesaj / yanıt alıntısı için). */
export function isHiddenBeforeJoin(
  message: { encrypted: boolean; createdAt: Date },
  joinedAt: Date | null | undefined,
): boolean {
  return !!joinedAt && message.encrypted && message.createdAt < joinedAt;
}

/**
 * Kullanıcının kanala katılım zamanı, yalnız süzgeç GEREKTİĞİNDE (GROUP_DM); diğer kanallarda `null`
 * (süzgeç yok). `channel` MembershipService.requireChannelAccess çıktısıdır.
 */
export async function groupJoinedAt(
  prisma: {
    channelMember: {
      findUnique: (args: {
        where: { channelId_userId: { channelId: string; userId: string } };
        select: { createdAt: true };
      }) => Promise<{ createdAt: Date } | null>;
    };
  },
  channel: { id: string; type: string },
  userId: string,
): Promise<Date | null> {
  if (channel.type !== 'GROUP_DM') return null;
  const member = await prisma.channelMember.findUnique({
    where: { channelId_userId: { channelId: channel.id, userId } },
    select: { createdAt: true },
  });
  return member?.createdAt ?? null;
}
