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

  /** E4 §2.2: istemci yalnız true iken v2 (parmak izli) yük gönderir. Varsayılan false. */
  get franking(): boolean {
    return this.config.get<boolean>('e2eeFranking') === true;
  }

  /** E5a: şifreli DM yedeği uçları açık mı (uygunluk ayrıca isEligible ile). Varsayılan false. */
  get backup(): boolean {
    return this.config.get<boolean>('e2eeBackup') === true;
  }

  /** E5b: cihazdan cihaza geçmiş aktarımı uçları açık mı (uygunluk ayrıca isEligible ile). Varsayılan false. */
  get transfer(): boolean {
    return this.config.get<boolean>('e2eeTransfer') === true;
  }

  isEligible(userId: string): boolean {
    if (!this.enabled) return false;
    const allow = this.config.get<string[]>('e2eeUserIds') ?? [];
    return allow.length === 0 || allow.includes(userId);
  }
}
