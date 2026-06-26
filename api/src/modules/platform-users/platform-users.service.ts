import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminUserDto } from './dto/admin-user.dto';

/** Genel-bakış sorgusu büyümeyi sınırla — kapalı-test fazında fazlasıyla yeter. */
const MAX_ROWS = 500;

@Injectable()
export class PlatformUsersService {
  constructor(private prisma: PrismaService) {}

  /** GET /admin/users — kayıtlı (silinmemiş) kullanıcılar, en yeni önce. */
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
      createdAt: u.createdAt.toISOString(),
    }));
  }
}
