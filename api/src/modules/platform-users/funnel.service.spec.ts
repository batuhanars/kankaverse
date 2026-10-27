import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { FunnelService } from './funnel.service';
import { FunnelController } from './funnel.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';

const prismaMock = { $queryRaw: jest.fn() };
const service = new FunnelService(prismaMock as never);

describe('FunnelService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('bigint satırlarını number a çevirir ve şekli kurar', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      {
        registered: BigInt(49), joined_guild: BigInt(17), sent_message: BigInt(15),
        returned_next_day: BigInt(18), returned_after_7_days: BigInt(11), active_on_3_days: BigInt(16),
        active_last_7_days: BigInt(8), active_last_30_days: BigInt(14), registered_last_7_days: BigInt(3),
      },
    ]);
    const res = await service.getFunnel(30);
    expect(res.cohortDays).toBe(30);
    expect(res.steps).toEqual({
      registered: 49, joinedGuild: 17, sentMessage: 15,
      returnedNextDay: 18, returnedAfter7Days: 11, activeOn3Days: 16,
    });
    expect(res.activity).toEqual({ activeLast7Days: 8, activeLast30Days: 14, registeredLast7Days: 3 });
    expect(typeof res.generatedAt).toBe('string');
  });

  it('boş sonuçta sıfır döner', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    const res = await service.getFunnel(0);
    expect(res.steps.registered).toBe(0);
  });

  it('cohortDays: yok/boş=0, izinli değerler geçer, diğerleri 400', () => {
    expect(service.parseCohortDays()).toBe(0);
    expect(service.parseCohortDays('')).toBe(0);
    expect(service.parseCohortDays('90')).toBe(90);
    for (const bad of ['7', '-1', 'abc', '30.5']) {
      expect(() => service.parseCohortDays(bad)).toThrow(BadRequestException);
    }
  });

  it('uç JwtAuthGuard + PlatformAdminGuard ile korunur', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, FunnelController);
    expect(guards).toEqual([JwtAuthGuard, PlatformAdminGuard]);
  });
});
