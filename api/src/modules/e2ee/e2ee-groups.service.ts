import { ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { E2eeChannelService } from './e2ee-channel.service';
import { E2eeDevicesService } from './e2ee-devices.service';
import { E2eeNotifyService } from './e2ee-notify.service';
import { CreateGroupDto, PostCommitDto, WelcomeItemDto } from './dto/e2ee.dto';
import { E2EE_COMMITS_PAGE, E2EE_GROUP_ID_BYTES } from './e2ee.constants';
import { E2EE_ERRORS, fromB64, toB64 } from './e2ee.util';

/** MLS grubunun sunucu tarafı: yalnız sıra (epoch) ve opak yükler. İçerik/MLS ayrıştırma YOK. */
@Injectable()
export class E2eeGroupsService {
  constructor(
    private prisma: PrismaService,
    private channels: E2eeChannelService,
    private devices: E2eeDevicesService,
    private notify: E2eeNotifyService,
  ) {}

  /**
   * Kanal durumu. Cihazlar İPTAL EDİLMİŞLER DAHİL (Rev.1 §3.3 geçmiş commit kuralı). GROUP_DM'de (E2 §2.3)
   * ek olarak eski üyeler (`formerMembers`: ayrılma zamanı + kayıtlı TÜM cihazları; yaprakları grupta kalmış
   * olabilir, doğrulama onları tanımalı) ve üyelerin katılım zamanı (`joinedAt`) döner. 1-1'de `formerMembers` hep [].
   */
  async getState(userId: string, channelId: string) {
    const { isOneToOneDm, isGroupDm, memberIds, joinedAt } = await this.channels.access(
      userId,
      channelId,
    );
    const encryptable = isOneToOneDm || isGroupDm === true;
    const group = encryptable
      ? await this.prisma.e2eeGroup.findUnique({ where: { channelId } })
      : null;
    const former = isGroupDm === true ? await this.listFormerMembers(channelId) : [];
    const devices = encryptable
      ? await this.prisma.e2eeDevice.findMany({
          where: { userId: { in: [...memberIds, ...former.map((f) => f.userId)] } },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    return {
      encrypted: group !== null,
      epoch: group?.epoch ?? null,
      groupId: group ? toB64(group.groupId) : null,
      createdAt: group ? group.createdAt.toISOString() : null,
      members: encryptable
        ? memberIds.map((id) => ({
            userId: id,
            joinedAt: joinedAt?.get(id)?.toISOString() ?? null,
            devices: this.deviceViews(devices, id),
          }))
        : [],
      formerMembers: former.map((f) => ({
        userId: f.userId,
        leftAt: f.leftAt.toISOString(),
        devices: this.deviceViews(devices, f.userId),
      })),
    };
  }

  private listFormerMembers(channelId: string) {
    return this.prisma.e2eeFormerMember.findMany({
      where: { channelId },
      orderBy: { leftAt: 'asc' },
    });
  }

  private deviceViews(
    devices: { id: string; userId: string; signatureKey: Uint8Array; revokedAt: Date | null }[],
    userId: string,
  ) {
    return devices
      .filter((d) => d.userId === userId)
      .map((d) => ({
        deviceId: d.id,
        signatureKey: toB64(d.signatureKey),
        revokedAt: d.revokedAt ? d.revokedAt.toISOString() : null,
      }));
  }

  /** Grubu kurar (epoch 0 → 1). Yarışı kaybeden 409 E2EE_GROUP_EXISTS alır. Tek transaction. */
  async createGroup(user: RequestUser, channelId: string, dto: CreateGroupDto) {
    const memberIds = await this.channels.requireDmMembers(user.id, channelId);
    this.channels.assertAllEligible(memberIds);
    const device = await this.devices.requireActiveDevice(user);
    const groupId = fromB64(dto.groupId);
    if (groupId.length !== E2EE_GROUP_ID_BYTES) {
      throw E2EE_ERRORS.invalidPayload('Grup kimliği 32 bayt olmalı.');
    }
    await this.assertEnoughMembersHaveDevice(memberIds);
    const targets = await this.resolveWelcomeTargets(dto.welcomes, memberIds, device.id);
    if ((await this.prisma.e2eeGroup.count({ where: { channelId } })) > 0) throw this.groupExists();

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.e2eeGroup.create({
          data: { channelId, groupId, epoch: 1, createdById: device.id },
        });
        await tx.e2eeHandshake.create({
          data: { channelId, epoch: 0, senderDeviceId: device.id, commit: fromB64(dto.commit) },
        });
        await tx.e2eeWelcome.createMany({ data: this.welcomeRows(channelId, 1, dto.welcomes) });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw this.groupExists();
      }
      throw err;
    }
    this.notify.welcome([...targets.values()], channelId);
    return { epoch: 1 };
  }

  /**
   * 🔴 R7 — epoch kapısı. Kabul ⇔ `epoch === group.epoch`, tek satır koşullu UPDATE (satır kilidi: eşzamanlı
   * iki commit'ten biri kazanır, diğeri 0 satır görür). Kabul + handshake + welcome TEK transaction.
   */
  async postCommit(user: RequestUser, channelId: string, dto: PostCommitDto) {
    const memberIds = await this.channels.requireDmMembers(user.id, channelId);
    const device = await this.devices.requireActiveDevice(user);
    const welcomes = dto.welcomes ?? [];
    const targets = await this.resolveWelcomeTargets(welcomes, memberIds, device.id);

    const accepted = await this.prisma.$transaction(async (tx) => {
      const res = await tx.e2eeGroup.updateMany({
        where: { channelId, epoch: dto.epoch },
        data: { epoch: { increment: 1 } },
      });
      if (res.count === 0) return false;
      await tx.e2eeHandshake.create({
        data: {
          channelId,
          epoch: dto.epoch,
          senderDeviceId: device.id,
          commit: fromB64(dto.commit),
        },
      });
      await tx.e2eeWelcome.createMany({
        data: this.welcomeRows(channelId, dto.epoch + 1, welcomes),
      });
      return true;
    });
    if (!accepted) throw await this.epochConflict(channelId);

    void this.notify.commit(channelId, dto.epoch);
    if (targets.size > 0) this.notify.welcome([...targets.values()], channelId);
    return { epoch: dto.epoch + 1 };
  }

  /** Epoch sırasıyla en çok 100; `since` dahil (cihazın bulunduğu epoch'tan itibaren). */
  async listCommits(userId: string, channelId: string, since: number) {
    await this.channels.access(userId, channelId);
    const rows = await this.prisma.e2eeHandshake.findMany({
      where: { channelId, epoch: { gte: since } },
      orderBy: { epoch: 'asc' },
      take: E2EE_COMMITS_PAGE,
    });
    return rows.map((r) => ({
      epoch: r.epoch,
      commit: toB64(r.commit),
      senderDeviceId: r.senderDeviceId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listWelcomes(user: RequestUser) {
    const device = await this.devices.requireActiveDevice(user);
    const rows = await this.prisma.e2eeWelcome.findMany({
      where: { targetDeviceId: device.id, deliveredAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((w) => ({
      id: w.id,
      channelId: w.channelId,
      epoch: w.epoch,
      welcome: toB64(w.welcome),
    }));
  }

  async ackWelcome(user: RequestUser, welcomeId: string): Promise<null> {
    const device = await this.devices.requireActiveDevice(user);
    const res = await this.prisma.e2eeWelcome.updateMany({
      where: { id: welcomeId, targetDeviceId: device.id, deliveredAt: null },
      data: { deliveredAt: new Date() },
    });
    if (res.count === 0) {
      throw new HttpException(
        { message: 'Welcome bulunamadı.', error: 'E2EE_WELCOME_NOT_FOUND' },
        HttpStatus.NOT_FOUND,
      );
    }
    return null;
  }

  private welcomeRows(channelId: string, epoch: number, welcomes: WelcomeItemDto[]) {
    return welcomes.map((w) => ({
      channelId,
      epoch,
      targetDeviceId: w.deviceId,
      welcome: fromB64(w.welcome),
    }));
  }

  /** Welcome hedefleri: tekrarsız, ETKİN, kanal üyelerine ait ve gönderenin kendisi değil. deviceId → userId. */
  private async resolveWelcomeTargets(
    welcomes: WelcomeItemDto[],
    memberIds: string[],
    senderDeviceId: string,
  ): Promise<Map<string, string>> {
    const ids = welcomes.map((w) => w.deviceId);
    const devices = await this.prisma.e2eeDevice.findMany({
      where: { id: { in: ids }, revokedAt: null, userId: { in: memberIds } },
      select: { id: true, userId: true },
    });
    if (new Set(ids).size !== ids.length || devices.length !== ids.length) {
      throw E2EE_ERRORS.invalidPayload('Welcome hedefleri geçersiz.');
    }
    if (ids.includes(senderDeviceId)) {
      throw E2EE_ERRORS.invalidPayload('Gönderen cihaza Welcome gönderilemez.');
    }
    return new Map(devices.map((d) => [d.id, d.userId]));
  }

  /**
   * §2.2 / E2 §0: grup en az İKİ üyenin (gönderen dahil) etkin cihazıyla kurulur. 1-1'de bu "iki üyenin de
   * cihazı var" demektir (E1 kuralı aynen); grupta cihazsız üye engel DEĞİL, cihaz kaydedince sonradan eklenir.
   * Gönderenin kendi etkin cihazı çağıran tarafta (`requireActiveDevice`) zaten doğrulanır.
   */
  private async assertEnoughMembersHaveDevice(memberIds: string[]): Promise<void> {
    const active = await this.prisma.e2eeDevice.findMany({
      where: { userId: { in: memberIds }, revokedAt: null },
      select: { userId: true },
      distinct: ['userId'],
    });
    if (active.length < 2) throw E2EE_ERRORS.notEligible();
  }

  private groupExists() {
    return new ConflictException({
      message: 'Bu sohbetin şifreli grubu zaten kurulmuş.',
      error: 'E2EE_GROUP_EXISTS',
    });
  }

  private async epochConflict(channelId: string) {
    const group = await this.prisma.e2eeGroup.findUnique({ where: { channelId } });
    if (!group) {
      return new HttpException(
        { message: 'Bu sohbetin şifreli grubu yok.', error: 'E2EE_GROUP_NOT_FOUND' },
        HttpStatus.NOT_FOUND,
      );
    }
    return new HttpException(
      {
        message: 'Grup başka bir değişiklikle ilerledi, güncelleyip yeniden dene.',
        error: 'E2EE_EPOCH_CONFLICT',
        currentEpoch: group.epoch,
      },
      HttpStatus.CONFLICT,
    );
  }
}
