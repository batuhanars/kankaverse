import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlatformInviteDto, PlatformInviteDto } from './dto/platform-invite.dto';
import { generateShortCode } from '../../common/utils/short-code.util';
import { PlatformInvite } from '@prisma/client';

function toPlatformInviteDto(invite: PlatformInvite): PlatformInviteDto {
  return {
    id: invite.id,
    code: invite.code,
    note: invite.note ?? null,
    maxUses: invite.maxUses ?? null,
    uses: invite.uses,
    expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
    disabledAt: invite.disabledAt ? invite.disabledAt.toISOString() : null,
    createdAt: invite.createdAt.toISOString(),
  };
}

@Injectable()
export class PlatformInvitesService {
  constructor(private prisma: PrismaService) {}

  /** POST /admin/platform-invites — davet oluştur */
  async create(creatorId: string, dto: CreatePlatformInviteDto): Promise<PlatformInviteDto> {
    const code = await this.generateUniqueCode();
    const expiresAt = dto.expiresInHours
      ? new Date(Date.now() + dto.expiresInHours * 60 * 60 * 1000)
      : null;

    const invite = await this.prisma.platformInvite.create({
      data: {
        code,
        note: dto.note ?? null,
        maxUses: dto.maxUses ?? null,
        expiresAt,
        creatorId,
      },
    });

    return toPlatformInviteDto(invite);
  }

  /** GET /admin/platform-invites — tüm davetler (aktif + geçmiş) */
  async findAll(): Promise<PlatformInviteDto[]> {
    const invites = await this.prisma.platformInvite.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return invites.map(toPlatformInviteDto);
  }

  /** DELETE /admin/platform-invites/:id — soft-iptal */
  async disable(id: string): Promise<null> {
    const invite = await this.prisma.platformInvite.findUnique({ where: { id } });
    if (!invite) {
      throw new NotFoundException({ message: 'Davet bulunamadı.', error: 'NOT_FOUND' });
    }

    await this.prisma.platformInvite.update({
      where: { id },
      data: { disabledAt: new Date() },
    });

    return null;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** 8-char URL-safe kod üret; varsa yenile (en fazla 5 deneme). */
  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateShortCode(8);
      const existing = await this.prisma.platformInvite.findUnique({ where: { code } });
      if (!existing) return code;
    }
    // Olağanüstü durum — pratikte neredeyse imkânsız
    return generateShortCode(8);
  }
}
