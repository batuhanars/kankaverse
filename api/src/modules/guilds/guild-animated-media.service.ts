import { Injectable } from '@nestjs/common';
import { AnimatedMediaService } from '../../shared/media/animated-media.service';
import { PresignGuildAnimatedDto } from './dto/presign-guild-animated.dto';
import { ProcessAnimatedDto } from '../../shared/media/dto/animated.dto';
import { GuildsService, toGuildDto } from './guilds.service';

/**
 * C19 — ortam simgesi/afişi için C13 işleme hattının ortam karşılığı. Yetki: yalnız OWNER
 * (`requireOwner`), ardından hat `ownerId = guildId` ile çalışır; hareketli kapı (`canCreateAnimated`)
 * işlemi yapan kullanıcıya göre sorulur. Statik içerik `iconUrl`/`bannerUrl`'e, hareketli içerik ayrı alana yazılır.
 */
@Injectable()
export class GuildAnimatedMediaService {
  constructor(
    private guilds: GuildsService,
    private animated: AnimatedMediaService,
  ) {}

  /** POST /guilds/:id/animated/presign — özel bucket staging (`animated-staging/<guildId>/...`). */
  async presign(userId: string, guildId: string, dto: PresignGuildAnimatedDto) {
    await this.guilds.requireOwner(userId, guildId);
    return this.animated.presign(guildId, dto.contentType, dto.size, userId);
  }

  /** POST /guilds/:id/icon/process | /banner/process — işle, güncel GuildDto'yu dön. */
  async process(
    userId: string,
    guildId: string,
    target: 'GUILD_ICON' | 'GUILD_BANNER',
    dto: ProcessAnimatedDto,
  ) {
    await this.guilds.requireOwner(userId, guildId);
    const guild = await this.animated.process(guildId, target, dto, userId);
    return toGuildDto(guild);
  }
}
