import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FunnelDto } from './dto/funnel.dto';
import { funnelQuery } from './funnel.query';

export const COHORT_DAYS_ALLOWED = [0, 30, 90];

type FunnelRow = Record<string, bigint | number>;

@Injectable()
export class FunnelService {
  constructor(private prisma: PrismaService) {}

  /** Yok/boş = 0 (tümü); izinli değerler dışında 400. */
  parseCohortDays(raw?: string): number {
    if (raw === undefined || raw === '') return 0;
    const n = Number(raw);
    if (!COHORT_DAYS_ALLOWED.includes(n)) {
      throw new BadRequestException('Geçersiz kohort aralığı.');
    }
    return n;
  }

  /** GET /admin/funnel — yalnız toplam sayılar (kullanıcı bazlı veri dönmez). */
  async getFunnel(cohortDays: number): Promise<FunnelDto> {
    const rows = await this.prisma.$queryRaw<FunnelRow[]>(funnelQuery(cohortDays));
    const row = rows[0] ?? {};
    const n = (key: string) => Number(row[key] ?? 0);
    return {
      cohortDays,
      generatedAt: new Date().toISOString(),
      steps: {
        registered: n('registered'),
        joinedGuild: n('joined_guild'),
        sentMessage: n('sent_message'),
        returnedNextDay: n('returned_next_day'),
        returnedAfter7Days: n('returned_after_7_days'),
        activeOn3Days: n('active_on_3_days'),
      },
      activity: {
        activeLast7Days: n('active_last_7_days'),
        activeLast30Days: n('active_last_30_days'),
        registeredLast7Days: n('registered_last_7_days'),
      },
    };
  }
}
