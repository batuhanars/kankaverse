import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * §2.2 uygunluk: bayrak açık VE (liste boş VEYA kullanıcı listede).
 * 🔴 Prod'a liste dolu gider; boş liste = herkes, §0 kapısından önce YASAK.
 */
@Injectable()
export class E2eeFlagService {
  constructor(private config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<boolean>('e2eeEnabled') === true;
  }

  isEligible(userId: string): boolean {
    if (!this.enabled) return false;
    const allow = this.config.get<string[]>('e2eeUserIds') ?? [];
    return allow.length === 0 || allow.includes(userId);
  }
}
