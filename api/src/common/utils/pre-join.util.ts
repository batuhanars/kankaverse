import { Prisma } from '@prisma/client';

/**
 * E2 §2.5 + C65 🔴 R7 — katılım öncesi şifreli mesaj süzgeci (YALNIZ GROUP_DM). Bir kullanıcıya dönen her yüzeyde
 * şu mesaj YOKTUR: `encrypted = true` VE `createdAt < joinedAt` VE hiçbir geçmiş üyelik döneminin `[from, to]`
 * aralığında DEĞİL. Yani kullanıcı üye olduğu HER dönemin mesajını görür; dönemler ARASINDA (dışarıdayken) atılmış
 * şifreli mesaj görünmez. Düz (şifreleme öncesi) mesajlar bugünkü gibi görünür. Tek yardımcı, her yüzey buradan.
 *
 * Neden sunucuda: MLS yeni üyenin eski epoch'taki mesajı çözmesine zaten izin vermez; ama şifreli yükü ona
 * hiç göndermemek hem "çözülemedi" gürültüsünü hem üst veri (zaman, yazar) sızıntısını önler.
 */
export interface GroupVisibility {
  /** Güncel dönemin başı (aktif üye: ChannelMember.createdAt; eski üye: departure.joinedAt). */
  joinedAt: Date;
  /** Önceki üyelik dönemleri (kapalı aralıklar). Geçmiş dönemi olmayanda boş. */
  periods: { from: Date; to: Date }[];
}

type VisibilityArg = GroupVisibility | null | undefined;

export function preJoinEncryptedFilter(visibility: VisibilityArg): Prisma.MessageWhereInput {
  if (!visibility) return {};
  const { joinedAt, periods } = visibility;
  if (periods.length === 0) return { NOT: { encrypted: true, createdAt: { lt: joinedAt } } };
  // Gizli = şifreli VE joinedAt öncesi VE hiçbir dönem aralığında değil (dönem dışlaması açık yazılır).
  return {
    NOT: {
      encrypted: true,
      createdAt: { lt: joinedAt },
      NOT: periods.map((p) => ({ createdAt: { gte: p.from, lte: p.to } })),
    },
  };
}

/** Aynı kuralın bellek içi karşılığı (zaten yüklenmiş tek mesaj / yanıt alıntısı için). */
export function isHiddenBeforeJoin(
  message: { encrypted: boolean; createdAt: Date },
  visibility: VisibilityArg,
): boolean {
  if (!visibility || !message.encrypted || message.createdAt >= visibility.joinedAt) return false;
  return !visibility.periods.some((p) => message.createdAt >= p.from && message.createdAt <= p.to);
}

type VisibilityPrisma = {
  channelMember: {
    findUnique: (args: {
      where: { channelId_userId: { channelId: string; userId: string } };
      select: { createdAt: true };
    }) => Promise<{ createdAt: Date } | null>;
  };
  groupDmPastPeriod: {
    findMany: (args: {
      where: { channelId: string | { in: string[] }; userId: string };
      select: { channelId?: true; joinedAt: true; leftAt: true };
    }) => Promise<{ channelId?: string; joinedAt: Date; leftAt: Date }[]>;
  };
};

/** `GroupDmPastPeriod` satırlarını süzgeç dönemlerine çevirir. */
export function toPeriods(rows: { joinedAt: Date; leftAt: Date }[]): GroupVisibility['periods'] {
  return rows.map((r) => ({ from: r.joinedAt, to: r.leftAt }));
}

/**
 * Kullanıcının grup görünürlüğü, yalnız süzgeç GEREKTİĞİNDE (GROUP_DM); diğer kanallarda `null` (süzgeç yok).
 * `channel` MembershipService.requireChannelAccess çıktısıdır. `joinedAtOverride`: eski üyede departure.joinedAt
 * (üyelik satırı yok). Dönem sorgusu üyelik sorgusuyla paralel çalışır; dönem satırı yoksa sonuç eski davranışla
 * bit-bit aynıdır (`periods: []`).
 */
export async function groupVisibility(
  prisma: VisibilityPrisma,
  channel: { id: string; type: string },
  userId: string,
  joinedAtOverride?: Date,
): Promise<GroupVisibility | null> {
  if (channel.type !== 'GROUP_DM') return null;
  const [member, rows] = await Promise.all([
    joinedAtOverride
      ? Promise.resolve({ createdAt: joinedAtOverride })
      : prisma.channelMember.findUnique({
          where: { channelId_userId: { channelId: channel.id, userId } },
          select: { createdAt: true },
        }),
    prisma.groupDmPastPeriod.findMany({
      where: { channelId: channel.id, userId },
      select: { joinedAt: true, leftAt: true },
    }),
  ]);
  if (!member) return null;
  return { joinedAt: member.createdAt, periods: toPeriods(rows ?? []) };
}
