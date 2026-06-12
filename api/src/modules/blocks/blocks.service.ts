import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { CreateBlockDto } from './dto/create-block.dto';

@Injectable()
export class BlocksService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

  async getBlocks(userId: string) {
    const blocks = await this.prisma.userBlock.findMany({
      where: { blockerId: userId },
      include: { blocked: { select: { id: true, username: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return blocks.map((b) => ({
      user: { id: b.blocked.id, username: b.blocked.username, avatarUrl: b.blocked.avatarUrl },
      since: b.createdAt.toISOString(),
    }));
  }

  async blockUser(blockerId: string, dto: CreateBlockDto) {
    if (blockerId === dto.userId) {
      throw new BadRequestException({ message: 'Kendinizi engelleyemezsiniz.', error: 'CANNOT_BLOCK_SELF' });
    }

    const target = await this.prisma.user.findUnique({
      where: { id: dto.userId, deletedAt: null },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException({ message: 'Kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });
    }

    const existing = await this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId: dto.userId } },
    });
    if (existing) {
      throw new ConflictException({ message: 'Bu kullanıcı zaten engellenmiş.', error: 'ALREADY_BLOCKED' });
    }

    // Transaction: engelle + arkadaşlık sil + bekleyen istekleri iptal
    await this.prisma.$transaction([
      this.prisma.userBlock.create({ data: { blockerId, blockedId: dto.userId } }),
      this.prisma.friendship.deleteMany({
        where: {
          status: 'ACCEPTED',
          OR: [
            { requesterId: blockerId, addresseeId: dto.userId },
            { requesterId: dto.userId, addresseeId: blockerId },
          ],
        },
      }),
      this.prisma.friendship.updateMany({
        where: {
          status: 'PENDING',
          OR: [
            { requesterId: blockerId, addresseeId: dto.userId },
            { requesterId: dto.userId, addresseeId: blockerId },
          ],
        },
        data: { status: 'DECLINED' },
      }),
    ]);
    // Engellenen tarafa sessiz friend.remove (arkadaşsa listeden düşer; "engellendin" sızdırmaz)
    this.realtime.emitToUser(dto.userId, 'friend.remove', { userId: blockerId });
    return null;
  }

  async unblockUser(blockerId: string, targetUserId: string) {
    const block = await this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId: targetUserId } },
    });
    if (!block) {
      throw new NotFoundException({ message: 'Engel bulunamadı.', error: 'BLOCK_NOT_FOUND' });
    }
    await this.prisma.userBlock.delete({ where: { id: block.id } });
    return null;
  }
}
