import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PresenceService } from '../../shared/presence/presence.service';
import { AdminUserDto } from './dto/admin-user.dto';

/** Genel-bakış sorgusu büyümeyi sınırla — kapalı-test fazında fazlasıyla yeter. */
const MAX_ROWS = 500;

@Injectable()
export class PlatformUsersService {
  constructor(
    private prisma: PrismaService,
    private presence: PresenceService,
  ) {}

  /**
   * GET /admin/users — kayıtlı (silinmemiş) kullanıcılar, en yeni önce.
   * Çevrimiçi durumu bellek-içi PresenceService'ten okunur (V1 tek-instance;
   * çok-instance'a geçilince bu satır Redis presence'a bağlanır — bkz. presence.service).
   */
  async findAll(): Promise<AdminUserDto[]> {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
      select: {
        id: true,
        username: true,
        email: true,
        emailVerifiedAt: true,
        isMinor: true,
        isModerator: true,
        verificationStatus: true,
        createdAt: true,
        platformInvite: { select: { code: true } },
        _count: { select: { ownedGuilds: true, memberships: true, messages: true } },
        sessions: { orderBy: { lastActiveAt: 'desc' }, take: 1, select: { lastActiveAt: true } },
      },
    });

    return users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      emailVerified: u.emailVerifiedAt !== null,
      isMinor: u.isMinor,
      isModerator: u.isModerator,
      verificationStatus: u.verificationStatus,
      invitedViaCode: u.platformInvite?.code ?? null,
      presence: this.presence.getStatus(u.id),
      ownedGuildCount: u._count.ownedGuilds,
      membershipCount: u._count.memberships,
      messageCount: u._count.messages,
      lastActiveAt: u.sessions[0]?.lastActiveAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    }));
  }
}
